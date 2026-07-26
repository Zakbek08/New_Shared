/**
 * Add an offer.
 *
 * Validated by `userOfferSchema` — the same schema the API layer trusts — so the
 * refinements that matter are enforced once: a merchant must be named, and either a
 * rate or a fixed amount must be given. An offer with neither would be a row the
 * engine silently ignores.
 *
 * The form asks the user to copy what their issuer shows them. It never guesses a
 * rate from the title, because a guessed rate is a fabricated reward figure.
 */
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { REWARD_TYPE_LABELS, REWARD_TYPES } from '@/domain/enums';
import {
  userOfferSchema,
  type UserOfferFormValues,
  type UserOfferInput,
} from '@/domain/schemas';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

/** The subset of reward types an offer can sensibly use. */
const OFFER_REWARD_TYPES = REWARD_TYPES.filter(
  (type) => type !== 'points_per_dollar' && type !== 'miles_per_dollar',
);

/**
 * A numeric field's current text.
 *
 * The form holds strings while the schema coerces to numbers, so a field's value can
 * legitimately be either. Anything else — a Date from a coerced field, `undefined`
 * from a reset — renders as blank rather than as `[object Object]`.
 */
function numericText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export interface OfferFormCard {
  readonly id: string;
  readonly name: string;
}

