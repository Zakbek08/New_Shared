/**
 * Screen 11 — Card Details.
 *
 * Everything WalletWise knows about one card in the wallet, plus the settings the
 * user can change: earn rates, cap progress, rotating-category activation, and the
 * source document behind each rate.
 *
 * The rates and their provenance are two views of the same rule rows — the earn-rate
 * card lists them and `SourceSection` cites them, both off the one product query — so
 * a rate can never appear without the evidence for it, or with someone else's.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { ErrorNotice, LoadingState } from '@/components/StateViews';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Divider, HStack, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Toggle } from '@/components/ui/Toggle';
import { VERIFICATION_STATUS_LABELS } from '@/domain/enums';
import { CapTracker } from '@/features/caps/ui/CapTracker';
import { RotatingCategoriesSection } from '@/features/caps/ui/RotatingCategories';
import { SourceSection } from '@/features/provenance/ui/SourceSection';
import {
  useArchiveUserCard,
  useCardProduct,
  useRestoreUserCard,
  useUpdateUserCard,
  useWalletCard,
} from '@/features/wallet/hooks';
import {
  formatCardName,
  formatRewardRate,
  formatUsdCompact,
  formatVerifiedOn,
} from '@/lib/format';
import { decryptLastFour, MASKED_LAST_FOUR } from '@/lib/lastFour';

export default function CardDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // The clock is read here, at the screen's edge, and handed to the cap tracker.
  const asOf = useMemo(() => new Date(), []);

  const card = useWalletCard(id);
  const product = useCardProduct(card.data?.cardProductId);
  const updateCard = useUpdateUserCard();
  const archiveCard = useArchiveUserCard();
  const restoreCard = useRestoreUserCard();

  const [nickname, setNickname] = useState<string | null>(null);
  const [digits, setDigits] = useState<string | null>(null);

  // Seed the nickname field once, from the loaded row.
  useEffect(() => {
    if (card.data !== undefined && nickname === null) {
      setNickname(card.data.nickname ?? '');
    }
  }, [card.data, nickname]);

  useEffect(() => {
    if (card.data === undefined) return;
    let cancelled = false;
    void decryptLastFour(card.data.lastFourCipher, card.data.lastFourKeyId).then((value) => {
      if (!cancelled) setDigits(value);
    });
    return () => {
      cancelled = true;
    };
  }, [card.data]);

  if (card.isPending) {
    return (
      <Screen accessibilityLabel="Card details">
        <LoadingState label="Loading this card" testID="card-details-loading" />
      </Screen>
    );
  }

  if (card.isError || card.data === undefined) {
    return (
      <Screen accessibilityLabel="Card details">
        <ErrorNotice
          error={card.error}
          onRetry={() => void card.refetch()}
          testID="card-details-error"
        />
      </Screen>
    );
  }

  const wallet = card.data;
  const displayName = formatCardName(wallet.productName, wallet.nickname);
  const hasStoredDigits = wallet.lastFourCipher !== null;
  // Read off the product query the Earn rates card already made, rather than
  // fetching a second view of the same card that could disagree with it.
  const ruleIds = (product.data?.rules ?? []).map((rule) => rule.id);

  return (
    <Screen scroll accessibilityLabel={`${displayName} details`} testID="card-details-screen">
      <VStack gap="xl">
        <VStack gap="xs">
          <Text variant="title1" accessibilityRole="header">
            {displayName}
          </Text>
          <Text variant="callout" tone="secondary">
            {wallet.issuerName}
            {hasStoredDigits ? ` · ${digits ?? MASKED_LAST_FOUR}` : ''}
          </Text>
          {hasStoredDigits && digits === null ? (
            <Text variant="caption" tone="tertiary">
              The last four digits were encrypted on a different device, so we cannot show them
              here. Your card still works normally.
            </Text>
          ) : null}
        </VStack>

        <HStack gap="sm" wrap align="flex-start">
          {wallet.isFictional ? <Badge label="Demo data" tone="accent" glyph="i" /> : null}
          {wallet.isUserDefined ? <Badge label="Your own card" tone="neutral" /> : null}
          {wallet.annualFeeUsd > 0 ? (
            <Badge
              label={`${formatUsdCompact(wallet.annualFeeUsd)} annual fee`}
              tone="neutral"
            />
          ) : (
            <Badge label="No annual fee" tone="best" glyph="✓" />
          )}
          {wallet.foreignTransactionFeePercent === 0 ? (
            <Badge label="No FX fee" tone="best" glyph="✓" />
          ) : (
            <Badge
              label={`${wallet.foreignTransactionFeePercent}% FX fee`}
              tone="negative"
              glyph="−"
              accessibilityLabel={`${wallet.foreignTransactionFeePercent} percent foreign transaction fee`}
            />
          )}
        </HStack>

        {/* ---- Earn rates, straight from the rules the engine will read ---- */}
        <Card>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              Earn rates
            </Text>

            {product.isPending ? (
              <LoadingState label="Loading earn rates" />
            ) : product.isError ? (
              <ErrorNotice error={product.error} onRetry={() => void product.refetch()} />
            ) : (product.data?.rules ?? []).length === 0 ? (
              <Text variant="callout" tone="warning">
                No earn rates are recorded for this card yet.
              </Text>
            ) : (
              <VStack gap="md">
                {(product.data?.rules ?? []).map((rule, index) => (
                  <VStack key={rule.id} gap="xs">
                    {index > 0 ? <Divider /> : null}
                    <HStack gap="sm" justify="space-between" align="flex-start">
                      <Text variant="body" style={{ flex: 1 }}>
                        {rule.label}
                      </Text>
                      <Text variant="bodyStrong" tone="accent" tabularNumbers>
                        {formatRewardRate(rule.base_rate + rule.bonus_rate, rule.reward_type)}
                      </Text>
                    </HStack>
                    <HStack gap="sm" wrap align="flex-start">
                      <Badge
                        label={VERIFICATION_STATUS_LABELS[rule.verification_status]}
                        tone={rule.verification_status === 'verified' ? 'best' : 'uncertain'}
                        glyph={rule.verification_status === 'verified' ? '✓' : '!'}
                      />
                      <Badge label={formatVerifiedOn(rule.last_verified_at)} tone="neutral" />
                      {rule.requires_enrollment ? (
                        <Badge label="Needs activation" tone="uncertain" glyph="!" />
                      ) : null}
                      {rule.cap_amount !== null ? (
                        <Badge
                          label={`Capped at ${formatUsdCompact(rule.cap_amount)}`}
                          tone="neutral"
                        />
                      ) : null}
                    </HStack>
                  </VStack>
                ))}
              </VStack>
            )}
          </VStack>
        </Card>

        {/* ---- Settings ---- */}
        <Card>
          <VStack gap="lg">
            <Text variant="title3" accessibilityRole="header">
              Your settings
            </Text>

            <TextField
              label="Nickname"
              hint="Helps you tell similar cards apart."
              value={nickname ?? ''}
              onChangeText={setNickname}
              onBlur={() => {
                const next = (nickname ?? '').trim();
                if (next !== (wallet.nickname ?? '')) {
                  updateCard.mutate({
                    id: wallet.id,
                    patch: { nickname: next.length === 0 ? null : next },
                  });
                }
              }}
              maxLength={40}
              testID="card-details-nickname"
            />

            <Toggle
              label="Preferred card"
              description="Breaks ties in this card's favour, and avoids suggesting a switch away from it for a trivial gain."
              value={wallet.isPreferred}
              onValueChange={(value) =>
                updateCard.mutate({ id: wallet.id, patch: { isPreferred: value } })
              }
              testID="card-details-preferred"
            />

            <Toggle
              label="Include in recommendations"
              description="Turn this off to stop WalletWise suggesting this card, without losing it from your wallet."
              value={!wallet.isExcludedFromRecommendations}
              onValueChange={(value) =>
                updateCard.mutate({
                  id: wallet.id,
                  patch: { isExcludedFromRecommendations: !value },
                })
              }
              testID="card-details-included"
            />

            {updateCard.isError ? (
              <ErrorNotice error={updateCard.error} testID="card-details-update-error" />
            ) : null}
          </VStack>
        </Card>

        <CapTracker asOf={asOf} userCardId={wallet.id} testID="card-details-caps" />

        <RotatingCategoriesSection
          asOf={asOf}
          userCardId={wallet.id}
          testID="card-details-enrollment"
        />

        {/* The same rule list, in the same order, as the Earn rates card above — so
            every rate the user just read has a citation directly beneath it. */}
        <SourceSection ruleIds={ruleIds} asOf={asOf} testID="card-details-sources" />

        {/* ---- Archive / restore ---- */}
        <Card emphasis={wallet.isArchived ? 'neutral' : 'negative'}>
          <VStack gap="md">
            <Text variant="title3" accessibilityRole="header">
              {wallet.isArchived ? 'Archived card' : 'Remove from your wallet'}
            </Text>
            <Text variant="callout" tone="secondary">
              {wallet.isArchived
                ? 'This card is archived. It stays in your history but is never recommended.'
                : 'Archiving keeps your past recommendations explainable. We do not delete the card, because old answers reference it.'}
            </Text>
            {wallet.isArchived ? (
              <Button
                label="Restore this card"
                variant="secondary"
                fullWidth
                loading={restoreCard.isPending}
                onPress={() =>
                  restoreCard.mutate(wallet.id, { onSuccess: () => void card.refetch() })
                }
                testID="card-details-restore"
              />
            ) : (
              <Button
                label="Archive this card"
                variant="danger"
                fullWidth
                loading={archiveCard.isPending}
                onPress={() =>
                  archiveCard.mutate(wallet.id, { onSuccess: () => router.back() })
                }
                accessibilityHint="Stops this card being recommended and hides it from your wallet"
                testID="card-details-archive"
              />
            )}
          </VStack>
        </Card>

        <DisclaimerNotice kind="financial" />
      </VStack>
    </Screen>
  );
}
