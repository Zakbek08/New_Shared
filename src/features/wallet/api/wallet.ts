/**
 * Wallet reads and writes.
 *
 * SECURITY: `addUserCard` is the one place in the app that touches card digits.
 * It encrypts them on the device and sends only ciphertext — see `lastFour.ts`.
 * There is no code path here, and no column behind it, capable of carrying a
 * full card number.
 */
import type { AddUserCardInput, CustomCardProductInput } from '@/domain/schemas';
import { fromPostgrestError, toDataError, DataError } from '@/lib/errors';
import { encryptLastFour } from '@/lib/lastFour';
import { getSupabaseClient } from '@/lib/supabase';
import { track } from '@/services/analytics';
import type {
  CardProductRow,
  IssuerRow,
  RewardProgramRow,
  RewardRuleRow,
  UserCardRow,
  VerificationStatus,
} from '@/types/database';

import { issuerNameOf } from '@/features/catalog/api/catalog';
import { isDemoMode } from '@/config/env';
import { demoWalletCards } from '@/features/demo/demoStore';

/** A wallet entry joined to everything the wallet list needs. */
export interface WalletCard {
  readonly id: string;
  readonly cardProductId: string;
  readonly productName: string;
  readonly issuerName: string;
  readonly nickname: string | null;
  /** Ciphertext. Decrypt with `decryptLastFour` at the point of display. */
  readonly lastFourCipher: string | null;
  readonly lastFourKeyId: string | null;
  readonly displayOrder: number;
  readonly isArchived: boolean;
  readonly isExcludedFromRecommendations: boolean;
  readonly isPreferred: boolean;
  readonly accountOpenedOn: string | null;
  readonly notes: string | null;
  readonly annualFeeUsd: number;
  readonly foreignTransactionFeePercent: number;
  readonly isFictional: boolean;
  readonly isUserDefined: boolean;
  readonly rewardProgramName: string | null;
  readonly headline: string | null;
  readonly verificationStatus: VerificationStatus | null;
}

type UserCardWithProduct = UserCardRow & {
  card_products:
    | (CardProductRow & {
        issuers: Pick<IssuerRow, 'name'> | null;
        reward_programs: Pick<RewardProgramRow, 'name'> | null;
        reward_rules: Pick<
          RewardRuleRow,
          'label' | 'kind' | 'base_rate' | 'bonus_rate' | 'is_active' | 'verification_status'
        >[];
      })
    | null;
};

const WALLET_SELECT = `
  *,
  card_products (
    *,
    issuers ( name ),
    reward_programs ( name ),
    reward_rules ( label, kind, base_rate, bonus_rate, is_active, verification_status )
  )
`;

function toWalletCard(row: UserCardWithProduct): WalletCard {
  const product = row.card_products;
  const activeRules = (product?.reward_rules ?? []).filter((rule) => rule.is_active);

  const best = [...activeRules].sort(
    (a, b) => b.base_rate + b.bonus_rate - (a.base_rate + a.bonus_rate),
  )[0];

  return {
    id: row.id,
    cardProductId: row.card_product_id,
    productName: product?.name ?? 'Unknown card',
    issuerName: product === null ? 'Unknown issuer' : issuerNameOf(product),
    nickname: row.nickname,
    lastFourCipher: row.last_four_cipher,
    lastFourKeyId: row.last_four_key_id,
    displayOrder: row.display_order,
    isArchived: row.is_archived,
    isExcludedFromRecommendations: row.is_excluded_from_recommendations,
    isPreferred: row.is_preferred,
    accountOpenedOn: row.account_opened_on,
    notes: row.notes,
    annualFeeUsd: product?.annual_fee_usd ?? 0,
    foreignTransactionFeePercent: product?.foreign_transaction_fee_percent ?? 0,
    isFictional: product?.is_fictional ?? false,
    isUserDefined: product?.is_user_defined ?? false,
    rewardProgramName: product?.reward_programs?.name ?? null,
    headline: best?.label ?? null,
    verificationStatus: best?.verification_status ?? null,
  };
}

