/**
 * On-device storage for the two things WalletWise remembers: who you are, and which
 * cards you hold.
 *
 * WHY THERE IS NO SERVER
 * The app needs neither. It answers "which card should I use?" from a bundled catalog
 * of published rates and a pure function that runs on the device. Nothing it computes
 * depends on anyone else's machine, so shipping a server would add an account system,
 * a password to lose, a breach to worry about and an outage to apologise for, in
 * exchange for nothing the user asked for.
 *
 * The practical consequence, stated plainly in the UI rather than hidden: your details
 * live on this device only. They are not uploaded, not backed up, and clearing your
 * browser data or reinstalling the app loses them.
 *
 * WHAT IS STORED
 * A name, an email address, and a list of card product ids. That is the whole of it.
 * No card numbers, no security codes, no bank credentials, no last-four — the product
 * ids are public catalog references like `chase-freedom-unlimited`, and knowing which
 * card products someone owns is not a credential.
 *
 * EVERY READ IS VALIDATED
 * Storage is untrusted input. It survives app upgrades, gets edited by hand in
 * devtools, and is corrupted by half-finished writes. A malformed record is discarded
 * and treated as absent rather than allowed to crash a screen or, worse, to produce a
 * wallet containing a card that does not exist.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { findMarketCard } from '@/data/marketCards';

/**
 * Keys are versioned. A future change to the shape gets `.v2` and leaves `.v1` where
 * it is, so an old build and a new one cannot fight over one record.
 */
const PROFILE_KEY = 'walletwise.profile.v1';
const WALLET_KEY = 'walletwise.wallet.v1';

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * The email is validated but never verified, and nothing is sent to it.
 *
 * It is asked for because a wallet is personal and a name alone is a weak label, not
 * because there is an inbox at the other end. Saying so in the UI matters: a field
 * that looks like a sign-up but sends no confirmation would otherwise read as broken.
 */
export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(80),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.').max(254),
});

export type Profile = z.infer<typeof profileSchema>;

export async function readProfile(): Promise<Profile | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (raw === null) return null;

  const parsed = profileSchema.safeParse(safeJsonParse(raw));
  // A record we cannot read is the same as no record: the user is asked again rather
  // than shown a broken screen.
  return parsed.success ? parsed.data : null;
}

export async function writeProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// ---------------------------------------------------------------------------
// Wallet
// ---------------------------------------------------------------------------

const walletSchema = z.object({
  cardIds: z.array(z.string()).max(40),
  /**
   * Cards whose rotating or choose-your-own bonus the user says they have switched on
   * with their issuer.
   *
   * WalletWise cannot activate anything — it has no bank connection — so this records
   * what the user tells us and nothing more. Absent means "not activated", which is
   * the safe default: counting an unactivated 5% bonus would recommend a card that
   * pays 1%.
   */
  activated: z.record(z.string(), z.boolean()),
});

export interface Wallet {
  readonly cardIds: readonly string[];
  readonly activated: Readonly<Record<string, boolean>>;
}

export const EMPTY_WALLET: Wallet = { cardIds: [], activated: {} };

export async function readWallet(): Promise<Wallet> {
  const raw = await AsyncStorage.getItem(WALLET_KEY);
  if (raw === null) return EMPTY_WALLET;

  const parsed = walletSchema.safeParse(safeJsonParse(raw));
  if (!parsed.success) return EMPTY_WALLET;

  // Drop ids the catalog no longer has. A card can be retired between app versions,
  // and a stored id with no product behind it would otherwise be a card in the wallet
  // that cannot be priced — an invisible hole in every recommendation.
  const cardIds = [...new Set(parsed.data.cardIds)].filter((id) => findMarketCard(id) !== null);

  return { cardIds, activated: parsed.data.activated };
}

export async function writeWallet(wallet: Wallet): Promise<void> {
  await AsyncStorage.setItem(
    WALLET_KEY,
    JSON.stringify({ cardIds: wallet.cardIds, activated: wallet.activated }),
  );
}

/** Forgets everything. Used by "Start over" on the about screen. */
export async function clearEverything(): Promise<void> {
  await AsyncStorage.multiRemove([PROFILE_KEY, WALLET_KEY]);
}

/** `JSON.parse` that returns `null` instead of throwing on malformed input. */
function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
