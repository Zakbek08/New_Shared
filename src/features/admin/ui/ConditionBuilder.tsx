/**
 * The condition builder.
 *
 * A condition row is what makes a rule apply to some purchases and not others, so the
 * two things this screen must never do are misstate the logic and swallow an
 * unsatisfiable combination.
 *
 * THE LOGIC, STATED ON SCREEN
 * Every populated field must be satisfied, and every condition row on a rule is
 * ANDed. An empty row therefore means "no constraint" — it matches every purchase —
 * which is the opposite of what "empty" suggests. The header says so in words.
 *
 * MCC RANGES ARE INCLUSIVE HERE
 * `5411 to 5411` means exactly one code. The conversion to Postgres's half-open form
 * happens at the data boundary, in `src/lib/int4range.ts`, and never in this file.
 */
import { useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider, HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { CATEGORIES } from '@/domain/categories';
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@/domain/enums';
import { mccRangeSchema, rewardRuleConditionSchema } from '@/domain/schemas';
import type { RewardRuleConditionInput } from '@/domain/schemas';
import type { InclusiveRange } from '@/lib/int4range';
import type { PaymentMethod } from '@/types/database';

import { AdminChip } from './AdminChip';

export interface ConditionMerchant {
  readonly id: string;
  readonly displayName: string;
}

/** The builder's working state: arrays the chips toggle directly. */
interface Draft {
  readonly includedCategoryIds: readonly string[];
  readonly excludedCategoryIds: readonly string[];
  readonly includedMccs: readonly number[];
  readonly includedMccRanges: readonly InclusiveRange[];
  readonly excludedMccs: readonly number[];
  readonly includedMerchantIds: readonly string[];
  readonly excludedMerchantIds: readonly string[];
  readonly includedCountryCodes: readonly string[];
  readonly includedCurrencyCodes: readonly string[];
  readonly channel: 'online' | 'in_store' | 'either';
  readonly includedPaymentMethods: readonly PaymentMethod[];
  readonly minAmountUsd: string;
  readonly maxAmountUsd: string;
}

const EMPTY_DRAFT: Draft = {
  includedCategoryIds: [],
  excludedCategoryIds: [],
  includedMccs: [],
  includedMccRanges: [],
  excludedMccs: [],
  includedMerchantIds: [],
  excludedMerchantIds: [],
  includedCountryCodes: [],
  includedCurrencyCodes: [],
  channel: 'either',
  includedPaymentMethods: [],
  minAmountUsd: '',
  maxAmountUsd: '',
};

function toggle<T>(list: readonly T[], value: T): readonly T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** `[5411, 5411]` reads as one code; a span reads as a span. */
export function formatRangeLabel(range: InclusiveRange): string {
  return range[0] === range[1] ? `${range[0]}` : `${range[0]}–${range[1]}`;
}

export function ConditionBuilder({
  rewardRuleId,
  conditionId,
  merchants,
  initial,
  onSubmit,
  onCancel,
  onDelete,
  isSaving = false,
  testID,
}: {
  readonly rewardRuleId: string;
  /** `null` when adding a row. */
  readonly conditionId: string | null;
  readonly merchants: readonly ConditionMerchant[];
  readonly initial?: Partial<Draft>;
  readonly onSubmit: (input: RewardRuleConditionInput) => void;
  readonly onCancel: () => void;
  readonly onDelete?: () => void;
  readonly isSaving?: boolean;
  readonly testID?: string;
}) {
  const [draft, setDraft] = useState<Draft>({ ...EMPTY_DRAFT, ...initial });
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [rangeError, setRangeError] = useState<string | undefined>(undefined);
  const [mccEntry, setMccEntry] = useState('');
  const [countryEntry, setCountryEntry] = useState('');
  const [errors, setErrors] = useState<readonly string[]>([]);

  const patch = (next: Partial<Draft>) => setDraft((current) => ({ ...current, ...next }));

  const addRange = () => {
    const parsed = mccRangeSchema.safeParse([Number(rangeFrom), Number(rangeTo || rangeFrom)]);
    if (!parsed.success) {
      setRangeError(parsed.error.issues[0]?.message ?? 'Enter two codes between 1 and 9999');
      return;
    }
    setRangeError(undefined);
    patch({ includedMccRanges: [...draft.includedMccRanges, parsed.data] });
    setRangeFrom('');
    setRangeTo('');
  };

  const submit = () => {
    const parsed = rewardRuleConditionSchema.safeParse({
      rewardRuleId,
      merchantCategoryId: null,
      includedCategoryIds: draft.includedCategoryIds,
      excludedCategoryIds: draft.excludedCategoryIds,
      includedMccs: draft.includedMccs,
      includedMccRanges: draft.includedMccRanges,
      excludedMccs: draft.excludedMccs,
      includedMerchantIds: draft.includedMerchantIds,
      excludedMerchantIds: draft.excludedMerchantIds,
      includedCountryCodes: draft.includedCountryCodes,
      excludedCountryCodes: [],
      includedCurrencyCodes: draft.includedCurrencyCodes,
      channel: draft.channel,
      includedPaymentMethods: draft.includedPaymentMethods,
      startsAt: null,
      endsAt: null,
      minAmountUsd: draft.minAmountUsd.length === 0 ? null : draft.minAmountUsd,
      maxAmountUsd: draft.maxAmountUsd.length === 0 ? null : draft.maxAmountUsd,
    });

    if (!parsed.success) {
      // Contradictions — a category both required and excluded — are the whole reason
      // this is validated rather than assembled and posted.
      setErrors(parsed.error.issues.map((issue) => issue.message));
      return;
    }

    setErrors([]);
    onSubmit(parsed.data);
  };

  const isUnconstrained =
    draft.includedCategoryIds.length === 0 &&
    draft.excludedCategoryIds.length === 0 &&
    draft.includedMccs.length === 0 &&
    draft.includedMccRanges.length === 0 &&
    draft.excludedMccs.length === 0 &&
    draft.includedMerchantIds.length === 0 &&
    draft.excludedMerchantIds.length === 0 &&
    draft.includedCountryCodes.length === 0 &&
    draft.includedCurrencyCodes.length === 0 &&
    draft.channel === 'either' &&
    draft.includedPaymentMethods.length === 0 &&
    draft.minAmountUsd.length === 0 &&
    draft.maxAmountUsd.length === 0;

  return (
    <Card testID={testID}>
      <VStack gap="lg">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            {conditionId === null ? 'Add a condition' : 'Edit condition'}
          </Text>
          <Text variant="callout" tone="secondary">
            Every field you fill in must be satisfied for the rule to apply, and all of a
            rule&apos;s conditions must be satisfied together.
          </Text>
        </VStack>

        {isUnconstrained ? (
          <Badge
            label="Nothing set — this condition matches every purchase"
            tone="uncertain"
            glyph="!"
            testID="condition-unconstrained"
          />
        ) : null}

        {errors.length > 0 ? (
          <VStack gap="xs" testID="condition-errors">
            {errors.map((message) => (
              <Text
                key={message}
                variant="caption"
                tone="danger"
                accessibilityLiveRegion="polite"
              >
                {message}
              </Text>
            ))}
          </VStack>
        ) : null}

        {/* ---- Categories ---- */}
        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            Categories that qualify
          </Text>
          <HStack gap="sm" wrap align="flex-start">
            {CATEGORIES.map((category) => (
              <AdminChip
                key={category.id}
                label={category.displayName}
                selected={draft.includedCategoryIds.includes(category.id)}
                onPress={() =>
                  patch({ includedCategoryIds: toggle(draft.includedCategoryIds, category.id) })
                }
                testID={`condition-include-category-${category.slug}`}
              />
            ))}
          </HStack>
        </VStack>

        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            Categories that are excluded
          </Text>
          <HStack gap="sm" wrap align="flex-start">
            {CATEGORIES.map((category) => (
              <AdminChip
                key={category.id}
                label={category.displayName}
                tone="danger"
                selected={draft.excludedCategoryIds.includes(category.id)}
                onPress={() =>
                  patch({ excludedCategoryIds: toggle(draft.excludedCategoryIds, category.id) })
                }
                testID={`condition-exclude-category-${category.slug}`}
              />
            ))}
          </HStack>
        </VStack>

        <Divider />

        {/* ---- MCC ranges ---- */}
        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            Merchant category codes
          </Text>
          <Text variant="caption" tone="tertiary">
            Ranges are inclusive at both ends. Leave the second box empty for a single code.
          </Text>

          <HStack gap="md" align="flex-start">
            <VStack gap="xs" style={{ flex: 1 }}>
              <TextField
                label="From"
                value={rangeFrom}
                onChangeText={(text) => setRangeFrom(text.replace(/[^0-9]/gu, ''))}
                keyboardType="number-pad"
                maxLength={4}
                error={rangeError}
                testID="condition-range-from"
              />
            </VStack>
            <VStack gap="xs" style={{ flex: 1 }}>
              <TextField
                label="To"
                value={rangeTo}
                onChangeText={(text) => setRangeTo(text.replace(/[^0-9]/gu, ''))}
                keyboardType="number-pad"
                maxLength={4}
                testID="condition-range-to"
              />
            </VStack>
          </HStack>

          <Button
            label="Add code range"
            variant="secondary"
            onPress={addRange}
            disabled={rangeFrom.length === 0}
            testID="condition-range-add"
          />

          {draft.includedMccRanges.length > 0 ? (
            <HStack gap="sm" wrap align="flex-start">
              {draft.includedMccRanges.map((range) => (
                <AdminChip
                  key={formatRangeLabel(range)}
                  label={`${formatRangeLabel(range)} ✕`}
                  selected
                  hint="Removes this code range"
                  onPress={() =>
                    patch({
                      includedMccRanges: draft.includedMccRanges.filter(
                        (existing) => existing !== range,
                      ),
                    })
                  }
                  testID={`condition-range-${formatRangeLabel(range)}`}
                />
              ))}
            </HStack>
          ) : null}

          <HStack gap="md" align="flex-end">
            <VStack gap="xs" style={{ flex: 1 }}>
              <TextField
                label="Exclude a single code"
                value={mccEntry}
                onChangeText={(text) => setMccEntry(text.replace(/[^0-9]/gu, ''))}
                keyboardType="number-pad"
                maxLength={4}
                testID="condition-exclude-mcc-input"
              />
            </VStack>
            <Button
              label="Exclude"
              variant="secondary"
              disabled={mccEntry.length === 0}
              onPress={() => {
                const mcc = Number(mccEntry);
                if (Number.isInteger(mcc) && mcc > 0 && mcc <= 9999) {
                  patch({ excludedMccs: toggle(draft.excludedMccs, mcc) });
                  setMccEntry('');
                }
              }}
              testID="condition-exclude-mcc-add"
            />
          </HStack>

          {draft.excludedMccs.length > 0 ? (
            <HStack gap="sm" wrap align="flex-start">
              {draft.excludedMccs.map((mcc) => (
                <AdminChip
                  key={mcc}
                  label={`${mcc} ✕`}
                  tone="danger"
                  selected
                  onPress={() => patch({ excludedMccs: toggle(draft.excludedMccs, mcc) })}
                  testID={`condition-excluded-mcc-${mcc}`}
                />
              ))}
            </HStack>
          ) : null}
        </VStack>

        <Divider />

        {/* ---- Merchants ---- */}
        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            Only these merchants
          </Text>
          <HStack gap="sm" wrap align="flex-start">
            {merchants.map((merchant) => (
              <AdminChip
                key={merchant.id}
                label={merchant.displayName}
                selected={draft.includedMerchantIds.includes(merchant.id)}
                onPress={() =>
                  patch({ includedMerchantIds: toggle(draft.includedMerchantIds, merchant.id) })
                }
                testID={`condition-include-merchant-${merchant.id}`}
              />
            ))}
          </HStack>
        </VStack>

        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            Never these merchants
          </Text>
          <Text variant="caption" tone="tertiary">
            How a warehouse club is kept out of a supermarket bonus.
          </Text>
          <HStack gap="sm" wrap align="flex-start">
            {merchants.map((merchant) => (
              <AdminChip
                key={merchant.id}
                label={merchant.displayName}
                tone="danger"
                selected={draft.excludedMerchantIds.includes(merchant.id)}
                onPress={() =>
                  patch({ excludedMerchantIds: toggle(draft.excludedMerchantIds, merchant.id) })
                }
                testID={`condition-exclude-merchant-${merchant.id}`}
              />
            ))}
          </HStack>
        </VStack>

        <Divider />

        {/* ---- Country, channel, payment method ---- */}
        <HStack gap="md" align="flex-end">
          <VStack gap="xs" style={{ flex: 1 }}>
            <TextField
              label="Country code"
              hint="Two letters"
              value={countryEntry}
              onChangeText={(text) => setCountryEntry(text.toUpperCase().slice(0, 2))}
              autoCapitalize="characters"
              maxLength={2}
              testID="condition-country-input"
            />
          </VStack>
          <Button
            label="Add"
            variant="secondary"
            disabled={countryEntry.length !== 2}
            onPress={() => {
              patch({ includedCountryCodes: toggle(draft.includedCountryCodes, countryEntry) });
              setCountryEntry('');
            }}
            testID="condition-country-add"
          />
        </HStack>

        {draft.includedCountryCodes.length > 0 ? (
          <HStack gap="sm" wrap align="flex-start">
            {draft.includedCountryCodes.map((code) => (
              <AdminChip
                key={code}
                label={`${code} ✕`}
                selected
                onPress={() =>
                  patch({ includedCountryCodes: toggle(draft.includedCountryCodes, code) })
                }
                testID={`condition-country-${code}`}
              />
            ))}
          </HStack>
        ) : null}

        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            Channel
          </Text>
          <HStack gap="sm" wrap>
            {(['either', 'in_store', 'online'] as const).map((channel) => (
              <AdminChip
                key={channel}
                label={
                  channel === 'either' ? 'Either' : channel === 'online' ? 'Online' : 'In store'
                }
                selected={draft.channel === channel}
                onPress={() => patch({ channel })}
                testID={`condition-channel-${channel}`}
              />
            ))}
          </HStack>
        </VStack>

        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            Only these payment methods
          </Text>
          <Text variant="caption" tone="tertiary">
            Leave empty for any method. Tapping a phone and tapping a card are different
            methods.
          </Text>
          <HStack gap="sm" wrap align="flex-start">
            {PAYMENT_METHODS.map((method) => (
              <AdminChip
                key={method}
                label={PAYMENT_METHOD_LABELS[method]}
                selected={draft.includedPaymentMethods.includes(method)}
                onPress={() =>
                  patch({
                    includedPaymentMethods: toggle(draft.includedPaymentMethods, method),
                  })
                }
                testID={`condition-payment-${method}`}
              />
            ))}
          </HStack>
        </VStack>

        <HStack gap="md" align="flex-start">
          <VStack gap="xs" style={{ flex: 1 }}>
            <TextField
              label="Minimum amount"
              value={draft.minAmountUsd}
              onChangeText={(text) => patch({ minAmountUsd: text.replace(/[^0-9.]/gu, '') })}
              keyboardType="decimal-pad"
              testID="condition-min-amount"
            />
          </VStack>
          <VStack gap="xs" style={{ flex: 1 }}>
            <TextField
              label="Maximum amount"
              value={draft.maxAmountUsd}
              onChangeText={(text) => patch({ maxAmountUsd: text.replace(/[^0-9.]/gu, '') })}
              keyboardType="decimal-pad"
              testID="condition-max-amount"
            />
          </VStack>
        </HStack>

        <HStack gap="md" wrap>
          <Button
            label={conditionId === null ? 'Add condition' : 'Save condition'}
            loading={isSaving}
            onPress={submit}
            testID="condition-save"
          />
          <Button label="Cancel" variant="ghost" onPress={onCancel} testID="condition-cancel" />
          {onDelete === undefined ? null : (
            <Button
              label="Delete condition"
              variant="ghost"
              onPress={onDelete}
              accessibilityHint="Removes this condition, which widens what the rule matches"
              testID="condition-delete"
            />
          )}
        </HStack>
      </VStack>
    </Card>
  );
}