/** The user's wallet. RLS scopes it; no `user_id` filter is sent. */
export async function listUserCards(
  options: { readonly includeArchived?: boolean } = {},
): Promise<WalletCard[]> {
  // Demo mode: the bundled fictional wallet. Nothing is archived in it, so the
  // includeArchived option has nothing to filter.
  if (isDemoMode()) return [...demoWalletCards()];

  const supabase = getSupabaseClient();

  try {
    let query = supabase
      .from('user_cards')
      .select(WALLET_SELECT)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (options.includeArchived !== true) {
      query = query.eq('is_archived', false);
    }

    const { data, error } = await query;
    if (error !== null) throw fromPostgrestError(error);

    return ((data ?? []) as unknown as UserCardWithProduct[]).map(toWalletCard);
  } catch (cause) {
    throw toDataError(cause);
  }
}

export async function getUserCard(id: string): Promise<WalletCard> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('user_cards')
      .select(WALLET_SELECT)
      .eq('id', id)
      .single();

    if (error !== null) throw fromPostgrestError(error);
    return toWalletCard(data as unknown as UserCardWithProduct);
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Adds a card to the wallet.
 *
 * The last four digits, if supplied, are encrypted here — before the insert, on
 * the device. If encryption is unavailable the card is still saved, without the
 * digits, because they are a convenience and refusing the whole operation over
 * them would be the wrong trade.
 */
