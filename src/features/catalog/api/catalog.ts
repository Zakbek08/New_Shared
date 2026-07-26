/**
 * Card-catalog reads.
 *
 * No client-side ownership filtering anywhere in this file. The two SELECT
 * policies on `card_products` already return catalog rows plus the caller's own
 * custom rows, so adding a filter here would duplicate the rule in a place where
 * it could drift from the database.
 */
import { fromPostgrestError, toDataError } from '@/lib/errors';
import { getSupabaseClient } from '@/lib/supabase';
import type {
  CardProductRow,
  IssuerRow,
  RewardProgramRow,
  RewardRuleRow,
  VerificationStatus,
} from '@/types/database';

/** A catalog row shaped for a list, with just enough to choose between cards. */
export interface CardProductSummary {
  readonly id: string;
  readonly name: string;
  readonly issuerName: string;
  readonly annualFeeUsd: number;
  readonly foreignTransactionFeePercent: number;
  readonly isFictional: boolean;
  readonly isUserDefined: boolean;
  /** The best headline rate across the product's rules, for a one-line summary. */
  readonly headline: string | null;
  /** Weakest verification status across its rules — the honest one to show. */
  readonly verificationStatus: VerificationStatus | null;
  readonly lastVerifiedAt: string | null;
}

/** The rule fields the list view needs. The detail query returns supersets of this. */
type RuleSummaryFields = Pick<
  RewardRuleRow,
  | 'id'
  | 'label'
  | 'kind'
  | 'reward_type'
  | 'base_rate'
  | 'bonus_rate'
  | 'is_active'
  | 'verification_status'
  | 'last_verified_at'
>;

/**
 * Anything the summary mapper can read.
 *
 * Written as a structural minimum rather than one concrete row type, so both the
 * list query (narrow rule columns) and the detail query (`reward_rules ( * )`)
 * satisfy it without a cast.
 */
type SummarisableProduct = CardProductRow & {
  issuers: Pick<IssuerRow, 'name' | 'short_name'> | null;
  reward_programs: Pick<RewardProgramRow, 'name' | 'unit'> | null;
  reward_rules: readonly RuleSummaryFields[];
};

type ProductWithRelations = SummarisableProduct;

/** The detail query selects every rule column, so it can expose full rows. */
type ProductDetailRow = CardProductRow & {
  issuers: Pick<IssuerRow, 'name' | 'short_name'> | null;
  reward_programs: Pick<RewardProgramRow, 'name' | 'unit'> | null;
  reward_rules: RewardRuleRow[];
};

const PRODUCT_SELECT = `
  *,
  issuers ( name, short_name ),
  reward_programs ( name, unit ),
  reward_rules ( id, label, kind, reward_type, base_rate, bonus_rate, is_active,
                 verification_status, last_verified_at )
`;

/** Ordered weakest-first, so `Math.min` over indices gives the honest status. */
const STATUS_RANK: Record<VerificationStatus, number> = {
  disputed: 0,
  unverified: 1,
  stale: 2,
  user_reported: 3,
  retired: 4,
  verified: 5,
};

export function issuerNameOf(product: {
  issuers?: { name: string } | null;
  custom_issuer_name?: string | null;
}): string {
  return product.issuers?.name ?? product.custom_issuer_name ?? 'Unknown issuer';
}

/**
 * The single most useful rate on a card, for a one-line summary.
 *
 * Picks the highest-earning non-base rule, falling back to the base rule. This
 * is a *display* heuristic over stored numbers, not a reward calculation — the
 * engine never consults it.
 */
function headlineFor(rules: readonly RuleSummaryFields[]): string | null {
  const active = rules.filter((rule) => rule.is_active);
  if (active.length === 0) return null;

  const ranked = [...active].sort((a, b) => {
    const aRate = a.base_rate + a.bonus_rate;
    const bRate = b.base_rate + b.bonus_rate;
    if (aRate !== bRate) return bRate - aRate;
    // Prefer a bonus over the base rule when the numbers tie.
    return (a.kind === 'base' ? 1 : 0) - (b.kind === 'base' ? 1 : 0);
  });

  return ranked[0]?.label ?? null;
}

