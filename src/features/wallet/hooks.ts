/** TanStack Query hooks for the wallet and the catalog. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import {
  getCardProduct,
  searchCardProducts,
  type CardProductDetail,
  type CardProductSummary,
} from '@/features/catalog/api/catalog';
import type { AddUserCardInput, CustomCardProductInput } from '@/domain/schemas';
import { queryKeys } from '@/lib/queryKeys';

import {
  addUserCard,
  archiveUserCard,
  createCustomCardProduct,
  getUserCard,
  listUserCards,
  reorderUserCards,
  restoreUserCard,
  updateUserCard,
  type UpdateUserCardPatch,
  type WalletCard,
} from './api/wallet';

export function useWalletCards(options: { readonly includeArchived?: boolean } = {}) {
  const { isSignedIn } = useAuth();

  return useQuery<WalletCard[]>({
    queryKey: [...queryKeys.wallet.cards(), options.includeArchived ?? false],
    queryFn: () => listUserCards(options),
    enabled: isSignedIn,
  });
}

export function useWalletCard(id: string | undefined) {
  const { isSignedIn } = useAuth();

  return useQuery<WalletCard>({
    queryKey: queryKeys.wallet.card(id ?? ''),
    queryFn: () => getUserCard(id as string),
    enabled: isSignedIn && typeof id === 'string' && id.length > 0,
  });
}

export function useCardProductSearch(search: string) {
  const { isSignedIn } = useAuth();

  return useQuery<CardProductSummary[]>({
    queryKey: queryKeys.catalog.products(search),
    queryFn: () => searchCardProducts(search),
    enabled: isSignedIn,
    // The catalog barely moves; keep results while the user refines a search.
    placeholderData: (previous) => previous,
  });
}

export function useCardProduct(id: string | undefined) {
  const { isSignedIn } = useAuth();

  return useQuery<CardProductDetail>({
    queryKey: queryKeys.catalog.product(id ?? ''),
    queryFn: () => getCardProduct(id as string),
    enabled: isSignedIn && typeof id === 'string' && id.length > 0,
  });
}

/** Invalidates every wallet query. Used after any wallet mutation. */
function useInvalidateWallet() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.wallet.all });
}

export function useAddUserCard() {
  const invalidate = useInvalidateWallet();

  return useMutation({
    mutationFn: (input: AddUserCardInput) => addUserCard(input),
    onSuccess: invalidate,
  });
}

export function useUpdateUserCard() {
  const invalidate = useInvalidateWallet();

  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateUserCardPatch }) =>
      updateUserCard(id, patch),
    onSuccess: invalidate,
  });
}

export function useArchiveUserCard() {
  const invalidate = useInvalidateWallet();

  return useMutation({
    mutationFn: (id: string) => archiveUserCard(id),
    onSuccess: invalidate,
  });
}

export function useRestoreUserCard() {
  const invalidate = useInvalidateWallet();

  return useMutation({
    mutationFn: (id: string) => restoreUserCard(id),
    onSuccess: invalidate,
  });
}

export function useReorderUserCards() {
  const invalidate = useInvalidateWallet();

  return useMutation({
    mutationFn: (orderedIds: readonly string[]) => reorderUserCards(orderedIds),
    onSuccess: invalidate,
  });
}

export function useCreateCustomCardProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CustomCardProductInput) => createCustomCardProduct(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
  });
}
