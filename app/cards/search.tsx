/**
 * Screen 6 — Search and Add Card.
 *
 * Two steps: pick a product from the catalog, then set your own details for it.
 * The last four digits are optional and encrypted on the device before they are
 * sent — the field rejects anything longer than four digits, and there is no
 * column behind it that could hold a full number.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { EmptyState, ErrorNotice, LoadingState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Toggle } from '@/components/ui/Toggle';
import {
  addUserCardSchema,
  type AddUserCardFormValues,
  type AddUserCardInput,
} from '@/domain/schemas';
import type { CardProductSummary } from '@/features/catalog/api/catalog';
import { useAddUserCard, useCardProductSearch } from '@/features/wallet/hooks';
import { formatUsdCompact, formatVerifiedOn } from '@/lib/format';
import { isLastFourStorageAvailable } from '@/lib/lastFour';
import { useTheme } from '@/theme/ThemeProvider';

function ProductRow({
  product,
  onPress,
}: {
  readonly product: CardProductSummary;
  readonly onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name} from ${product.issuerName}`}
      accessibilityHint="Choose this card"
      onPress={onPress}
      testID={`product-${product.id}`}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: theme.spacing.lg,
        gap: theme.spacing.xs,
      })}
    >
      <Text variant="bodyStrong">{product.name}</Text>
      <Text variant="caption" tone="secondary">
        {product.issuerName}
      </Text>
      {product.headline !== null ? (
        <Text variant="callout" tone="secondary">
          {product.headline}
        </Text>
      ) : null}
      <HStack gap="sm" wrap align="flex-start">
        {product.isFictional ? <Badge label="Demo data" tone="accent" glyph="i" /> : null}
        {product.annualFeeUsd > 0 ? (
          <Badge
            label={`${formatUsdCompact(product.annualFeeUsd)} annual fee`}
            tone="neutral"
          />
        ) : (
          <Badge label="No annual fee" tone="best" glyph="✓" />
        )}
        <Badge label={formatVerifiedOn(product.lastVerifiedAt)} tone="neutral" />
      </HStack>
    </Pressable>
  );
}

export default function SearchCardScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CardProductSummary | null>(null);
  const [canStoreDigits, setCanStoreDigits] = useState(true);

  const results = useCardProductSearch(search);
  const addCard = useAddUserCard();

  useEffect(() => {
    void isLastFourStorageAvailable().then(setCanStoreDigits);
  }, []);

  const form = useForm<AddUserCardFormValues, unknown, AddUserCardInput>({
    resolver: zodResolver(addUserCardSchema),
    defaultValues: { cardProductId: '', nickname: '', isPreferred: false, notes: '' },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((values) => {
    addCard.mutate(values, { onSuccess: () => router.replace('/(app)/wallet') });
  });

  // ---- Step 2: details for the chosen product -------------------------------
  if (selected !== null) {
    return (
      <Screen scroll accessibilityLabel={`Add ${selected.name}`} testID="add-card-details">
        <VStack gap="xl">
          <VStack gap="sm">
            <Text variant="title1" accessibilityRole="header">
              {selected.name}
            </Text>
            <Text variant="callout" tone="secondary">
              {selected.issuerName}
            </Text>
          </VStack>

          {addCard.isError ? (
            <ErrorNotice error={addCard.error} testID="add-card-error" />
          ) : null}

          <Controller
            control={form.control}
            name="nickname"
            render={({ field, fieldState }) => (
              <TextField
                label="Nickname"
                hint="Optional. Helps you tell similar cards apart."
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                maxLength={40}
                testID="add-card-nickname"
              />
            )}
          />

          {canStoreDigits ? (
            <Controller
              control={form.control}
              name="lastFour"
              render={({ field, fieldState }) => (
                <TextField
                  label="Last four digits"
                  hint="Optional, and encrypted on this device before it is sent. Four digits only — we cannot accept a full card number."
                  value={field.value ?? ''}
                  onChangeText={(text) =>
                    // Strip non-digits as they are typed and hard-cap at four, so
                    // a full account number cannot be entered even by paste.
                    field.onChange(text.replace(/\D/g, '').slice(0, 4))
                  }
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  keyboardType="number-pad"
                  maxLength={4}
                  testID="add-card-last-four"
                />
              )}
            />
          ) : (
            <Card emphasis="uncertain">
              <Text variant="callout" tone="secondary">
                This device has no secure keystore available, so WalletWise will not store the
                last four digits. Everything else works as normal.
              </Text>
            </Card>
          )}

          <Controller
            control={form.control}
            name="isPreferred"
            render={({ field }) => (
              <Toggle
                label="This is my preferred card"
                description="Used to break ties when two cards earn the same, and to avoid suggesting a switch for a trivial gain."
                value={field.value ?? false}
                onValueChange={field.onChange}
                testID="add-card-preferred"
              />
            )}
          />

          <Controller
            control={form.control}
            name="notes"
            render={({ field, fieldState }) => (
              <TextField
                label="Notes"
                hint="Optional. Anything you want to remember about this card."
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                multiline
                numberOfLines={3}
                maxLength={500}
                testID="add-card-notes"
              />
            )}
          />

          <VStack gap="md">
            <Button
              label="Add to my wallet"
              size="large"
              fullWidth
              loading={addCard.isPending}
              onPress={() => void onSubmit()}
              testID="add-card-submit"
            />
            <Button
              label="Choose a different card"
              variant="ghost"
              fullWidth
              onPress={() => {
                setSelected(null);
                form.reset();
              }}
            />
          </VStack>

          <DisclaimerNotice kind="no_credentials" />
        </VStack>
      </Screen>
    );
  }

  // ---- Step 1: pick a product ----------------------------------------------
  return (
    <Screen scroll accessibilityLabel="Search and add a card" testID="card-search-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Add a card
          </Text>
          <Text variant="body" tone="secondary">
            Find your card in the catalog. Its reward rules come with it, so WalletWise can
            start comparing straight away.
          </Text>
        </VStack>

        <TextField
          label="Search by card or issuer"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          testID="card-search-input"
        />

        {results.isPending ? (
          <LoadingState label="Loading the catalog" testID="card-search-loading" />
        ) : results.isError ? (
          <ErrorNotice
            error={results.error}
            onRetry={() => void results.refetch()}
            testID="card-search-error"
          />
        ) : (results.data ?? []).length === 0 ? (
          <EmptyState
            title="No matches"
            description="Nothing in the catalog matches that. You can add it as a custom card instead."
            actionLabel="Add a custom card"
            onAction={() => router.push('/cards/custom')}
            testID="card-search-empty"
          />
        ) : (
          <VStack gap="md">
            {(results.data ?? []).map((product) => (
              <ProductRow
                key={product.id}
                product={product}
                onPress={() => {
                  setSelected(product);
                  form.setValue('cardProductId', product.id);
                }}
              />
            ))}
          </VStack>
        )}

        <Button
          label="Cannot find it? Add a custom card"
          variant="ghost"
          fullWidth
          onPress={() => router.push('/cards/custom')}
        />
      </VStack>
    </Screen>
  );
}
