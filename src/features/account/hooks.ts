/**
 * Export and delete-account mutations.
 *
 * Both are mutations rather than queries even though the export only reads. A
 * query would be cached and refetched in the background, and an export that
 * silently re-ran — re-opening the share sheet — would be a bug. The user asks
 * once, it happens once.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { DataError } from '@/lib/errors';

import { deleteOwnAccount, exportAccountData, type AccountExportResult } from './api/account';

export function useExportAccountData() {
  const { userId } = useAuth();

  return useMutation<AccountExportResult, DataError>({
    mutationFn: () => {
      if (userId === null) {
        throw new DataError('unauthenticated', 'Sign in again to export your data.');
      }
      // The clock is read here, at the edge, and passed down. Everything below
      // this line is testable with a fixed time.
      return exportAccountData(userId, new Date());
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation<void, DataError>({
    mutationFn: () => deleteOwnAccount(),
    onSuccess: () => {
      // Every cached row belongs to an account that no longer exists. Removed
      // rather than invalidated, because there is nothing left to refetch and a
      // refetch would fail against a deleted session.
      //
      // `removeQueries()` and not `clear()`: clear() also empties the *mutation*
      // cache, and this callback runs inside the mutation that would be deleted —
      // pulling the record of a mutation out from under its own success handler.
      // Queries are what needs dropping here; the mutation is none of its business.
      queryClient.removeQueries();
    },
  });
}
