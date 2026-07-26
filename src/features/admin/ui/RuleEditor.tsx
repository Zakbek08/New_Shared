/**
 * The reward-rule editor.
 *
 * Validated by `rewardRuleSchema`, which mirrors the CHECK constraints in
 * `20260701000400_reward_rules.sql` — so a rule the database would reject is caught
 * here with a readable message instead of a round trip and a constraint name.
 *
 * The editor never marks a rule verified as a side effect. Verification is a separate,
 * recorded act with its own panel and its own history row, because "who checked this
 * rate, against what, and when" is the question the whole catalog rests on.
 */
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Toggle } from '@/components/ui/Toggle';
import {
  CAP_PERIODS,
  CAP_PERIOD_LABELS,
  REWARD_TYPES,
  REWARD_TYPE_LABELS,
  REWARD_UNITS,
  RULE_KINDS,
} from '@/domain/enums';
import {
  rewardRuleSchema,
  type RewardRuleFormValues,
  type RewardRuleInput,
} from '@/domain/schemas';

import { AdminChip } from './AdminChip';

/** A numeric field's current text. The form holds strings; the schema coerces. */
function numericText(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

/** A date field's current text, as YYYY-MM-DD. */
function dateText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return '';
}

export interface RuleEditorProduct {
  readonly id: string;
  readonly name: string;
}

