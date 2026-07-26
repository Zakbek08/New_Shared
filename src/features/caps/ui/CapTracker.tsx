/**
 * The spending-cap tracker.
 *
 * Answers three questions per bonus: how much is left, when it resets, and whether
 * the bonus is even active. Each figure carries the estimate disclaimer, because
 * WalletWise is guessing at a statement cycle it cannot see and only knows about the
 * purchases the user confirmed.
 */
import { DisclaimerNotice } from '@/components/Disclaimers';
import { EmptyState, ErrorNotice, LoadingState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { ProgressBar, type ProgressTone } from '@/components/ui/ProgressBar';
import { Divider, HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { CAP_PERIOD_LABELS } from '@/domain/enums';
import { CAP_ESTIMATE_DISCLAIMER, type CapProgressEntry } from '@/domain/rewards';
import { useWalletAlerts } from '@/features/caps/hooks';
import { formatUsd, formatUsdCompact } from '@/lib/format';

/** Amber at 80% used, red once exhausted. The text label says the same thing. */
const TONE_BY_STATUS: Readonly<Record<CapProgressEntry['status'], ProgressTone>> = {
  ample: 'success',
  nearly_reached: 'warning',
  exhausted: 'danger',
};

const LABEL_BY_STATUS: Readonly<Record<CapProgressEntry['status'], string>> = {
  ample: 'Room left',
  nearly_reached: 'Nearly used up',
  exhausted: 'Fully used',
};

function resetHint(entry: CapProgressEntry): string {
  if (entry.daysUntilReset === null) return 'This cap never resets.';
  if (entry.daysUntilReset === 0) return 'Resets today.';
  if (entry.daysUntilReset === 1) return 'Resets tomorrow.';
  return `Resets in ${entry.daysUntilReset} days.`;
}

export function CapProgressRow({ entry }: { readonly entry: CapProgressEntry }) {
  const unit = entry.appliesTo === 'spend' ? 'spend' : 'reward';

  return (
    <VStack gap="sm" testID={`cap-progress-${entry.ruleId}`}>
      <ProgressBar
        value={entry.utilisation}
        label={entry.ruleLabel}
        valueLabel={`${formatUsd(entry.remainingUsd)} of ${formatUsdCompact(entry.capAmountUsd)} left`}
        tone={TONE_BY_STATUS[entry.status]}
        hint={`${entry.cardName} · ${formatUsd(entry.consumedUsd)} of ${unit} counted · ${resetHint(entry)}`}
      />

      <HStack gap="sm" wrap align="flex-start">
        <Badge
          label={LABEL_BY_STATUS[entry.status]}
          tone={
            entry.status === 'ample'
              ? 'best'
              : entry.status === 'nearly_reached'
                ? 'uncertain'
                : 'negative'
          }
          glyph={entry.status === 'ample' ? undefined : '!'}
        />
        <Badge label={CAP_PERIOD_LABELS[entry.capPeriod]} tone="neutral" />
        {entry.requiresActivation ? (
          <Badge label="Not activated" tone="uncertain" glyph="!" />
        ) : null}
      </HStack>
    </VStack>
  );
}

/**
 * The dashboard's cap alerts: only the bonuses that are nearly or fully used.
 *
 * Renders nothing at all when every cap has room. A section headed "no alerts" is
 * noise on a screen whose job is to surface the exceptions.
 */
export function CapAlertsSection({
  asOf,
  testID,
}: {
  readonly asOf: Date;
  readonly testID?: string;
}) {
  const { alerts, isPending, isError } = useWalletAlerts(asOf);

  if (isPending || isError || alerts.capAlerts.length === 0) return null;

  return (
    <Card emphasis="uncertain" testID={testID}>
      <VStack gap="md">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            Spending-cap alerts
          </Text>
          <Text variant="caption" tone="secondary">
            {alerts.capAlerts.length === 1
              ? 'One bonus is close to its limit.'
              : `${alerts.capAlerts.length} bonuses are close to their limits.`}
          </Text>
        </VStack>

        <VStack gap="lg">
          {alerts.capAlerts.map((entry) => (
            <CapProgressRow key={`${entry.userCardId}-${entry.ruleId}`} entry={entry} />
          ))}
        </VStack>

        <Text variant="footnote" tone="tertiary">
          {CAP_ESTIMATE_DISCLAIMER}
        </Text>
      </VStack>
    </Card>
  );
}

/**
 * The full tracker: every capped bonus, most consumed first.
 *
 * Pass `userCardId` to scope it to one card, which is how the card-details screen
 * uses it. The derivation is shared either way, so the two views cannot disagree.
 */
export function CapTracker({
  asOf,
  userCardId,
  testID,
}: {
  readonly asOf: Date;
  readonly userCardId?: string;
  readonly testID?: string;
}) {
  const { alerts, isPending, isError, error, refetch, hasCards } = useWalletAlerts(asOf);

  const entries =
    userCardId === undefined
      ? alerts.capProgress
      : alerts.capProgress.filter((entry) => entry.userCardId === userCardId);

  if (isPending) return <LoadingState label="Working out your cap progress" />;

  if (isError) {
    return (
      <ErrorNotice error={error} onRetry={() => void refetch()} testID="cap-tracker-error" />
    );
  }

  if (!hasCards) {
    return (
      <EmptyState
        title="Add a card to track caps"
        description="Once your wallet has a card with a capped bonus, its progress appears here."
        testID="cap-tracker-empty"
      />
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title="No capped bonuses"
        description={
          userCardId === undefined
            ? 'None of the bonuses on your cards has a spending limit, so there is nothing to run out of.'
            : 'None of this card’s bonuses has a spending limit, so there is nothing to run out of.'
        }
        testID="cap-tracker-none"
      />
    );
  }

  return (
    <Card testID={testID}>
      <VStack gap="lg">
        <VStack gap="xxs">
          <Text variant="title3" accessibilityRole="header">
            Spending caps
          </Text>
          <Text variant="caption" tone="secondary">
            Every capped bonus in your wallet, most used first.
          </Text>
        </VStack>

        {entries.map((entry, index) => (
          <VStack key={`${entry.userCardId}-${entry.ruleId}`} gap="lg">
            {index === 0 ? null : <Divider />}
            <CapProgressRow entry={entry} />
          </VStack>
        ))}

        <DisclaimerNotice kind="estimate" />
        <Text variant="footnote" tone="tertiary">
          {CAP_ESTIMATE_DISCLAIMER}
        </Text>
      </VStack>
    </Card>
  );
}
