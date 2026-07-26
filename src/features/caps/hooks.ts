/**
 * Cap progress, rotating categories and expiring offers.
 *
 * All three are *derived*, not fetched: the wallet snapshot the engine already needs
 * contains every rule, cap-usage row and offer, so these hooks run a pure function
 * over data that is already in the cache. One fetch feeds the dashboard, the cap
 * tracker and the reminders, and none of them can disagree with the engine.
 */
import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  activeRotatingCategories,
  capAlerts,
  capProgressForWallet,
  expiringOffers,
  pendingActivations,
  type CapProgressEntry,
  type OfferExpiry,
  type RotatingCategoryPeriod,
  type UsageDelta,
} from '@/domain/rewards';
import { useWalletSnapshot } from '@/features/recommendations/hooks';
import { queryKeys } from '@/lib/queryKeys';
import type { EnrollmentStatus } from '@/types/database';

import { adjustCapUsage, recordRewardUsage, setRuleEnrollment } from './api/usage';

export interface WalletAlerts {
  readonly capProgress: readonly CapProgressEntry[];
  readonly capAlerts: readonly CapProgressEntry[];
  readonly rotatingCategories: readonly RotatingCategoryPeriod[];
  readonly pendingActivations: readonly RotatingCategoryPeriod[];
  readonly expiringOffers: readonly OfferExpiry[];
}

const EMPTY_ALERTS: WalletAlerts = {
  capProgress: [],
  capAlerts: [],
  rotatingCategories: [],
  pendingActivations: [],
  expiringOffers: [],
};

/**
 * Everything the dashboard needs to warn about, derived from one snapshot.
 *
 * `asOf` is supplied by the caller — the screen reads the clock at its edge and
 * passes the instant down, so the derivation stays pure and a test can pin it.
 */
export function useWalletAlerts(asOf: Date) {
  const snapshot = useWalletSnapshot();

  const alerts = useMemo<WalletAlerts>(() => {
    if (snapshot.data === undefined) return EMPTY_ALERTS;

    const progress = capProgressForWallet(snapshot.data.cards, asOf);

    return {
      capProgress: progress,
      capAlerts: capAlerts(progress),
      rotatingCategories: activeRotatingCategories(snapshot.data.cards, asOf),
      pendingActivations: pendingActivations(snapshot.data.cards, asOf),
      expiringOffers: expiringOffers(snapshot.data.cards, asOf),
    };
  }, [snapshot.data, asOf]);

  return {
    alerts,
    isPending: snapshot.isPending,
    isError: snapshot.isError,
    error: snapshot.error,
    refetch: snapshot.refetch,
    hasCards: (snapshot.data?.cards.length ?? 0) > 0,
  };
}

function useCapInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.caps.all });
    // Cap usage and enrollment both live inside the snapshot, so the engine's next
    // answer must be recomputed from fresh data rather than served from the cache.
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations.all });
  };
}

export function useRecordUsage() {
  const invalidate = useCapInvalidation();

  return useMutation({
    mutationFn: (delta: UsageDelta) => recordRewardUsage(delta),
    onSuccess: invalidate,
  });
}

export function useAdjustCapUsage() {
  const invalidate = useCapInvalidation();

  return useMutation({
    mutationFn: (input: Parameters<typeof adjustCapUsage>[0]) => adjustCapUsage(input),
    onSuccess: invalidate,
  });
}

export function useSetRuleEnrollment() {
  const invalidate = useCapInvalidation();

  return useMutation({
    mutationFn: (variables: {
      readonly userCardId: string;
      readonly rewardRuleId: string;
      readonly status: EnrollmentStatus;
    }) => setRuleEnrollment(variables),
    onSuccess: invalidate,
  });
}