export async function addUserCard(input: AddUserCardInput): Promise<UserCardRow> {
  const supabase = getSupabaseClient();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    let lastFourCipher: string | null = null;
    let lastFourKeyId: string | null = null;

    if (input.lastFour !== undefined) {
      const encrypted = await encryptLastFour(input.lastFour);
      if (encrypted !== null) {
        lastFourCipher = encrypted.cipher;
        lastFourKeyId = encrypted.keyId;
      }
    }

    const { data, error } = await supabase
      .from('user_cards')
      .insert({
        user_id: userData.user.id,
        card_product_id: input.cardProductId,
        nickname: input.nickname ?? null,
        last_four_cipher: lastFourCipher,
        last_four_key_id: lastFourKeyId,
        account_opened_on:
          input.accountOpenedOn === undefined
            ? null
            : input.accountOpenedOn.toISOString().slice(0, 10),
        is_preferred: input.isPreferred,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();

    if (error !== null) throw fromPostgrestError(error);

    // Records that a card was added, and nothing about which one or its digits.
    track('card_added', { hasLastFour: lastFourCipher !== null });

    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

/** Fields a user may change on a wallet entry. Deliberately excludes the digits. */
export interface UpdateUserCardPatch {
  readonly nickname?: string | null;
  readonly displayOrder?: number;
  readonly isPreferred?: boolean;
  readonly isExcludedFromRecommendations?: boolean;
  readonly notes?: string | null;
}

export async function updateUserCard(
  id: string,
  patch: UpdateUserCardPatch,
): Promise<UserCardRow> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('user_cards')
      .update({
        ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
        ...(patch.displayOrder !== undefined ? { display_order: patch.displayOrder } : {}),
        ...(patch.isPreferred !== undefined ? { is_preferred: patch.isPreferred } : {}),
        ...(patch.isExcludedFromRecommendations !== undefined
          ? { is_excluded_from_recommendations: patch.isExcludedFromRecommendations }
          : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error !== null) throw fromPostgrestError(error);
    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Archives rather than deletes.
 *
 * Past recommendations reference this row. Deleting it would break the history
 * screen's ability to explain an answer it already gave.
 */
export async function archiveUserCard(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase
      .from('user_cards')
      .update({ is_archived: true, is_excluded_from_recommendations: true })
      .eq('id', id);

    if (error !== null) throw fromPostgrestError(error);
    track('card_archived');
  } catch (cause) {
    throw toDataError(cause);
  }
}

export async function restoreUserCard(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase
      .from('user_cards')
      .update({ is_archived: false, is_excluded_from_recommendations: false })
      .eq('id', id);

    if (error !== null) throw fromPostgrestError(error);
  } catch (cause) {
    throw toDataError(cause);
  }
}

/** Persists a reordered wallet. Sequential writes: a handful of cards, not a bulk job. */
export async function reorderUserCards(orderedIds: readonly string[]): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    for (const [index, id] of orderedIds.entries()) {
      const { error } = await supabase
        .from('user_cards')
        .update({ display_order: index })
        .eq('id', id);
      if (error !== null) throw fromPostgrestError(error);
    }
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Creates a private card product plus its base earn rule.
 *
 * Two inserts, and Postgres has no client-side transaction over PostgREST, so a
 * failure on the rule leaves an orphan product. We clean it up explicitly rather
 * than leaving a card that silently earns nothing.
 *
 * The rate is stored with `verification_status = 'user_reported'`, which
 * propagates into the confidence of every recommendation that uses it. A
 * user-entered rate is a fact from an unverified source — used exactly as typed,
 * but never presented as confirmed.
 */
export async function createCustomCardProduct(
  input: CustomCardProductInput,
): Promise<CardProductRow> {
  const supabase = getSupabaseClient();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const slug = buildCustomSlug(input.name, userData.user.id);

    const { data: product, error: productError } = await supabase
      .from('card_products')
      .insert({
        slug,
        name: input.name,
        custom_issuer_name: input.issuerName,
        issuer_id: null,
        reward_program_id: null,
        card_kind: input.cardKind,
        network: input.network,
        annual_fee_usd: input.annualFeeUsd,
        foreign_transaction_fee_percent: input.foreignTransactionFeePercent,
        summary: input.summary ?? null,
        is_user_defined: true,
        created_by: userData.user.id,
        is_fictional: false,
        is_active: true,
      })
      .select('*')
      .single();

    if (productError !== null) throw fromPostgrestError(productError);

    const rewardType =
      input.rewardUnit === 'usd'
        ? 'cash_back_percent'
        : input.rewardUnit === 'points'
          ? 'points_per_dollar'
          : 'miles_per_dollar';

    const { error: ruleError } = await supabase.from('reward_rules').insert({
      card_product_id: product.id,
      reward_program_id: null,
      label: describeBaseRule(input),
      kind: 'base',
      reward_type: rewardType,
      reward_unit: input.rewardUnit,
      base_rate: input.baseRate,
      bonus_rate: 0,
      priority: 10,
      stack_group: 'category',
      is_stackable: false,
      cap_amount: null,
      cap_period: 'none',
      verification_status: 'user_reported',
      notes: 'Entered by the cardholder. Not verified against the card terms.',
    });

    if (ruleError !== null) {
      // Roll back by hand so the wallet cannot hold a card with no earn rate.
      await supabase.from('card_products').delete().eq('id', product.id);
      throw fromPostgrestError(ruleError);
    }

    track('custom_card_created');
    return product;
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * A slug unique per user without colliding with the shared catalog.
 *
 * `slug` is globally unique, so a user-defined row needs a suffix. Eight hex
 * characters of the owner's id plus a timestamp is enough, and the id is already
 * visible to its owner in `created_by`.
 */
function buildCustomSlug(name: string, userId: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const owner = userId.replace(/-/g, '').slice(0, 8);
  return `custom-${base || 'card'}-${owner}-${Date.now().toString(36)}`;
}

function describeBaseRule(input: CustomCardProductInput): string {
  const rate = Number.parseFloat(input.baseRate.toFixed(4)).toString();
  if (input.rewardUnit === 'usd') return `${rate}% cash back on every purchase`;
  const noun = input.rewardUnit === 'points' ? 'points' : 'miles';
  return `${rate}x ${noun} on every purchase`;
}
