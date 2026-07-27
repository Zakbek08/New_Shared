/**
 * Provenance reads for the two detail screens.
 *
 * Catalog provenance is shared, immutable-in-practice data: a rule's source document
 * changes when a curator re-verifies it, which is measured in weeks. So it is cached
 * for a long time rather than refetched every time the user opens a card, and it is
 * never invalidated by a wallet mutation — adding a card cannot change where a rate
 * came from.
 */
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { queryKeys } from '@/lib/queryKeys';

import { listRuleProvenance, type RuleProvenance } from './api/provenance';

/** An hour. Long enough to be free on a back-and-forth, short enough to notice an edit. */
const PROVENANCE_STALE_TIME_MS = 60 * 60 * 1000;

/**
 * Provenance for a set of rules, keyed on the sorted id list.
 *
 * Disabled on an empty list rather than returning an empty result, so a screen that
 * has not loaded its rules yet stays in the pending state instead of flashing "no
 * source recorded" and then filling in.
 */
export function useRuleProvenance(ruleIds: readonly string[]) {
  const { isSignedIn } = useAuth();

  return useQuery<readonly RuleProvenance[]>({
    queryKey: queryKeys.provenance.rules(ruleIds),
    queryFn: () => listRuleProvenance(ruleIds),
    enabled: isSignedIn && ruleIds.length > 0,
    staleTime: PROVENANCE_STALE_TIME_MS,
  });
}
