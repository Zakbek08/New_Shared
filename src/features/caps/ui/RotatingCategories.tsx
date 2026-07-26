/**
 * This period's rotating categories, and the activation reminder.
 *
 * Both regions come from one pure derivation (`activeRotatingCategories`), so the
 * list and the reminder cannot disagree about what is live.
 *
 * The activation button records what the user tells us — it does **not** activate
 * anything with the issuer. WalletWise has no bank connection and never will, so the
 * copy says "I have activated this" rather than "Activate", which would promise
 * something the app cannot do.
 */
import { EmptyState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { getCategoryById } from '@/domain/categories';
import type { RotatingCategoryPeriod } from '@/domain/rewards';
import { useSetRuleEnrollment, useWalletAlerts } from '@/features/caps/hooks';
import { formatUsdCompact } from '@/lib/format';

function categoryNames(categoryIds: readonly string[]): string {
  const names = categoryIds.map(
    (id) => getCategoryById(id)?.displayName ?? 'an unlisted category',
  );
  if (names.length === 0) return 'every purchase';
  if (names.length === 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

function endsHint(period: RotatingCategoryPeriod): string {
  if (period.daysUntilPeriodEnds === null) return 'No end date given.';
  if (period.daysUntilPeriodEnds <= 1) return 'Ends today.';
  return `Ends in ${period.daysUntilPeriodEnds} days.`;
}

export function RotatingCategoryRow({
  period,
  onActivated,
  isSaving,
}: {
  readonly period: RotatingCategoryPeriod;
  readonly onActivated: (period: RotatingCategoryPeriod) => void;
  readonly isSaving: boolean;
}) {
  const needsActivation = period.requiresActivation && !period.isActivated;

  return (
    <VStack gap="sm" testID={`rotating-${period.ruleId}`}>
      <VStack gap="xxs">
        <Text variant="bodyStrong">{categoryNames(period.categoryIds)}</Text>
        <Text variant="caption" tone="secondary">
          {period.cardName} · {period.ruleLabel}
        </Text>
      </VStack>

      <HStack gap="sm" wrap align="flex-start">
        {needsActivation ? (
          <Badge label="Not activated" tone="uncertain" glyph="!" />
        ) : period.requiresActivation ? (
          <Badge label="Activated" tone="best" glyph="✓" />
        ) : (
          <Badge label="No activation needed" tone="neutral" />
        )}
        {period.capAmountUsd === null ? null : (
          <Badge label={`${formatUsdCompact(period.capAmountUsd)} cap`} tone="neutral" />
        )}
      </HStack>

      <Text variant="caption" tone="tertiary">
        {endsHint(period)}
      </Text>

      {needsActivation ? (
        <Button
          label="I have activated this"
          variant="secondary"
          loading={isSaving}
          onPress={() => onActivated(period)}
          accessibilityHint="Records that you activated this bonus with your issuer. WalletWise cannot activate it for you."
          testID={`rotating-activate-${period.ruleId}`}
        />
      ) : null}
    </VStack>
  );
}

/**
 * The dashboard's activation reminder.
 *
 * Renders nothing when there is nothing to activate. An unactivated bonus is money
 * the user is losing right now, so this appears from the first day of the period
 * rather than only near the deadline.
 */
export function ActivationRemindersSection({
  asOf,
  testID,
}: {
  readonly asOf: Date;
  readonly testID?: string;
}) {
  const { alerts, isPending, isError } = useWalletAlerts(asOf);
  const enroll = useSetRuleEnrollment();

  if (isPending || isError || alerts.pendingActivations.length === 0) return null;

  return (
    <Card emphasis="uncertain" testID={testID}>
      <VStack gap="md">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            Activate to earn
          </Text>
          <Text variant="callout" tone="secondary">
            {alerts.pendingActivations.length === 1
              ? 'One bonus is running now but is not activated, so it is paying the base rate instead.'
              : `${alerts.pendingActivations.length} bonuses are running now but are not activated, so they are paying the base rate instead.`}
          </Text>
        </VStack>

        <VStack gap="lg">
          {alerts.pendingActivations.map((period) => (
            <RotatingCategoryRow
              key={`${period.userCardId}-${period.ruleId}`}
              period={period}
              isSaving={enroll.isPending}
              onActivated={(target) =>
                enroll.mutate({
                  userCardId: target.userCardId,
                  rewardRuleId: target.ruleId,
                  status: 'enrolled',
                })
              }
            />
          ))}
        </VStack>

        <Text variant="footnote" tone="tertiary">
          Activate the bonus in your issuer&apos;s app or website, then tell us here. WalletWise
          never signs in to your bank.
        </Text>
      </VStack>
    </Card>
  );
}

/**
 * Every rotating period currently running, activated or not.
 *
 * Pass `userCardId` to scope it to one card, as the card-details screen does.
 */
export function RotatingCategoriesSection({
  asOf,
  userCardId,
  testID,
}: {
  readonly asOf: Date;
  readonly userCardId?: string;
  readonly testID?: string;
}) {
  const { alerts, isPending, isError, hasCards } = useWalletAlerts(asOf);
  const enroll = useSetRuleEnrollment();

  const periods =
    userCardId === undefined
      ? alerts.rotatingCategories
      : alerts.rotatingCategories.filter((period) => period.userCardId === userCardId);

  if (isPending || isError) return null;

  if (periods.length === 0) {
    if (!hasCards) return null;
    return (
      <EmptyState
        title="No rotating categories this period"
        description="None of your cards has a rotating bonus running right now. When one opens, its categories and activation state appear here."
        testID="rotating-empty"
      />
    );
  }

  return (
    <Card testID={testID}>
      <VStack gap="lg">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            Rotating categories now
          </Text>
          <Text variant="caption" tone="secondary">
            Soonest to end first.
          </Text>
        </VStack>

        {periods.map((period) => (
          <RotatingCategoryRow
            key={`${period.userCardId}-${period.ruleId}`}
            period={period}
            isSaving={enroll.isPending}
            onActivated={(target) =>
              enroll.mutate({
                userCardId: target.userCardId,
                rewardRuleId: target.ruleId,
                status: 'enrolled',
              })
            }
          />
        ))}
      </VStack>
    </Card>
  );
}
