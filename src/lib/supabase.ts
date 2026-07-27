/**
 * Typed Supabase client.
 *
 * The session is persisted in the platform keystore (Keychain on iOS, Keystore-
 * backed EncryptedSharedPreferences on Android) via `expo-secure-store`, not in
 * AsyncStorage. AsyncStorage is unencrypted; a refresh token does not belong
 * there.
 *
 * SecureStore has a 2048-byte per-item limit and Supabase sessions can exceed it,
 * so the adapter below chunks values transparently.
 */
import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { getEnv } from '@/config/env';
import { DataError } from '@/lib/errors';
import type { Database } from '@/types/database';

/** SecureStore rejects keys outside this character set. */
const sanitiseKey = (key: string): string => key.replace(/[^A-Za-z0-9._-]/g, '_');

/** Comfortably under SecureStore's 2048-byte warning threshold. */
const CHUNK_SIZE = 1800;

const chunkKey = (key: string, index: number): string => `${sanitiseKey(key)}__${index}`;
const countKey = (key: string): string => `${sanitiseKey(key)}__count`;

/**
 * A `Storage`-shaped adapter over SecureStore that splits oversized values.
 *
 * On web SecureStore is unavailable, so we fall back to `localStorage`. Web is a
 * development convenience for WalletWise, not a supported target.
 */
const secureStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    }

    const rawCount = await SecureStore.getItemAsync(countKey(key));
    if (rawCount === null) return null;

    const count = Number.parseInt(rawCount, 10);
    if (!Number.isInteger(count) || count < 1) return null;

    const parts: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, index));
      // A missing chunk means a partially-written value; treat it as absent so
      // the user simply signs in again rather than seeing a corrupt session.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }

    // Clear any longer previous value first, so stale chunks cannot be revived.
    await secureStorageAdapter.removeItem(key);

    const chunkCount = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    for (let index = 0; index < chunkCount; index += 1) {
      const slice = value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
      await SecureStore.setItemAsync(chunkKey(key, index), slice);
    }
    await SecureStore.setItemAsync(countKey(key), String(chunkCount));
  },

  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      return;
    }

    const rawCount = await SecureStore.getItemAsync(countKey(key));
    const count = rawCount === null ? 0 : Number.parseInt(rawCount, 10);
    if (Number.isInteger(count)) {
      for (let index = 0; index < count; index += 1) {
        await SecureStore.deleteItemAsync(chunkKey(key, index));
      }
    }
    await SecureStore.deleteItemAsync(countKey(key));
  },
};

export type WalletWiseClient = SupabaseClient<Database, 'public'>;

let client: WalletWiseClient | null = null;

/**
 * A client that refuses every operation, for demo mode.
 *
 * A Proxy rather than a hand-written stub: it covers the whole surface, including
 * parts of the API this app does not use yet, so a new call site cannot slip
 * through unnoticed.
 */
function demoRefusingClient(): WalletWiseClient {
  const refuse = (property: string): never => {
    throw new DataError(
      // `forbidden` rather than `network`: nothing is wrong with the connection,
      // this build simply has no account behind it. `isRetryable` is false for
      // this kind, so the UI will not invite a pointless retry.
      'forbidden',
      'That part of WalletWise needs an account, and this is the demonstration build. ' +
        'The wallet, the purchase assistant and the recommendation all work here.',
      `demo:supabase.${property}`,
    );
  };

  return new Proxy(
    {},
    {
      get: (_target, property) => refuse(String(property)),
    },
  ) as WalletWiseClient;
}

/**
 * The shared client. Created lazily so that importing this module does not force
 * environment validation at bundle time.
 */
export function getSupabaseClient(): WalletWiseClient {
  if (client !== null) return client;

  const env = getEnv();

  // Demo mode has no project to talk to. Every screen the demo covers reads from
  // `src/features/demo/`, so reaching here means a path was not covered — and the
  // right outcome is a loud, immediate refusal rather than a request to a
  // placeholder host.
  //
  // WHY THIS MATTERS MORE THAN IT LOOKS
  // Without it, an uncovered call goes to a hostname that does not resolve. The
  // request neither succeeds nor fails promptly, so the promise never settles; a
  // mutation whose onSuccess awaits `invalidateQueries` then hangs on a spinner
  // for ever, with no error anywhere. That is exactly what happened, and it took
  // a stage-by-stage trace to find. Failing fast turns a silent hang into a
  // visible message naming the operation.
  if (env.demoMode) {
    client = demoRefusingClient();
    return client;
  }

  client = createClient<Database, 'public'>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: secureStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no URL bar, so there is no callback fragment to parse.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-walletwise-client': 'mobile' },
    },
    db: { schema: 'public' },
  });

  return client;
}

/** Test seam: drops the memoised client so a fresh env can take effect. */
export function resetSupabaseClient(): void {
  client = null;
}

export { secureStorageAdapter as __secureStorageAdapterForTests };
