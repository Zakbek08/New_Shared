/**
 * Screen 8 — Purchase Assistant.
 *
 * WalletWise never initiates a payment. Submitting this form asks a question.
 *
 * Two ways in: the structured form, or free text. The free-text path runs the
 * deterministic parser in `src/domain/purchaseText/`, pre-fills whatever it
 * recognised, and leaves the rest to the user. It produces no reward figure — that
 * is the engine's job and the engine's alone.
 */
import { useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { ErrorNotice } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { CATEGORIES } from '@/domain/categories';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@/domain/enums';
import { parsePurchaseText } from '@/domain/purchaseText/parse';
import {
  purchaseIntentSchema,
  type PurchaseIntentInput,
  type PurchaseIntentFormValues,
} from '@/domain/schemas';
import { useLatestRecommendation } from '@/features/recommendations/RecommendationProvider';
import { useMerchantSuggestions, useRecommend } from '@/features/recommendations/hooks';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

/** A selectable chip. Used for categories, channel and payment method. */
function Chip({
  label,
  hint,
  selected,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected
          ? theme.colors.primarySubtle
          : pressed
            ? theme.colors.surfaceSunken
            : theme.colors.surface,
      })}
    >
      <Text
        variant="label"
        style={{ color: selected ? theme.colors.onPrimarySubtle : theme.colors.textPrimary }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function PurchaseAssistantScreen() {
  const router = useRouter();
  const recommend = useRecommend();
  const { setLatest } = useLatestRecommendation();

  // The dashboard's "recently evaluated" list routes here with a merchant, so a
  // repeat trip to the same shop starts one field ahead. Only the merchant name
  // carries over — the amount is a new decision every time.
  const { merchant: merchantParam } = useLocalSearchParams<{ merchant?: string }>();

  const [freeText, setFreeText] = useState('');
  const [parseNote, setParseNote] = useState<string | null>(null);

  const form = useForm<PurchaseIntentFormValues, unknown, PurchaseIntentInput>({
    resolver: zodResolver(purchaseIntentSchema),
    defaultValues: {
      merchant: merchantParam ?? '',
      amountUsd: '',
      categorySlug: null,
      channel: 'in_store',
      countryCode: 'US',
      currencyCode: 'USD',
      paymentMethod: 'physical_card',
      notes: '',
    },
    mode: 'onBlur',
  });

  const merchantValue = form.watch('merchant');
  const countryValue = form.watch('countryCode');

  const suggestions = useMerchantSuggestions(
    typeof merchantValue === 'string' ? merchantValue : '',
    typeof countryValue === 'string' ? countryValue : 'US',
  );

  const suggestionList = useMemo(
    () => (suggestions.data ?? []).slice(0, 5),
    [suggestions.data],
  );

  /**
   * Applies the free-text parser's output to the form.
   *
   * Only fills fields it actually recognised, and says which — pre-filling a
   * guessed value silently would be worse than leaving it blank.
   */
  const applyFreeText = () => {
    const parsed = parsePurchaseText(freeText);

    if (parsed.recognised.length === 0) {
      setParseNote('We could not pick anything out of that. Try filling the fields in below.');
      return;
    }

    if (parsed.merchant !== null) form.setValue('merchant', parsed.merchant);
    if (parsed.amountUsd !== null) form.setValue('amountUsd', String(parsed.amountUsd));
    if (parsed.categorySlug !== null) form.setValue('categorySlug', parsed.categorySlug);
    if (parsed.channel !== null) form.setValue('channel', parsed.channel);
    if (parsed.paymentMethod !== null) form.setValue('paymentMethod', parsed.paymentMethod);

    setParseNote(
      `Filled in ${parsed.recognised.join(', ')}. Check the details below before continuing.`,
    );
  };

  const onSubmit = form.handleSubmit((values) => {
    recommend.mutate(
      {
        purchase: values,
        rawNaturalLanguageInput: freeText.trim().length > 0 ? freeText.trim() : null,
        // The clock is read here, at the edge, and passed in explicitly. The engine
        // never reads it — that is what makes its output reproducible.
        asOf: new Date(),
      },
      {
        onSuccess: (outcome) => {
          setLatest(outcome);
          router.push('/recommendations/results');
        },
      },
    );
  });

  return (
    <Screen scroll accessibilityLabel="Purchase assistant" testID="assistant-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            What are you buying?
          </Text>
          <Text variant="body" tone="secondary">
            WalletWise compares every eligible card in your wallet and shows you the estimated
            value of each. It does not pay for anything.
          </Text>
        </VStack>

        {recommend.isError ? (
          <ErrorNotice error={recommend.error} testID="assistant-error" />
        ) : null}

        {/* ---- Free text ---- */}
        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Describe it in your own words
            </Text>
            <TextField
              label="What happened"
              hint="For example: coffee at the airport, tapped my phone, twelve dollars."
              value={freeText}
              onChangeText={setFreeText}
              multiline
              numberOfLines={2}
              maxLength={500}
              testID="assistant-free-text"
            />
            <Button
              label="Fill in the form from this"
              variant="secondary"
              onPress={applyFreeText}
              accessibilityHint="Reads your description and fills in whatever it can"
              testID="assistant-parse"
            />
            {parseNote !== null ? (
              <Text variant="caption" tone="secondary" accessibilityLiveRegion="polite">
                {parseNote}
              </Text>
            ) : null}
          </VStack>
        </Card>

        {/* ---- Merchant ---- */}
        <VStack gap="sm">
          <Controller
            control={form.control}
            name="merchant"
            render={({ field, fieldState }) => (
              <TextField
                label="Where are you buying?"
                required
                value={typeof field.value === 'string' ? field.value : ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                autoCapitalize="words"
                autoCorrect={false}
                testID="assistant-merchant"
              />
            )}
          />

          {suggestionList.length > 0 ? (
            <HStack gap="sm" wrap align="flex-start">
              {suggestionList.map((suggestion) => (
                <Chip
                  key={suggestion.id}
                  label={suggestion.displayName}
                  hint="Use this merchant"
                  selected={merchantValue === suggestion.displayName}
                  onPress={() => form.setValue('merchant', suggestion.displayName)}
                  testID={`assistant-suggestion-${suggestion.id}`}
                />
              ))}
            </HStack>
          ) : null}
        </VStack>

        {/* ---- Amount ---- */}
        <Controller
          control={form.control}
          name="amountUsd"
          render={({ field, fieldState }) => (
            <TextField
              label="Amount in US dollars"
              required
              value={
                typeof field.value === 'string' || typeof field.value === 'number'
                  ? String(field.value)
                  : ''
              }
              onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/gu, ''))}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              keyboardType="decimal-pad"
              testID="assistant-amount"
            />
          )}
        />

        {/* ---- Category ---- */}
        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Category
            </Text>
            <Text variant="callout" tone="secondary">
              Choosing a category yourself is the most reliable option — it removes the
              guesswork from how a merchant is coded.
            </Text>
            <Controller
              control={form.control}
              name="categorySlug"
              render={({ field }) => (
                <HStack gap="sm" wrap align="flex-start">
                  {CATEGORIES.map((category) => (
                    <Chip
                      key={category.slug}
                      label={category.displayName}
                      hint={category.accessibilityHint}
                      selected={field.value === category.slug}
                      onPress={() =>
                        field.onChange(field.value === category.slug ? null : category.slug)
                      }
                      testID={`category-chip-${category.slug}`}
                    />
                  ))}
                </HStack>
              )}
            />
          </VStack>
        </Card>

        {/* ---- Channel and payment method ---- */}
        <Card>
          <VStack gap="lg">
            <VStack gap="sm">
              <Text variant="title3" accessibilityRole="header">
                How are you paying?
              </Text>
              <Controller
                control={form.control}
                name="channel"
                render={({ field }) => (
                  <HStack gap="sm" wrap>
                    <Chip
                      label="In store"
                      selected={field.value === 'in_store'}
                      onPress={() => field.onChange('in_store')}
                      testID="assistant-channel-in_store"
                    />
                    <Chip
                      label="Online"
                      selected={field.value === 'online'}
                      onPress={() => field.onChange('online')}
                      testID="assistant-channel-online"
                    />
                  </HStack>
                )}
              />
            </VStack>

            <Controller
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <VStack gap="sm">
                  <Text variant="label" tone="secondary">
                    Payment method
                  </Text>
                  <HStack gap="sm" wrap align="flex-start">
                    {PAYMENT_METHODS.map((method) => (
                      <Chip
                        key={method}
                        label={PAYMENT_METHOD_LABELS[method]}
                        selected={field.value === method}
                        onPress={() => field.onChange(method)}
                        testID={`assistant-payment-${method}`}
                      />
                    ))}
                  </HStack>
                  <Text variant="footnote" tone="tertiary">
                    Some cards pay a bonus only for a mobile wallet, so tapping your phone and
                    tapping your card are not the same thing.
                  </Text>
                </VStack>
              )}
            />
          </VStack>
        </Card>

        {/* ---- Country, currency, notes ---- */}
        <Card>
          <VStack gap="lg">
            <Text variant="title3" accessibilityRole="header">
              Where and in what currency
            </Text>
            <HStack gap="md" align="flex-start">
              <Controller
                control={form.control}
                name="countryCode"
                render={({ field, fieldState }) => (
                  <VStack gap="xs" style={{ flex: 1 }}>
                    <TextField
                      label="Country"
                      hint="Two letters, e.g. US"
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChangeText={(text) => field.onChange(text.toUpperCase().slice(0, 2))}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                      autoCapitalize="characters"
                      maxLength={2}
                      testID="assistant-country"
                    />
                  </VStack>
                )}
              />
              <Controller
                control={form.control}
                name="currencyCode"
                render={({ field, fieldState }) => (
                  <VStack gap="xs" style={{ flex: 1 }}>
                    <TextField
                      label="Currency"
                      hint="Three letters, e.g. USD"
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChangeText={(text) => field.onChange(text.toUpperCase().slice(0, 3))}
                      onBlur={field.onBlur}
                      error={fieldState.error?.message}
                      autoCapitalize="characters"
                      maxLength={3}
                      testID="assistant-currency"
                    />
                  </VStack>
                )}
              />
            </HStack>
            <Badge
              label="A foreign currency triggers any foreign transaction fee"
              tone="info"
              glyph="i"
            />

            <Controller
              control={form.control}
              name="notes"
              render={({ field, fieldState }) => (
                <TextField
                  label="Notes"
                  hint="Optional, and only for you."
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  multiline
                  numberOfLines={2}
                  maxLength={500}
                  testID="assistant-notes"
                />
              )}
            />
          </VStack>
        </Card>

        <Button
          label="Find the best card"
          size="large"
          fullWidth
          loading={recommend.isPending}
          onPress={() => void onSubmit()}
          accessibilityHint="Compares every card in your wallet for this purchase"
          testID="assistant-submit"
        />

        <DisclaimerNotice kind="merchant_category" />
        <DisclaimerNotice kind="no_payment" />
      </VStack>
    </Screen>
  );
}
