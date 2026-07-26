/**
 * Offer queries and mutations.
 *
 * Every mutation invalidates the wallet snapshot as well as the offer list, because
 * an offer is an engine input: adding one changes which card wins, and a stale
 * snapshot would leave the dashboard recommending against an offer the user just
 * entered.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { UserOfferInput } from '@/domain/schemas';
import { useAuth } from '@/features/auth/AuthProvider';
import { queryKeys } from '@/lib/queryKeys';
import { track } from '@/services/analytics';
import type { OfferStatus } from '@/types/database';

import {
  createUserOffer,
  deleteUserOffer,
  listUserOffers,
  setOfferStatus,
  type WalletOffer,
} from './api/offers';

export function useUserOffers() {
  const { isSignedIn } = useAuth();

  return useQuery<WalletOffer[]>({
    queryKey: queryKeys.offers.list(),
    queryFn: () => listUserOffers(),
    enabled: isSignedIn,
  });
}

/** Invalidates everything an offer change can affect. */
function useOfferInvalidation() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.offers.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.recommendations.all });
  };
}

export function useCreateOffer() {
  const invalidate = useOfferInvalidation();

  return useMutation({
    mutationFn: (input: UserOfferInput) => createUserOffer(input),
    onSuccess: invalidate,
  });
}

export function useSetOfferStatus() {
  const invalidate = useOfferInvalidation();

  return useMutation({
    mutationFn: (variables: { readonly id: string; readonly status: OfferStatus }) =>
      setOfferStatus(variables.id, variables.status),
    onSuccess: invalidate,
  });
}

export function useDeleteOffer() {
  const invalidate = useOfferInvalidation();

  return useMutation({
    mutationFn: (id: string) => deleteUserOffer(id),
    onSuccess: () => {
      track('offer_removed');
      invalidate();
    },
  });
}
