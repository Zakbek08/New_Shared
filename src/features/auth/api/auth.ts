/**
 * Authentication data access.
 *
 * The only module that calls Supabase Auth. Everything above it works with
 * `DataError`, so no raw auth message ever reaches a screen.
 *
 * SECURITY: nothing here handles a card credential, and nothing logs a password
 * or a token. The analytics calls carry the event name and nothing else.
 */
import { DISCLAIMER_VERSION } from '@/components/Disclaimers';
import { fromAuthError, fromPostgrestError, toDataError, DataError } from '@/lib/errors';
import { getSupabaseClient } from '@/lib/supabase';
import { identify, resetAnalyticsIdentity, track } from '@/services/analytics';
import type { RegistrationInput, SignInInput } from '@/domain/schemas';
import type { UserRow } from '@/types/database';
import { isDemoMode } from '@/config/env';
import { demoProfile } from '@/features/demo/demoStore';

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string | null;
}

/**
 * Registers an account.
 *
 * `needsEmailConfirmation` is true when Supabase created the user but withheld a
 * session pending confirmation, which is the configured behaviour
 * (`enable_confirmations = true` in `supabase/config.toml`). The caller shows a
 * "check your inbox" state rather than pretending sign-in succeeded.
 */
export async function signUp(
  input: RegistrationInput,
): Promise<{ user: AuthenticatedUser; needsEmailConfirmation: boolean }> {
  const supabase = getSupabaseClient();

  try {
    // The form defaults this to '', which is not a name. Treat blank as absent
    // rather than storing an empty display name.
    const displayName = input.displayName?.trim() ?? '';

    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        // Stored on auth.users.raw_user_meta_data. Display only.
        data: displayName.length === 0 ? {} : { display_name: displayName },
      },
    });

    if (error !== null) throw fromAuthError(error);
    if (data.user === null) {
      throw new DataError('unknown', 'We could not create your account. Please try again.');
    }

    track('sign_up_succeeded');
    identify(data.user.id);

    return {
      user: { id: data.user.id, email: data.user.email ?? null },
      needsEmailConfirmation: data.session === null,
    };
  } catch (cause) {
    throw toDataError(cause);
  }
}

export async function signIn(input: SignInInput): Promise<AuthenticatedUser> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error !== null) throw fromAuthError(error);
    if (data.user === null) {
      throw new DataError('unauthenticated', 'That email or password is not right.');
    }

    track('sign_in_succeeded');
    identify(data.user.id);

    return { id: data.user.id, email: data.user.email ?? null };
  } catch (cause) {
    throw toDataError(cause);
  }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase.auth.signOut();
    if (error !== null) throw fromAuthError(error);

    track('sign_out');
    resetAnalyticsIdentity();
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Sends a password-reset email.
 *
 * Resolves successfully even for an address with no account: telling the caller
 * which addresses exist would be an enumeration oracle. The UI says "if that
 * address has an account, we have sent a link" either way.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'walletwise://reset-password',
    });
    // A rate limit is worth surfacing; anything else is swallowed so the
    // response does not vary by whether the account exists.
    if (error !== null) {
      const mapped = fromAuthError(error);
      if (mapped.kind === 'rate_limited') throw mapped;
    }
  } catch (cause) {
    const mapped = toDataError(cause);
    if (mapped.kind === 'rate_limited') throw mapped;
  }
}

/** Sets a new password for the signed-in user. */
export async function updatePassword(newPassword: string): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error !== null) throw fromAuthError(error);
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * The signed-in user's profile row.
 *
 * Created by the `on_auth_user_created` trigger, not by this client — there is
 * no INSERT policy on `public.users`. A missing row means the trigger has not
 * caught up, so `null` is returned rather than an error.
 */
export async function getProfile(): Promise<UserRow | null> {
  if (isDemoMode()) return demoProfile();

  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase.from('users').select('*').limit(1).maybeSingle();

    if (error !== null) throw fromPostgrestError(error);
    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Records that the user accepted the current disclaimers.
 *
 * Requirement 7: the acceptance is versioned, so changing the wording can
 * prompt for it again rather than silently assuming consent.
 */
export async function acceptDisclaimers(version: string = DISCLAIMER_VERSION): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null) throw fromAuthError(userError);
    if (userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const { error } = await supabase
      .from('users')
      .update({
        disclaimers_accepted_version: version,
        disclaimers_accepted_at: new Date().toISOString(),
      })
      // RLS already limits this to the caller's own row. Filtering on the id as
      // well means an unscoped update cannot even be expressed here.
      .eq('id', userData.user.id);

    if (error !== null) throw fromPostgrestError(error);

    track('disclaimers_accepted');
  } catch (cause) {
    throw toDataError(cause);
  }
}

/** Whether the user has accepted the current disclaimer version. */
export function hasAcceptedCurrentDisclaimers(profile: UserRow | null): boolean {
  return profile?.disclaimers_accepted_version === DISCLAIMER_VERSION;
}
