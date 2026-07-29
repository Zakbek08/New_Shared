/**
 * The app's whole state: a profile and a list of cards, read once at startup.
 *
 * WHY A CONTEXT AND NOT A QUERY CACHE
 * There is no server to be out of date with. Reads happen once, writes are local and
 * always succeed, and every screen wants the same two objects. A fetch-and-cache layer
 * would model a race that cannot occur here.
 *
 * WHY `isReady` MATTERS
 * Reading storage is fast but not synchronous, and the route the user should land on
 * depends entirely on what comes back. Rendering before it does would send a returning
 * user to the sign-in screen for a frame — the single most annoying bug this kind of
 * app can have — so `isReady` gates the decision rather than letting it guess.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import {
  EMPTY_WALLET,
  clearEverything,
  readProfile,
  readWallet,
  writeProfile,
  writeWallet,
  type Profile,
  type Wallet,
} from './storage';

interface LocalStoreValue {
  /** False until storage has been read. No routing decision is valid before it. */
  readonly isReady: boolean;
  readonly profile: Profile | null;
  readonly wallet: Wallet;
  readonly saveProfile: (profile: Profile) => Promise<void>;
  readonly addCard: (cardId: string) => Promise<void>;
  readonly removeCard: (cardId: string) => Promise<void>;
  readonly setActivated: (cardId: string, isActivated: boolean) => Promise<void>;
  readonly startOver: () => Promise<void>;
}

const LocalStoreContext = createContext<LocalStoreValue | null>(null);

export function LocalStoreProvider({ children }: { readonly children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [wallet, setWallet] = useState<Wallet>(EMPTY_WALLET);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      // Both reads together: the routing decision needs both answers, so waiting for
      // them in sequence would show the loading state for twice as long.
      const [storedProfile, storedWallet] = await Promise.all([readProfile(), readWallet()]);
      if (cancelled) return;
      setProfile(storedProfile);
      setWallet(storedWallet);
      setIsReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Writes state first, then storage.
   *
   * The screen updates on the next frame rather than after a round trip to disk, and a
   * failed write cannot leave the UI showing something different from what the user
   * just did — because on this platform a local write does not fail for any reason the
   * app could recover from anyway.
   */
  const persistWallet = useCallback(async (next: Wallet) => {
    setWallet(next);
    await writeWallet(next);
  }, []);

  const value = useMemo<LocalStoreValue>(
    () => ({
      isReady,
      profile,
      wallet,
      saveProfile: async (next) => {
        setProfile(next);
        await writeProfile(next);
      },
      addCard: async (cardId) => {
        if (wallet.cardIds.includes(cardId)) return;
        await persistWallet({ ...wallet, cardIds: [...wallet.cardIds, cardId] });
      },
      removeCard: async (cardId) => {
        // The activation flag goes with the card. Leaving it behind would silently
        // re-apply to a card added again later.
        const activated = { ...wallet.activated };
        delete activated[cardId];
        await persistWallet({
          cardIds: wallet.cardIds.filter((id) => id !== cardId),
          activated,
        });
      },
      setActivated: async (cardId, isActivated) => {
        await persistWallet({
          ...wallet,
          activated: { ...wallet.activated, [cardId]: isActivated },
        });
      },
      startOver: async () => {
        setProfile(null);
        setWallet(EMPTY_WALLET);
        await clearEverything();
      },
    }),
    [isReady, profile, wallet, persistWallet],
  );

  return <LocalStoreContext.Provider value={value}>{children}</LocalStoreContext.Provider>;
}

export function useLocalStore(): LocalStoreValue {
  const context = useContext(LocalStoreContext);
  if (context === null) {
    throw new Error('useLocalStore must be used inside LocalStoreProvider');
  }
  return context;
}
