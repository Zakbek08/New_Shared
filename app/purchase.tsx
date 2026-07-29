/**
 * Screen 3 — Start a purchase.
 *
 * The home screen for a returning user, and the only screen most people will ever use.
 * Four decisions: where, how much, what kind of thing, and how you are paying. The last
 * one matters more than it looks — a mobile-wallet bonus turns on exactly the difference
 * between tapping a phone and tapping the card.
 *
 * Nothing is calculated here. `recommend()` runs the classifier and the pure engine, and
 * this screen reads the clock once, at its edge, and passes the instant down. That is
 * what makes the answer reproducible.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { CATEGORIES } from '@/domain/categories';
import { PAYMENT_METHOD_LABELS } from '@/domain/enums';
import { useLastResult } from '@/features/local/LastResult';
import { useLocalStore } from '@/features/local/LocalStore';
import { recommend } from '@/features/local/recommend';
import { findMarketCard } from '@/data/marketCards';
import type { PaymentMethod } from '@/types/database';

/**
 * The payment methods worth offering.
 *
 * The full enum has nine members; six of them make no difference to any rate in the
 * catalog, and a screen of options that change nothing is noise. `manual_entry`,
 * `issuer_travel_portal` and `other` are reachable through "Something else", which maps
 * to `other` — honest about being unmodelled rather than pretending to a distinction.
 */
const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'physical_card',
  'contactless_card',
  'apple_pay',
  'google_pay',
  'other',
];

export default function PurchaseScreen() {
  const router = useRouter();
  const { profile, wallet } = useLocalStore();
  const { setLast } = useLastResult();

  const [merchant, setMerchant] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [channel, setChannel] = useState<'in_store' | 'online'>('in_store');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('physical_card');
  const [error, setError] = useState<string | null>(null);

  const cards = useMemo(
    () => wallet.cardIds.map(findMarketCard).filter((card) => card !== null),
    [wallet.cardIds],
  );

  const submit = () => {
    const amountUsd = Number.parseFloat(amount.replace(/[^0-9.]/g, ''));

    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setError('Enter how much you are spending, as a number.');
      return;
    }
    if (categoryId === null) {
      setError('Choose what kind of purchase this is.');
      return;
    }

    setError(null);

    const input = {
      merchant: merchant.trim() === '' ? 'this purchase' : merchant.trim(),
      amountUsd,
      categoryId,
      channel,
      paymentMethod,
    };

    // The clock is read here, once, and handed to the engine. The engine never reads it.
    const outcome = recommend(wallet, input, new Date());

    setLast({ ...outcome, input });
    router.push('/result');
  };

  return (
    <Screen scroll accessibilityLabel="Start a purchase" testID="purchase-screen">
      <VStack gap="xl">
        <VStack gap="xs">
          <Text variant="title1" accessibilityRole="header">
            Start a purchase
          </Text>
          <Text variant="body" tone="secondary">
            {profile === null
              ? 'Tell WalletWise what you are buying.'
              : `Hello ${profile.name.split(' ')[0]}. Tell WalletWise what you are buying and it will pick the best of your ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}.`}
          </Text>
        </VStack>

        <VStack gap="lg">
          <TextField
            label="Where are you buying?"
            value={merchant}
            onChangeText={setMerchant}
            hint="Optional — it appears on the answer so you can tell one purchase from another."
            autoCapitalize="words"
            maxLength={80}
            testID="purchase-merchant"
          />

          <TextField
            label="How much?"
            value={amount}
            onChangeText={setAmount}
            hint="In US dollars."
            keyboardType="decimal-pad"
            inputMode="decimal"
            required
            maxLength={12}
            testID="purchase-amount"
          />
        </VStack>

        <VStack gap="sm">
          <Text variant="label" accessibilityRole="header">
            What kind of purchase is it?
          </Text>
          <Text variant="footnote" tone="tertiary">
            Your bank decides the real category when the payment goes through, and it can differ
            from what you would expect.
          </Text>
          <HStack gap="sm" wrap>
            {CATEGORIES.map((category) => (
              <Chip
                key={category.id}
                label={category.displayName}
                selected={categoryId === category.id}
                onPress={() => setCategoryId(category.id)}
                testID={`purchase-category-${category.slug}`}
              />
            ))}
          </HStack>
        </VStack>

        <VStack gap="sm">
          <Text variant="label" accessibilityRole="header">
            Where are you paying?
          </Text>
          <HStack gap="sm" wrap>
            <Chip
              label="In store"
              selected={channel === 'in_store'}
              onPress={() => setChannel('in_store')}
              testID="purchase-channel-in-store"
            />
            <Chip
              label="Online"
              selected={channel === 'online'}
              onPress={() => setChannel('online')}
              testID="purchase-channel-online"
            />
          </HStack>
        </VStack>

        <VStack gap="sm">
          <Text variant="label" accessibilityRole="header">
            How are you paying?
          </Text>
          <Text variant="footnote" tone="tertiary">
            Some cards pay more when you tap a phone than when you tap the card itself.
          </Text>
          <HStack gap="sm" wrap>
            {PAYMENT_METHODS.map((method) => (
              <Chip
                key={method}
                label={method === 'other' ? 'Something else' : PAYMENT_METHOD_LABELS[method]}
                selected={paymentMethod === method}
                onPress={() => setPaymentMethod(method)}
                testID={`purchase-payment-${method}`}
              />
            ))}
          </HStack>
        </VStack>

        {error === null ? null : (
          <Text
            variant="callout"
            tone="danger"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            testID="purchase-error"
          >
            {error}
          </Text>
        )}

        <Button
          label="Find the best card"
          size="large"
          fullWidth
          onPress={submit}
          accessibilityHint="Compares every card in your wallet and shows which earns the most"
          testID="purchase-submit"
        />

        <Card testID="purchase-wallet-summary">
          <VStack gap="xs">
            <Text variant="label" tone="secondary">
              Comparing {cards.length} {cards.length === 1 ? 'card' : 'cards'}
            </Text>
            {cards.map((card) => (
              <Text key={card.id} variant="callout" tone="secondary">
                {card.issuerName} {card.productName}
              </Text>
            ))}
            <Button
              label="Change my cards"
              variant="ghost"
              onPress={() => router.push('/choose-cards')}
              accessibilityHint="Opens the card chooser"
              testID="purchase-change-cards"
            />
          </VStack>
        </Card>

        <Button
          label="About WalletWise"
          variant="ghost"
          onPress={() => router.push('/about')}
          testID="purchase-about"
        />
      </VStack>
    </Screen>
  );
}