export function RuleEditor({
  ruleId,
  products,
  defaultValues,
  onSubmit,
  onCancel,
  isSaving = false,
  testID,
}: {
  /** `null` when creating. Shown so an editor knows which rule they are changing. */
  readonly ruleId: string | null;
  readonly products: readonly RuleEditorProduct[];
  readonly defaultValues?: Partial<RewardRuleFormValues>;
  readonly onSubmit: (input: RewardRuleInput) => void;
  readonly onCancel: () => void;
  readonly isSaving?: boolean;
  readonly testID?: string;
}) {
  const form = useForm<RewardRuleFormValues, unknown, RewardRuleInput>({
    resolver: zodResolver(rewardRuleSchema),
    defaultValues: {
      cardProductId: products[0]?.id ?? '',
      label: '',
      kind: 'category_bonus',
      rewardType: 'cash_back_percent',
      rewardUnit: 'usd',
      baseRate: '',
      bonusRate: '0',
      fixedAmountUsd: null,
      priority: '100',
      stackGroup: 'category',
      isStackable: false,
      capAmount: null,
      capAppliesTo: 'spend',
      capPeriod: 'none',
      postCapRate: null,
      startsAt: null,
      endsAt: null,
      requiresEnrollment: false,
      enrollmentUrl: null,
      spendThresholdUsd: null,
      sourceId: null,
      lastVerifiedAt: null,
      verificationStatus: 'unverified',
      notes: '',
      ...defaultValues,
    },
    mode: 'onBlur',
  });

  const rewardType = form.watch('rewardType');
  const isFixedAmount = rewardType === 'statement_credit' || rewardType === 'fixed_amount';

  const submit = form.handleSubmit((values) => onSubmit(values));

  return (
    <Card testID={testID}>
      <VStack gap="lg">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            {ruleId === null ? 'New reward rule' : 'Edit reward rule'}
          </Text>
          <Text variant="callout" tone="secondary">
            Every field here feeds a figure a user is shown. Enter what the source document
            says, not what the marketing page implies.
          </Text>
        </VStack>

        {/* ---- Which product ---- */}
        <Controller
          control={form.control}
          name="cardProductId"
          render={({ field, fieldState }) => (
            <VStack gap="sm">
              <Text variant="label" tone="secondary">
                Card product
              </Text>
              <HStack gap="sm" wrap align="flex-start">
                {products.map((product) => (
                  <AdminChip
                    key={product.id}
                    label={product.name}
                    selected={field.value === product.id}
                    onPress={() => field.onChange(product.id)}
                    testID={`rule-product-${product.id}`}
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
          name="label"
          render={({ field, fieldState }) => (
            <TextField
              label="Label"
              hint="What a cardholder would read on the terms, e.g. 6% cash back at US supermarkets, on up to $6,000 per calendar year"
              required
              value={typeof field.value === 'string' ? field.value : ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              multiline
              numberOfLines={2}
              testID="rule-label"
            />
          )}
        />

        {/* ---- Kind and reward shape ---- */}
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <VStack gap="sm">
              <Text variant="label" tone="secondary">
                Rule kind
              </Text>
              <HStack gap="sm" wrap align="flex-start">
                {RULE_KINDS.map((kind) => (
                  <AdminChip
                    key={kind}
                    label={kind.replace(/_/gu, ' ')}
                    selected={field.value === kind}
                    onPress={() => field.onChange(kind)}
                    testID={`rule-kind-${kind}`}
                  />
                ))}
              </HStack>
            </VStack>
          )}
        />

        <Controller
          control={form.control}
          name="rewardType"
          render={({ field }) => (
            <VStack gap="sm">
              <Text variant="label" tone="secondary">
                Reward type
              </Text>
              <HStack gap="sm" wrap align="flex-start">
                {REWARD_TYPES.map((type) => (
                  <AdminChip
                    key={type}
                    label={REWARD_TYPE_LABELS[type]}
                    selected={field.value === type}
                    onPress={() => field.onChange(type)}
                    testID={`rule-reward-type-${type}`}
                  />
                ))}
              </HStack>
            </VStack>
          )}
        />

        <Controller
          control={form.control}
          name="rewardUnit"
          render={({ field }) => (
            <VStack gap="sm">
              <Text variant="label" tone="secondary">
                Reward unit
              </Text>
              <HStack gap="sm" wrap>
                {REWARD_UNITS.map((unit) => (
                  <AdminChip
                    key={unit}
                    label={unit === 'usd' ? 'US dollars' : unit}
                    selected={field.value === unit}
                    onPress={() => field.onChange(unit)}
                    testID={`rule-unit-${unit}`}
                  />
                ))}
              </HStack>
            </VStack>
          )}
        />

        {isFixedAmount ? (
          <Controller
            control={form.control}
            name="fixedAmountUsd"
            render={({ field, fieldState }) => (
              <TextField
                label="Credit amount in US dollars"
                required
                value={numericText(field.value)}
                onChangeText={(text) =>
                  field.onChange(text.length === 0 ? null : text.replace(/[^0-9.]/gu, ''))
                }
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                keyboardType="decimal-pad"
                testID="rule-fixed-amount"
              />
            )}
          />
        ) : (
          <HStack gap="md" align="flex-start">
            <Controller
              control={form.control}
              name="baseRate"
              render={({ field, fieldState }) => (
                <VStack gap="xs" style={{ flex: 1 }}>
                  <TextField
                    label="Base rate"
                    hint="Percent for cash back, multiple for points"
                    required
                    value={numericText(field.value)}
                    onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/gu, ''))}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    keyboardType="decimal-pad"
                    testID="rule-base-rate"
                  />
                </VStack>
              )}
            />
            <Controller
              control={form.control}
              name="bonusRate"
              render={({ field, fieldState }) => (
                <VStack gap="xs" style={{ flex: 1 }}>
                  <TextField
                    label="Bonus rate"
                    hint="On top of the base"
                    value={numericText(field.value)}
                    onChangeText={(text) => field.onChange(text.replace(/[^0-9.]/gu, ''))}
                    onBlur={field.onBlur}
                    error={fieldState.error?.message}
                    keyboardType="decimal-pad"
                    testID="rule-bonus-rate"
                  />
                </VStack>
              )}
            />
          </HStack>
        )}

        {/* ---- Cap ---- */}
        <VStack gap="sm">
          <Text variant="label" tone="secondary">
            Spending cap
          </Text>
          <Text variant="caption" tone="tertiary">
            A cap amount needs a period, and a period needs an amount. Leave both empty for an
            uncapped rule.
          </Text>

          <Controller
            control={form.control}
            name="capAmount"
            render={({ field, fieldState }) => (
              <TextField
                label="Cap amount"
                value={numericText(field.value)}
                onChangeText={(text) =>
                  field.onChange(text.length === 0 ? null : text.replace(/[^0-9.]/gu, ''))
                }
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                keyboardType="decimal-pad"
                testID="rule-cap-amount"
              />
            )}
          />

          <Controller
            control={form.control}
            name="capPeriod"
            render={({ field, fieldState }) => (
              <VStack gap="sm">
                <HStack gap="sm" wrap align="flex-start">
                  {CAP_PERIODS.map((period) => (
                    <AdminChip
                      key={period}
                      label={period === 'none' ? 'No cap' : CAP_PERIOD_LABELS[period]}
                      selected={field.value === period}
                      onPress={() => field.onChange(period)}
                      testID={`rule-cap-period-${period}`}
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
            name="capAppliesTo"
            render={({ field }) => (
              <HStack gap="sm" wrap>
                <AdminChip
                  label="Cap on spend"
                  selected={field.value === 'spend'}
                  onPress={() => field.onChange('spend')}
                  testID="rule-cap-applies-spend"
                />
                <AdminChip
                  label="Cap on reward"
                  selected={field.value === 'reward'}
                  onPress={() => field.onChange('reward')}
                  testID="rule-cap-applies-reward"
                />
              </HStack>
            )}
          />

          <Controller
            control={form.control}
            name="postCapRate"
            render={({ field, fieldState }) => (
              <TextField
                label="Rate above the cap"
                hint="Leave empty to fall through to the card's base rule"
                value={numericText(field.value)}
                onChangeText={(text) =>
                  field.onChange(text.length === 0 ? null : text.replace(/[^0-9.]/gu, ''))
                }
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                keyboardType="decimal-pad"
                testID="rule-post-cap-rate"
              />
            )}
          />
        </VStack>

        {/* ---- Window ---- */}
        <HStack gap="md" align="flex-start">
          <Controller
            control={form.control}
            name="startsAt"
            render={({ field, fieldState }) => (
              <VStack gap="xs" style={{ flex: 1 }}>
                <TextField
                  label="Starts"
                  hint="YYYY-MM-DD"
                  value={dateText(field.value)}
                  onChangeText={(text) => field.onChange(text.length === 0 ? null : text)}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  maxLength={10}
                  autoCapitalize="none"
                  testID="rule-starts-at"
                />
              </VStack>
            )}
          />
          <Controller
            control={form.control}
            name="endsAt"
            render={({ field, fieldState }) => (
              <VStack gap="xs" style={{ flex: 1 }}>
                <TextField
                  label="Ends"
                  hint="YYYY-MM-DD"
                  value={dateText(field.value)}
                  onChangeText={(text) => field.onChange(text.length === 0 ? null : text)}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  maxLength={10}
                  autoCapitalize="none"
                  testID="rule-ends-at"
                />
              </VStack>
            )}
          />
        </HStack>

        {/* ---- Activation and stacking ---- */}
        <Controller
          control={form.control}
          name="requiresEnrollment"
          render={({ field }) => (
            <Toggle
              label="Needs activating"
              description="The cardholder must activate this bonus with the issuer before it pays"
              value={field.value === true}
              onValueChange={field.onChange}
              testID="rule-requires-enrollment"
            />
          )}
        />

        <Controller
          control={form.control}
          name="isStackable"
          render={({ field }) => (
            <Toggle
              label="Stacks with other rules"
              description="Applies on top of another rule in a different stack group"
              value={field.value === true}
              onValueChange={field.onChange}
              testID="rule-is-stackable"
            />
          )}
        />

        <HStack gap="md" align="flex-start">
          <Controller
            control={form.control}
            name="priority"
            render={({ field, fieldState }) => (
              <VStack gap="xs" style={{ flex: 1 }}>
                <TextField
                  label="Priority"
                  value={numericText(field.value)}
                  onChangeText={(text) => field.onChange(text.replace(/[^0-9]/gu, ''))}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  keyboardType="number-pad"
                  testID="rule-priority"
                />
              </VStack>
            )}
          />
          <Controller
            control={form.control}
            name="stackGroup"
            render={({ field, fieldState }) => (
              <VStack gap="xs" style={{ flex: 1 }}>
                <TextField
                  label="Stack group"
                  value={typeof field.value === 'string' ? field.value : ''}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  autoCapitalize="none"
                  testID="rule-stack-group"
                />
              </VStack>
            )}
          />
        </HStack>

        <Controller
          control={form.control}
          name="notes"
          render={({ field, fieldState }) => (
            <TextField
              label="Notes"
              hint="Anything a later reviewer needs to know"
              value={typeof field.value === 'string' ? field.value : ''}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldState.error?.message}
              multiline
              numberOfLines={2}
              testID="rule-notes"
            />
          )}
        />

        <Badge
          label="Saving does not mark the rule verified — that is a separate, recorded step"
          tone="info"
          glyph="i"
        />

        <HStack gap="md" wrap>
          <Button
            label={ruleId === null ? 'Create rule' : 'Save changes'}
            loading={isSaving}
            onPress={() => void submit()}
            testID="rule-save"
          />
          <Button label="Cancel" variant="ghost" onPress={onCancel} testID="rule-cancel" />
        </HStack>
      </VStack>
    </Card>
  );
}
