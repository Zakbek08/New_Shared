/**
 * Screen 13 — Reward Preferences.
 *
 * Where the user decides what a point or a mile is worth. This is the single
 * biggest lever on the recommendation, and the reason two people with identical
 * wallets can correctly get different answers.
 *
 * Every control here changes an engine input, so saving one invalidates the wallet
 * snapshot and the "what your settings do right now" card below re-ranks on the spot.
 * A preferences screen whose effect you cannot see is a preferences screen nobody
 * trusts.
 */
import { useMemo, useState } from 'react';

import { DisclaimerNotice } from '@/components/Disclaimers';
import { EmptyState, ErrorNotice, LoadingState } from '@/components/StateViews';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Divider, VStack } from '@/components/ui/Stack';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Toggle } from '@/components/ui/Toggle';
import {
  useSaveGlobalPreferences,
  useSaveValuation,
  useWalletValuations,
} from '@/features/preferences/hooks';
import { ValuationImpact } from '@/features/preferences/ui/ValuationImpact';
import { ValuationRow } from '@/features/preferences/ui/ValuationRow';
import { formatUsd } from '@/lib/format';

export default function RewardPreferencesScreen() {
  const valuations = useWalletValuations();
  const saveValuation = useSaveValuation();
  const saveGlobal = useSaveGlobalPreferences();

  // Read once per mount and passed down, so the engine below never reads a clock.
  const asOf = useMemo(() => new Date(), []);

  const [switchDraft, setSwitchDraft] = useState<string | null>(null);
  const threshold = valuations.data?.minimumSwitchBenefitUsd ?? 0;
  const switchValue = switchDraft ?? String(threshold);

  return (
    <Screen scroll accessibilityLabel="Reward preferences" testID="preferences-screen">
      <VStack gap="xl">
        <VStack gap="sm">
          <Text variant="title1" accessibilityRole="header">
            Reward preferences
          </Text>
          <Text variant="body" tone="secondary">
            What is a point worth to you? WalletWise uses your answer, not an industry average.
          </Text>
        </VStack>

        <Card>
          <VStack gap="sm">
            <Text variant="title3" accessibilityRole="header">
              Why this matters
            </Text>
            <Text variant="callout" tone="secondary">
              A card earning 10x on a currency you value at 0.6¢ per point returns 6% — while 3x
              on a currency you value at 1.3¢ returns 3.9%. Whether the first card wins depends
              entirely on how you redeem, which is something only you know. Set the numbers here
              and every comparison in the app follows them.
            </Text>
          </VStack>
        </Card>

        {saveValuation.isError ? (
          <ErrorNotice error={saveValuation.error} testID="preferences-save-error" />
        ) : null}
        {saveGlobal.isError ? (
          <ErrorNotice error={saveGlobal.error} testID="preferences-global-error" />
        ) : null}

        {/* ---- Per-program valuations ---- */}
        {valuations.isPending ? (
          <LoadingState label="Loading your valuations" />
        ) : valuations.isError ? (
          <ErrorNotice
            error={valuations.error}
            onRetry={() => void valuations.refetch()}
            testID="preferences-error"
          />
        ) : valuations.data.programs.length === 0 ? (
          <EmptyState
            title="Nothing to value yet"
            description="None of your cards earns points or miles, so there is nothing to put a value on. Cash back needs no valuation — a dollar is a dollar."
            testID="preferences-valuations-empty"
          />
        ) : (
          <Card testID="preferences-valuations">
            <VStack gap="lg">
              <VStack gap="xxs">
                <Text variant="title3" accessibilityRole="header">
                  Your valuations
                </Text>
                <Text variant="caption" tone="secondary">
                  One figure per reward currency your cards earn.
                </Text>
              </VStack>

              {valuations.data.programs.map((program, index) => (
                <VStack key={program.rewardProgramId} gap="lg">
                  {index === 0 ? null : <Divider />}
                  <ValuationRow
                    program={program}
                    isSaving={saveValuation.isPending}
                    onSave={(centsPerUnit) =>
                      saveValuation.mutate({
                        rewardProgramId: program.rewardProgramId,
                        unit: program.unit,
                        centsPerUnit,
                        prefersCashBackOnly: valuations.data.prefersCashBackOnly,
                        minimumSwitchBenefitUsd: valuations.data.minimumSwitchBenefitUsd,
                      })
                    }
                    testID={`preferences-program-${program.rewardProgramId}`}
                  />
                </VStack>
              ))}
            </VStack>
          </Card>
        )}

        {/* ---- The live effect ---- */}
        <ValuationImpact asOf={asOf} testID="preferences-impact" />

        {/* ---- Cash back only ---- */}
        <Card testID="preferences-cash-only">
          <VStack gap="md">
            <Toggle
              label="Cash back only"
              description="Ignores points and miles entirely and ranks on cash back alone"
              value={valuations.data?.prefersCashBackOnly ?? false}
              disabled={valuations.isPending || saveGlobal.isPending}
              onValueChange={(next) => saveGlobal.mutate({ prefersCashBackOnly: next })}
              testID="preferences-cash-only-toggle"
            />
            <Text variant="footnote" tone="tertiary">
              With this on, a points card is reported as ineligible rather than valued at zero,
              so you can see it was excluded by your own choice.
            </Text>
          </VStack>
        </Card>

        {/* ---- Minimum switch benefit ---- */}
        <Card testID="preferences-switch-threshold">
          <VStack gap="md">
            <VStack gap="xxs">
              <Text variant="title3" accessibilityRole="header">
                Minimum switch benefit
              </Text>
              <Text variant="callout" tone="secondary">
                How much extra a card must earn before we suggest reaching for it instead of
                your preferred card. Stops three-cent recommendations.
              </Text>
            </VStack>

            <TextField
              label="Do not suggest switching for less than"
              hint="In US dollars. At $0.00 every gain counts, however small."
              value={switchValue}
              onChangeText={(text) => setSwitchDraft(text.replace(/[^0-9.]/gu, ''))}
              keyboardType="decimal-pad"
              testID="preferences-switch-input"
            />

            <Button
              label="Save threshold"
              variant="secondary"
              loading={saveGlobal.isPending}
              disabled={switchDraft === null || switchDraft === String(threshold)}
              onPress={() => {
                const parsed = Number(switchDraft ?? '');
                if (!Number.isFinite(parsed) || parsed < 0) return;
                saveGlobal.mutate({ minimumSwitchBenefitUsd: parsed });
                setSwitchDraft(null);
              }}
              accessibilityHint="Saves the threshold and applies it to every later comparison"
              testID="preferences-switch-save"
            />

            <Text variant="footnote" tone="tertiary">
              Currently set to {formatUsd(threshold)}. When a rival beats your preferred card by
              less than this, we keep your preferred card and say why.
            </Text>
          </VStack>
        </Card>

        <DisclaimerNotice kind="estimate" />
      </VStack>
    </Screen>
  );
}
