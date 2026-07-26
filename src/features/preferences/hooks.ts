/**
 * Reward-preference queries and mutations.
 *
 * WHY EVERY SAVE INVALIDATES THE WALLET SNAPSHOT
 * A valuation is an engine input. Change it and the ranking genuinely changes — a
 * 3x-points card can overtake a 2% cash-back card on the strength of one edited
 * figure. Leaving the snapshot cached would show the user the old answer under their
 * new settings, which is the one outcome this screen must not produce.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { RewardPreferenceInput } from '@/domain/schemas';
import { useAuth } from '@/features/auth/AuthProvider';
import { queryKeys } from '@/lib/queryKeys';

import {
  loadWalletValuations,
  updateGlobalPreferences,
  upsertRewardPreference,
  type WalletValuations,
} from './api/preferences';

export function useWalletValuations() {
  const { isSignedIn } = useAuth();

  return useQuery<WalletValuations>({
    queryKey: queryKeys.preferences.valuations(),
    queryFn: () => loadWalletValuations(),
    enabled: isSignedIn,
  });
}

function usePreferenceInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.preferences.all });
    // The snapshot carries the valuation the engine uses. This is the invalidation
    // that makes "changing a valuation changes the ranking" visible immediately.
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations.all });
  };
}

export function useSaveValuation() {
  const invalidate = usePreferenceInvalidation();

  return useMutation({
    mutationFn: (input: RewardPreferenceInput) => upsertRewardPreference(input),
    onSuccess: invalidate,
  });
}

export function useSaveGlobalPreferences() {
  const invalidate = usePreferenceInvalidation();

  return useMutation({
    mutationFn: (patch: {
      readonly prefersCashBackOnly?: boolean;
      readonly minimumSwitchBenefitUsd?: number;
    }) => updateGlobalPreferences(patch),
    onSuccess: invalidate,
  });
}
