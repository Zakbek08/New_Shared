/**
 * One card in the wallet list.
 *
 * The last four digits are decrypted here, on demand, and fall back to a mask
 * when this device holds no key for them — which happens legitimately after a
 * reinstall or on a second phone. See `lastFour.ts`.
 */
import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { VERIFICATION_STATUS_LABELS } from '@/domain/enums';
import { formatCardName, formatUsdCompact } from '@/lib/format';
import { decryptLastFour, MASKED_LAST_FOUR } from '@/lib/lastFour';
import { useTheme } from '@/theme/ThemeProvider';
import type { VerificationStatus } from '@/types/database';

import type { WalletCard } from '../api/wallet';

/** Which statuses deserve an amber badge rather than passing silently. */
const CAUTION_STATUSES: ReadonlySet<VerificationStatus> = new Set([
  'unverified',
  'user_reported',
  'stale',
  'disputed',
]);

export function WalletCardRow({
  card,
  onPress,
  testID,
}: {
  readonly card: WalletCard;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  const theme = useTheme();
  const [digits, setDigits] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void decryptLastFour(card.lastFourCipher, card.lastFourKeyId).then((value) => {
      if (!cancelled) setDigits(value);
    });
    return () => {
      cancelled = true;
    };
  }, [card.lastFourCipher, card.lastFourKeyId]);

  const displayName = formatCardName(card.productName, card.nickname);
  const hasStoredDigits = card.lastFourCipher !== null;
  const digitLabel = digits ?? (hasStoredDigits ? MASKED_LAST_FOUR : null);

  const accessibilityLabel = [
    displayName,
    card.issuerName,
    digits === null ? null : `ending ${digits}`,
    card.isPreferred ? 'preferred card' : null,
    card.isExcludedFromRecommendations ? 'excluded from recommendations' : null,
    card.isArchived ? 'archived' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Opens this card's details"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        backgroundColor: pressed ? theme.colors.surfaceSunken : theme.colors.surface,
        borderRadius: theme.radii.lg,
        borderWidth: 1,
        borderColor: card.isPreferred ? theme.colors.primary : theme.colors.border,
        borderLeftWidth: card.isPreferred ? 4 : 1,
        padding: theme.spacing.lg,
        gap: theme.spacing.sm,
        opacity: card.isArchived ? 0.6 : 1,
      })}
    >
      <VStack gap="xs">
        <HStack gap="sm" justify="space-between" align="flex-start">
          <VStack gap="xxs" style={{ flex: 1 }}>
            <Text variant="title3">{displayName}</Text>
            <Text variant="caption" tone="secondary">
              {card.issuerName}
              {digitLabel === null ? '' : ` · ${digitLabel}`}
            </Text>
          </VStack>
        </HStack>

        {card.headline !== null ? (
          <Text variant="callout" tone="secondary">
            {card.headline}
          </Text>
        ) : (
          <Text variant="callout" tone="warning">
            No earn rate recorded yet
          </Text>
        )}

        <HStack gap="sm" wrap align="flex-start">
          {card.isPreferred ? <Badge label="Preferred" tone="accent" glyph="★" /> : null}
          {card.isFictional ? <Badge label="Demo data" tone="accent" glyph="i" /> : null}
          {card.isUserDefined ? <Badge label="Your own card" tone="neutral" /> : null}
          {card.annualFeeUsd > 0 ? (
            <Badge label={`${formatUsdCompact(card.annualFeeUsd)} annual fee`} tone="neutral" />
          ) : null}
          {card.foreignTransactionFeePercent === 0 ? (
            <Badge label="No FX fee" tone="best" glyph="✓" />
          ) : (
            <Badge
              label={`${card.foreignTransactionFeePercent}% FX fee`}
              tone="negative"
              glyph="−"
              accessibilityLabel={`${card.foreignTransactionFeePercent} percent foreign transaction fee`}
            />
          )}
          {card.verificationStatus !== null && CAUTION_STATUSES.has(card.verificationStatus) ? (
            <Badge
              label={VERIFICATION_STATUS_LABELS[card.verificationStatus]}
              tone="uncertain"
              glyph="!"
            />
          ) : null}
          {card.isExcludedFromRecommendations && !card.isArchived ? (
            <Badge label="Not compared" tone="negative" glyph="×" />
          ) : null}
          {card.isArchived ? <Badge label="Archived" tone="neutral" /> : null}
        </HStack>
      </VStack>
    </Pressable>
  );
}
