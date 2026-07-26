/**
 * Screen 7 — Add Custom Card.
 *
 * Creates a private card product owned by this user (`is_user_defined = true`,
 * `created_by = auth.uid()`), so RLS keeps it out of everyone else's catalog.
 *
 * The rate is stored with `verification_status = 'user_reported'`, which lowers
 * the confidence of every recommendation that relies on it. A user-entered rate
 * is a fact from an unverified source — used exactly as typed, never presented
 * as confirmed.
 */
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { ErrorNotice } from '@/components/StateViews';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import {
  customCardProductSchema,
  type CustomCardProductFormValues,
  type CustomCardProductInput,
} from '@/domain/schemas';
import { REWARD_UNITS } from '@/domain/enums';
import { useAddUserCard, useCreateCustomCardProduct } from '@/features/wallet/hooks';
import type { RewardUnit } from '@/types/database';

const UNIT_LABELS: Record<RewardUnit, string> = {
  usd: 'Cash back (%)',
  points: 'Points per dollar',
  miles: 'Miles per dollar',
};

/**
 * Renders a numeric form field's value.
 *
 * `z.coerce.number()` widens the schema's *input* type to `unknown`, so the field
 * value is a number (from the default) or a string (as typed). Anything else
 * would stringify to garbage, so it renders as empty instead.
 */
function numericFieldText(value: unknown): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'string') return value;
  return '';
}

export default function CustomCardScreen() {
  const router = useRouter();
  const createProduct = useCreateCustomCardProduct();
  const addCard = useAddUserCard();

  const form = useForm<CustomCardProductFormValues, unknown, CustomCardProductInput>({
    resolver: zodResolver(customCardProductSchema),
    defaultValues: {
      name: '',
      issuerName: '',
      cardKind: 'personal_credit',
      network: 'other',
      annualFeeUsd: 0,
      foreignTransactionFeePercent: 0,
      rewardUnit: 'usd',
      baseRate: 0,
      summary: '',
    },
    mode: 'onBlur',
  });

  const rewardUnit = form.watch('rewardUnit');

  const onSubmit = form.handleSubmit((values) => {
    createProduct.mutate(values, {
      onSuccess: (product) => {
        // Creating the product is only half the job — the user wants the card in
        // their wallet, so add it straight away rather than making them search
        // for something they just typed in.
        addCard.mutate(
          { cardProductId: product.id, isPreferred: false },
          { onSuccess: () => router.replace('/(app)/wallet') },
        );
      },
    });
  });

  const isSaving = createProduct.isPending || addCard.isPending;
  const error = createProduct.error ?? addCard.error;

  return (
    <Screen scroll accessibilityLabel="Add a custom card" testID="custom-card-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Add a custom card
          </Text>
          <Text variant="body" tone="secondary">
            Tell WalletWise about a card that is not in the catalog. Only you will see it.
          </Text>
        </VStack>

        {error !== null ? <ErrorNotice error={error} testID="custom-card-error" /> : null}

        <VStack gap="lg">
          <Controller
            control={form.control}
            name="name"
            render={({ field, fieldState }) => (
              <TextField
                label="Card name"
                required
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                testID="custom-card-name"
              />
            )}
          />

          <Controller
            control={form.control}
            name="issuerName"
            render={({ field, fieldState }) => (
              <TextField
                label="Issuer"
                required
                hint="Whoever issued the card."
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                testID="custom-card-issuer"
              />
            )}
          />
        </VStack>

        <Card>
          <VStack gap="lg">
            <VStack gap="xs">
              <Text variant="title3" accessibilityRole="header">
                Everything-else earn rate
              </Text>
              <Text variant="callout" tone="secondary">
                What this card earns on a purchase with no special category. You can add
                category bonuses later.
              </Text>
            </VStack>

            <Controller
              control={form.control}
              name="rewardUnit"
              render={({ field }) => (
                <VStack gap="sm">
                  <Text variant="label" tone="secondary">
                    Reward type
                  </Text>
                  <HStack gap="sm" wrap>
                    {REWARD_UNITS.map((unit) => (
                      <Button
                        key={unit}
                        label={UNIT_LABELS[unit]}
                        variant={field.value === unit ? 'primary' : 'ghost'}
                        onPress={() => field.onChange(unit)}
                        accessibilityHint={`Earn ${UNIT_LABELS[unit].toLowerCase()}`}
                        testID={`custom-card-unit-${unit}`}
                      />
                    ))}
                  </HStack>
                </VStack>
              )}
            />

            <Controller
              control={form.control}
              name="baseRate"
              render={({ field, fieldState }) => (
                <TextField
                  label={rewardUnit === 'usd' ? 'Cash back percentage' : 'Multiplier'}
                  required
                  hint={
                    rewardUnit === 'usd'
                      ? 'For example, 2 for a 2% card.'
                      : 'For example, 1.5 for a 1.5x card.'
                  }
                  value={numericFieldText(field.value)}
                  onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/g, ''))}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  keyboardType="decimal-pad"
                  testID="custom-card-base-rate"
                />
              )}
            />
          </VStack>
        </Card>

        <Card>
          <VStack gap="lg">
            <Text variant="title3" accessibilityRole="header">
              Fees
            </Text>

            <Controller
              control={form.control}
              name="annualFeeUsd"
              render={({ field, fieldState }) => (
                <TextField
                  label="Annual fee (US dollars)"
                  value={numericFieldText(field.value)}
                  onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/g, ''))}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  keyboardType="decimal-pad"
                  testID="custom-card-annual-fee"
                />
              )}
            />

            <Controller
              control={form.control}
              name="foreignTransactionFeePercent"
              render={({ field, fieldState }) => (
                <TextField
                  label="Foreign transaction fee (%)"
                  hint="Enter 0 if this card has none. WalletWise subtracts this on foreign-currency purchases."
                  value={numericFieldText(field.value)}
                  onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/g, ''))}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  keyboardType="decimal-pad"
                  testID="custom-card-fx-fee"
                />
              )}
            />
          </VStack>
        </Card>

        <Card emphasis="uncertain">
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Rates you enter are marked unverified
            </Text>
            <Text variant="callout" tone="secondary">
              WalletWise will use your numbers exactly as you typed them, and will label any
              recommendation that relies on them as lower confidence until someone checks them
              against the card&apos;s terms. Copy the rates from your own card agreement rather
              than from memory.
            </Text>
          </VStack>
        </Card>

        <Button
          label="Create and add to wallet"
          size="large"
          fullWidth
          loading={isSaving}
          onPress={() => void onSubmit()}
          testID="custom-card-submit"
        />

        <DisclaimerNotice kind="financial" />
      </VStack>
    </Screen>
  );
}
