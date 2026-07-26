import { createSupabaseFake, type SupabaseFake } from '@/test-support/supabaseFake';

const fakeRef: { current: SupabaseFake | null } = { current: null };

jest.mock('@/lib/supabase', () => ({
  getSupabaseClient: () => fakeRef.current?.client,
  resetSupabaseClient: jest.fn(),
}));

import { DISCLAIMER_VERSION } from '@/components/Disclaimers';

import {
  acceptDisclaimers,
  hasAcceptedCurrentDisclaimers,
  requestPasswordReset,
  signIn,
  signOut,
  signUp,
} from './auth';

const USER = { id: 'user-1', email: 'person@example.com' };

type AuthFns = {
  signUp: jest.Mock;
  signInWithPassword: jest.Mock;
  signOut: jest.Mock;
  resetPasswordForEmail: jest.Mock;
  updateUser: jest.Mock;
};

function useFake(config: Parameters<typeof createSupabaseFake>[0] = {}) {
  const fake = createSupabaseFake(config);
  fakeRef.current = fake;
  return { fake, auth: fake.client.auth as unknown as AuthFns };
}

const registration = {
  email: 'person@example.com',
  password: 'Wallet1Wise2',
  confirmPassword: 'Wallet1Wise2',
  acceptedDisclaimers: true,
};

describe('signUp', () => {
  it('reports that confirmation is needed when no session comes back', async () => {
    const { auth } = useFake();
    auth.signUp.mockResolvedValue({ data: { user: USER, session: null }, error: null });

    const result = await signUp(registration);

    expect(result.needsEmailConfirmation).toBe(true);
    expect(result.user).toEqual({ id: 'user-1', email: 'person@example.com' });
  });

  it('reports no confirmation needed when a session is returned', async () => {
    const { auth } = useFake();
    auth.signUp.mockResolvedValue({
      data: { user: USER, session: { access_token: 'x' } },
      error: null,
    });

    await expect(signUp(registration)).resolves.toMatchObject({
      needsEmailConfirmation: false,
    });
  });

  it('sends a display name when one is given', async () => {
    const { auth } = useFake();
    auth.signUp.mockResolvedValue({ data: { user: USER, session: null }, error: null });

    await signUp({ ...registration, displayName: 'Person Example' });

    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { data: { display_name: 'Person Example' } },
      }),
    );
  });

  it('treats a blank display name as absent rather than storing an empty one', async () => {
    const { auth } = useFake();
    auth.signUp.mockResolvedValue({ data: { user: USER, session: null }, error: null });

    // The form defaults this field to ''.
    await signUp({ ...registration, displayName: '   ' });

    expect(auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { data: {} } }),
    );
  });

  it('maps an already-registered address to a conflict', async () => {
    const { auth } = useFake();
    auth.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered', status: 422 },
    });

    await expect(signUp(registration)).rejects.toMatchObject({ kind: 'conflict' });
  });

  it('never passes the password anywhere but the auth call', async () => {
    const { fake, auth } = useFake();
    auth.signUp.mockResolvedValue({ data: { user: USER, session: null }, error: null });

    await signUp(registration);

    // No database write should carry it.
    expect(JSON.stringify(fake.writes)).not.toContain('Wallet1Wise2');
  });
});

describe('signIn', () => {
  it('returns the authenticated user', async () => {
    const { auth } = useFake();
    auth.signInWithPassword.mockResolvedValue({ data: { user: USER }, error: null });

    await expect(
      signIn({ email: 'person@example.com', password: 'Wallet1Wise2' }),
    ).resolves.toEqual({ id: 'user-1', email: 'person@example.com' });
  });

  it('gives the same message for a wrong password as for no account', async () => {
    const { auth } = useFake();
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid login credentials', status: 400 },
    });

    await expect(
      signIn({ email: 'nobody@example.com', password: 'Whatever1A' }),
    ).rejects.toMatchObject({
      kind: 'unauthenticated',
      userMessage: 'That email or password is not right.',
    });
  });

  it('surfaces an unconfirmed email as something the user can act on', async () => {
    const { auth } = useFake();
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { message: 'Email not confirmed', status: 400 },
    });

    await expect(
      signIn({ email: 'person@example.com', password: 'Wallet1Wise2' }),
    ).rejects.toMatchObject({ userMessage: expect.stringMatching(/confirm your email/i) });
  });
});

describe('signOut', () => {
  it('resolves when the sign-out succeeds', async () => {
    const { auth } = useFake();
    auth.signOut.mockResolvedValue({ error: null });

    await expect(signOut()).resolves.toBeUndefined();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  it('maps a failure to a DataError', async () => {
    const { auth } = useFake();
    auth.signOut.mockResolvedValue({ error: { message: 'boom', status: 500 } });

    await expect(signOut()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('requestPasswordReset', () => {
  it('resolves even for an address with no account', async () => {
    // Varying the outcome would turn this into an enumeration oracle.
    const { auth } = useFake();
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: 'User not found', status: 404 },
    });

    await expect(requestPasswordReset('nobody@example.com')).resolves.toBeUndefined();
  });

  it('resolves on success', async () => {
    const { auth } = useFake();
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });

    await expect(requestPasswordReset('person@example.com')).resolves.toBeUndefined();
  });

  it('does surface a rate limit, which the user needs to know about', async () => {
    const { auth } = useFake();
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: 'too many requests', status: 429 },
    });

    await expect(requestPasswordReset('person@example.com')).rejects.toMatchObject({
      kind: 'rate_limited',
    });
  });

  it('sends the app deep link as the redirect target', async () => {
    const { auth } = useFake();
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });

    await requestPasswordReset('person@example.com');

    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      'person@example.com',
      expect.objectContaining({ redirectTo: 'walletwise://reset-password' }),
    );
  });
});

describe('acceptDisclaimers', () => {
  it('records the version and a timestamp, scoped to the caller row', async () => {
    const { fake } = useFake({ user: USER, results: [{ data: null, error: null }] });

    await acceptDisclaimers();

    const payload = fake.writes[0] as Record<string, string>;
    expect(payload['disclaimers_accepted_version']).toBe(DISCLAIMER_VERSION);
    expect(payload['disclaimers_accepted_at']).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Filtered on the caller's own id, so an unscoped update is unexpressible.
    expect(fake.calls).toEqual(
      expect.arrayContaining([{ method: 'eq', args: ['id', USER.id] }]),
    );
    expect(fake.tables).toEqual(['users']);
  });

  it('refuses when there is no session', async () => {
    useFake({ user: null });
    await expect(acceptDisclaimers()).rejects.toMatchObject({ kind: 'unauthenticated' });
  });
});

describe('hasAcceptedCurrentDisclaimers', () => {
  it('is true only for the current version', () => {
    expect(
      hasAcceptedCurrentDisclaimers({
        disclaimers_accepted_version: DISCLAIMER_VERSION,
      } as never),
    ).toBe(true);
  });

  it('is false for an older version, so a wording change re-prompts', () => {
    expect(
      hasAcceptedCurrentDisclaimers({ disclaimers_accepted_version: '2020-01-01' } as never),
    ).toBe(false);
  });

  it('is false when nothing has been accepted, or there is no profile', () => {
    expect(hasAcceptedCurrentDisclaimers({ disclaimers_accepted_version: null } as never)).toBe(
      false,
    );
    expect(hasAcceptedCurrentDisclaimers(null)).toBe(false);
  });
});