function weakestVerification(rules: readonly RuleSummaryFields[]): {
  status: VerificationStatus | null;
  lastVerifiedAt: string | null;
} {
  const active = rules.filter((rule) => rule.is_active);
  if (active.length === 0) return { status: null, lastVerifiedAt: null };

  let weakest = active[0]!;
  for (const rule of active) {
    if (STATUS_RANK[rule.verification_status] < STATUS_RANK[weakest.verification_status]) {
      weakest = rule;
    }
  }

  return {
    status: weakest.verification_status,
    lastVerifiedAt: weakest.last_verified_at,
  };
}

function toSummary(product: SummarisableProduct): CardProductSummary {
  const verification = weakestVerification(product.reward_rules);

  return {
    id: product.id,
    name: product.name,
    issuerName: issuerNameOf(product),
    annualFeeUsd: product.annual_fee_usd,
    foreignTransactionFeePercent: product.foreign_transaction_fee_percent,
    isFictional: product.is_fictional,
    isUserDefined: product.is_user_defined,
    headline: headlineFor(product.reward_rules),
    verificationStatus: verification.status,
    lastVerifiedAt: verification.lastVerifiedAt,
  };
}

/**
 * Searches the catalog by product or issuer name.
 *
 * An empty search returns the whole active catalog, which is the right default
 * for a list the user is browsing rather than filtering.
 */
export async function searchCardProducts(search: string): Promise<CardProductSummary[]> {
  const supabase = getSupabaseClient();
  const term = search.trim();

  try {
    let query = supabase
      .from('card_products')
      .select(PRODUCT_SELECT)
      .eq('is_active', true)
      .order('name', { ascending: true })
      .limit(100);

    if (term.length > 0) {
      // `%` and `,` are the PostgREST `or` filter's own syntax; escaping them
      // stops a search string from restructuring the filter.
      const safe = term.replace(/[%,()]/g, ' ');
      query = query.or(`name.ilike.%${safe}%,custom_issuer_name.ilike.%${safe}%`);
    }

    const { data, error } = await query;
    if (error !== null) throw fromPostgrestError(error);

    const rows = (data ?? []) as unknown as ProductWithRelations[];

    // Issuer-name matching happens here rather than in the `or` above, because
    // PostgREST cannot filter on an embedded resource without turning the join
    // into an inner one and dropping user-defined rows, which have no issuer.
    const filtered =
      term.length > 0
        ? rows.filter((row) => {
            const haystack = `${row.name} ${issuerNameOf(row)}`.toLowerCase();
            return haystack.includes(term.toLowerCase());
          })
        : rows;

    return filtered.map(toSummary);
  } catch (cause) {
    throw toDataError(cause);
  }
}

export interface CardProductDetail extends CardProductSummary {
  readonly summary: string | null;
  readonly supportedCountryCodes: readonly string[];
  readonly rewardProgramName: string | null;
  readonly rules: readonly RewardRuleRow[];
}

export async function getCardProduct(id: string): Promise<CardProductDetail> {
  const supabase = getSupabaseClient();

  try {
    const { data, error } = await supabase
      .from('card_products')
      .select(
        `*, issuers ( name, short_name ), reward_programs ( name, unit ), reward_rules ( * )`,
      )
      .eq('id', id)
      .single();

    if (error !== null) throw fromPostgrestError(error);

    const product = data as unknown as ProductDetailRow;

    return {
      ...toSummary(product),
      summary: product.summary,
      supportedCountryCodes: product.supported_country_codes,
      rewardProgramName: product.reward_programs?.name ?? null,
      rules: product.reward_rules
        .filter((rule) => rule.is_active)
        .sort((a, b) => b.priority - a.priority),
    };
  } catch (cause) {
    throw toDataError(cause);
  }
}
