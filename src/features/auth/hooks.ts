/** TanStack Query hooks for authentication. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { DISCLAIMER_VERSION } from '@/components/Disclaimers';
import type { RegistrationInput, SignInInput } from '@/domain/schemas';
import { queryKeys } from '@/lib/queryKeys';
import type { UserRow } from '@/types/database';

import {
  acceptDisclaimers,
  getProfile,
  hasAcceptedCurrentDisclaimers,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from './api/auth';
import { useAuth } from './AuthProvider';

export function useProfile() {
  const { isSignedIn } = useAuth();

  return useQuery<UserRow | null>({
    queryKey: queryKeys.auth.profile,
    queryFn: getProfile,
    enabled: isSignedIn,
  });
}

/**
 * Whether the current disclaimer version still needs accepting.
 *
 * `false` while the profile is loading, so a brief flash of the acceptance
 * prompt cannot appear for a user who has already agreed.
 */
export function useNeedsDisclaimerAcceptance(): boolean {
  const { data: profile, isPending } = useProfile();
  const { isSignedIn } = useAuth();

  if (!isSignedIn || isPending) return false;
  return !hasAcceptedCurrentDisclaimers(profile ?? null);
}

export function useSignUp() {
  return useMutation({
    mutationFn: (input: RegistrationInput) => signUp(input),
  });
}

export function useSignIn() {
  return useMutation({
    mutationFn: (input: SignInInput) => signIn(input),
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: signOut,
    // AuthProvider clears the cache on the auth-state change too; doing it here
    // as well means the UI never renders stale rows in the gap between the
    // network call resolving and the listener firing.
    onSuccess: () => queryClient.clear(),
  });
}

export function usePasswordReset() {
  return useMutation({
    mutationFn: (email: string) => requestPasswordReset(email),
  });
}

export function useUpdatePassword() {
  return useMutation({
    mutationFn: (password: string) => updatePassword(password),
  });
}

export function useAcceptDisclaimers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => acceptDisclaimers(DISCLAIMER_VERSION),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.auth.profile }),
  });
}