function Chip({
  label,
  selected,
  onPress,
  hint,
  testID,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly hint?: string;
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
      style={{
        minHeight: MIN_TOUCH_TARGET,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radii.pill,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected ? theme.colors.primarySubtle : theme.colors.surface,
      }}
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

export function OfferForm({
  cards,
  onSubmit,
  isSaving = false,
  testID,
}: {
  readonly cards: readonly OfferFormCard[];
  readonly onSubmit: (input: UserOfferInput) => void;
  readonly isSaving?: boolean;
  readonly testID?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  // Three generics, as elsewhere in the app: the form holds strings, the schema
  // coerces, and `onSubmit` receives the parsed output. Without this the resolver's
  // output type fights the field values.
  const form = useForm<UserOfferFormValues, unknown, UserOfferInput>({
    resolver: zodResolver(userOfferSchema),
    defaultValues: {
      userCardId: cards[0]?.id ?? '',
      merchantId: null,
      merchantLabel: '',
      title: '',
      description: '',
      rewardType: 'statement_credit',
      rewardUnit: 'usd',
      rate: '',
      fixedAmountUsd: '',
      minimumSpendUsd: '',
      maxBenefitUsd: '',
      channel: 'either',
      startsAt: null,
      endsAt: null,
    },
    mode: 'onBlur',
  });

  const rewardType = form.watch('rewardType');
  const isPercentOffer = rewardType === 'cash_back_percent';

  const submit = form.handleSubmit((values) => {
    onSubmit(values);
    form.reset();
    setIsOpen(false);
  });

  if (!isOpen) {
    return (
      <Button
        label="Add an offer"
        fullWidth
        onPress={() => setIsOpen(true)}
        disabled={cards.length === 0}
        accessibilityHint={
          cards.length === 0
            ? 'Add a card to your wallet first'
            : 'Opens the form for entering an offer from your issuer'
        }
        testID="offers-add-open"
      />
    );
  }

  return (
    <Card testID={testID}>
      <VStack gap="lg">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            Add an offer
          </Text>
          <Text variant="callout" tone="secondary">
            Copy the details from your issuer&apos;s app exactly as they appear. WalletWise uses
            your figures and never estimates one.
          </Text>
        </VStack>

        {/* ---- Which card ---- */}
        <Controller
          control={form.control}
          name="userCardId"
          render={({ field, fieldState }) => (
            <VStack gap="sm">
              <Text variant="label" tone="secondary">
                Which card is this offer on?
              </Text>
              <HStack gap="sm" wrap align="flex-start">
                {cards.map((card) => (
                  <Chip
                    key={card.id}
                    label={card.name}
                    selected={field.value === card.id}
                    onPress={() => field.onChange(card.id)}
                    testID={`offer-card-${card.id}`}
                  />
                ))}
              </HStack>
              {fieldState.error?.message === undefined ? null : (
                <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
                  {fieldState.error.message}
                </Text>
              )}
            </VStack>
          )}
        />

        <Controller
          control={form.control}
          name="title"
          render={({ field, fieldState }) => (
            <TextField
              label="What does the offer say?"
              hint="For example: $10 back on a $50 spend"
              required
              value={typeof field.value === 'string' ? field.value : ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              testID="offer-title"
            />
          )}
        />

        <Controller
          control={form.control}
          name="merchantLabel"
          render={({ field, fieldState }) => (
            <TextField
              label="Merchant"
              hint="The shop or brand the offer is for"
              required
              value={typeof field.value === 'string' ? field.value : ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              autoCapitalize="words"
              testID="offer-merchant"
            />
          )}
        />

        {/* ---- Reward shape ---- */}
        <Controller
          control={form.control}
          name="rewardType"
          render={({ field }) => (
            <VStack gap="sm">
              <Text variant="label" tone="secondary">
                What kind of reward is it?
              </Text>
              <HStack gap="sm" wrap align="flex-start">
                {OFFER_REWARD_TYPES.map((type) => (
                  <Chip
                    key={type}
                    label={REWARD_TYPE_LABELS[type]}
                    selected={field.value === type}
                    onPress={() => field.onChange(type)}
                    testID={`offer-type-${type}`}
                  />
                ))}
              </HStack>
            </VStack>
          )}
        />

        {isPercentOffer ? (
          <Controller
            control={form.control}
            name="rate"
            render={({ field, fieldState }) => (
              <TextField
                label="Percentage back"
                hint="Enter 10 for 10% back"
                required
                value={numericText(field.value)}
                onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/gu, ''))}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                keyboardType="decimal-pad"
                testID="offer-rate"
              />
            )}
          />
        ) : (
          <Controller
            control={form.control}
            name="fixedAmountUsd"
            render={({ field, fieldState }) => (
              <TextField
                label="Amount back in US dollars"
                required
                value={numericText(field.value)}
                onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/gu, ''))}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                keyboardType="decimal-pad"
                testID="offer-fixed-amount"
              />
            )}
          />
        )}

        <Controller
          control={form.control}
          name="minimumSpendUsd"
          render={({ field, fieldState }) => (
            <TextField
              label="Minimum spend"
              hint="Leave blank if there is none"
              value={numericText(field.value)}
              onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/gu, ''))}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              keyboardType="decimal-pad"
              testID="offer-minimum-spend"
            />
          )}
        />

        <Controller
          control={form.control}
          name="maxBenefitUsd"
          render={({ field, fieldState }) => (
            <TextField
              label="Most you can get back"
              hint="Leave blank if the offer does not cap it"
              value={numericText(field.value)}
              onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/gu, ''))}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              keyboardType="decimal-pad"
              testID="offer-max-benefit"
            />
          )}
        />

        {/*
          A plain text date rather than a native picker: the issuer shows a date in
          text, this is the smallest thing that accepts it, and `z.coerce.date()`
          rejects anything unparseable. A picker is a Phase 7 refinement.
        */}
        <Controller
          control={form.control}
          name="endsAt"
          render={({ field, fieldState }) => (
            <TextField
              label="Last day to use it"
              hint="As YYYY-MM-DD, e.g. 2026-08-31. Leave blank if the offer has no end date."
              value={typeof field.value === 'string' ? field.value : ''}
              onChangeText={(text) => field.onChange(text.length === 0 ? null : text)}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
              testID="offer-ends-at"
            />
          )}
        />

        <Controller
          control={form.control}
          name="channel"
          render={({ field }) => (
            <VStack gap="sm">
              <Text variant="label" tone="secondary">
                Where does it apply?
              </Text>
              <HStack gap="sm" wrap>
                <Chip
                  label="Anywhere"
                  selected={field.value === 'either'}
                  onPress={() => field.onChange('either')}
                  testID="offer-channel-either"
                />
                <Chip
                  label="In store"
                  selected={field.value === 'in_store'}
                  onPress={() => field.onChange('in_store')}
                  testID="offer-channel-in_store"
                />
                <Chip
                  label="Online"
                  selected={field.value === 'online'}
                  onPress={() => field.onChange('online')}
                  testID="offer-channel-online"
                />
              </HStack>
            </VStack>
          )}
        />

        <Badge
          label="An offer only counts once you have activated it with your issuer"
          tone="info"
          glyph="i"
        />

        <HStack gap="md" wrap>
          <Button
            label="Save offer"
            loading={isSaving}
            onPress={() => void submit()}
            testID="offer-save"
          />
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => {
              form.reset();
              setIsOpen(false);
            }}
            testID="offer-cancel"
          />
        </HStack>
      </VStack>
    </Card>
  );
}
