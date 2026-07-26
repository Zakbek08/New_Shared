/**
 * Targeted offers, entered by hand.
 *
 * WalletWise never signs in to a bank and never scrapes an issuer's site, so hand
 * entry is the only mechanism there will ever be. That is a product decision, not a
 * missing feature — see SECURITY.md.
 *
 * Everything written here is scoped by RLS to the signed-in user, and the
 * `user_offers_insert` policy additionally proves the target card is theirs. The
 * `.eq('id', …)` filters below are belt and braces on top of that.
 */
import type { UserOfferInput } from '@/domain/schemas';
import { DataError, fromPostgrestError, toDataError } from '@/lib/errors';
import { getSupabaseClient } from '@/lib/supabase';
import { track } from '@/services/analytics';
import type { OfferStatus, UserOfferRow } from '@/types/database';

/** One offer, with the card it belongs to resolved for display. */
export interface WalletOffer {
  readonly id: string;
  readonly userCardId: string;
  readonly cardName: string;
  readonly merchantId: string | null;
  readonly merchantLabel: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly rewardType: UserOfferRow['reward_type'];
  readonly rewardUnit: UserOfferRow['reward_unit'];
  readonly rate: number;
  readonly fixedAmountUsd: number | null;
  readonly minimumSpendUsd: number;
  readonly maxBenefitUsd: number | null;
  readonly status: OfferStatus;
  readonly channel: UserOfferRow['channel'];
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly isEnrolled: boolean;
  readonly isUserEntered: boolean;
}

const OFFER_SELECT = `
  *,
  user_cards (
    nickname,
    card_products ( name )
  )
`;

type OfferJoinRow = UserOfferRow & {
  user_cards: { nickname: string | null; card_products: { name: string } | null } | null;
};

function toWalletOffer(row: OfferJoinRow): WalletOffer {
  return {
    id: row.id,
    userCardId: row.user_card_id,
    cardName: row.user_cards?.nickname ?? row.user_cards?.card_products?.name ?? 'Unknown card',
    merchantId: row.merchant_id,
    merchantLabel: row.merchant_label,
    title: row.title,
    description: row.description,
    rewardType: row.reward_type,
    rewardUnit: row.reward_unit,
    rate: row.rate,
    fixedAmountUsd: row.fixed_amount_usd,
    minimumSpendUsd: row.minimum_spend_usd,
    maxBenefitUsd: row.max_benefit_usd,
    status: row.status,
    channel: row.channel,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    isEnrolled: row.enrolled_at !== null,
    isUserEntered: row.is_user_entered,
  };
}

/**
 * Every offer the user has entered, newest first.
 *
 * Expired and redeemed offers are included. The screen groups them separately — a
 * user who cannot see what they already redeemed will enter it again.
 */
export async function listUserOffers(): Promise<WalletOffer[]> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('user_offers')
      .select(OFFER_SELECT)
      .order('ends_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error !== null) throw fromPostgrestError(error);
    return ((data ?? []) as unknown as OfferJoinRow[]).map(toWalletOffer);
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Records an offer the user copied across from their issuer.
 *
 * `is_user_entered` is always true: there is no other path into this table, and
 * pretending otherwise would misrepresent where the figure came from.
 */
export async function createUserOffer(input: UserOfferInput): Promise<UserOfferRow> {
  const supabase = getSupabaseClient();

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError !== null || userData.user === null) {
      throw new DataError('unauthenticated', 'Please sign in again.');
    }

    const { data, error } = await supabase
      .from('user_offers')
      .insert({
        user_id: userData.user.id,
        user_card_id: input.userCardId,
        merchant_id: input.merchantId,
        merchant_label: input.merchantLabel ?? null,
        title: input.title,
        description: input.description ?? null,
        reward_type: input.rewardType,
        reward_unit: input.rewardUnit,
        rate: input.rate,
        fixed_amount_usd: input.fixedAmountUsd,
        minimum_spend_usd: input.minimumSpendUsd,
        max_benefit_usd: input.maxBenefitUsd,
        channel: input.channel,
        starts_at: input.startsAt?.toISOString() ?? null,
        ends_at: input.endsAt?.toISOString() ?? null,
        status: 'available',
        is_user_entered: true,
      })
      .select('*')
      .single();

    if (error !== null) throw fromPostgrestError(error);

    // Redaction reduces the title to a length and the amounts to bands, so this
    // records that an offer was added without recording what it was.
    track('offer_added', {
      rewardType: input.rewardType,
      channel: input.channel,
      hasMerchantId: input.merchantId !== null,
      minimumSpendUsd: input.minimumSpendUsd,
      title: input.title,
    });

    return data;
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Marks an offer activated, redeemed or declined.
 *
 * `enrolled_at` is set when the user says they activated it and cleared when they
 * say they have not, because the engine reads exactly that column to decide whether
 * an offer counts. A `status` of `enrolled` with a null `enrolled_at` would make the
 * screen and the engine disagree.
 */
export async function setOfferStatus(
  id: string,
  status: OfferStatus,
  options: { readonly asOf?: Date } = {},
): Promise<void> {
  const supabase = getSupabaseClient();
  const now = (options.asOf ?? new Date()).toISOString();

  try {
    const { error } = await supabase
      .from('user_offers')
      .update({
        status,
        enrolled_at: status === 'enrolled' || status === 'redeemed' ? now : null,
        redeemed_at: status === 'redeemed' ? now : null,
      })
      .eq('id', id);

    if (error !== null) throw fromPostgrestError(error);

    if (status === 'enrolled') track('offer_enrolled');
  } catch (cause) {
    throw toDataError(cause);
  }
}

/**
 * Deletes an offer outright.
 *
 * Offers are the user's own notes about their own account, so a real delete is
 * right here — unlike a card, which is archived so its recorded cap progress and
 * past recommendations still make sense.
 */
export async function deleteUserOffer(id: string): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    const { error } = await supabase.from('user_offers').delete().eq('id', id);
    if (error !== null) throw fromPostgrestError(error);
  } catch (cause) {
    throw toDataError(cause);
  }
}
