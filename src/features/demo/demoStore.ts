/**
 * In-memory stand-ins for the four database calls the recommendation flow makes.
 *
 * Demo mode has no backend, so a purchase question and its recommendation are held
 * for the life of the page instead of being written anywhere. Reloading loses them,
 * which is correct: nothing has been stored, and pretending otherwise would be a
 * lie about where the data lives.
 *
 * WHAT IS AND IS NOT SUBSTITUTED
 * These functions replace *fetching and writing*. They do not replace the engine.
 * `useRecommend` still calls `classifyPurchase` and `evaluateWallet` on the data
 * returned here, so every rate, cap and dollar figure the user sees is computed by
 * `src/domain/rewards/` from the rule records in `demoCatalog.ts`.
 *
 * NO CLOCK. Ids are handed out from a counter rather than generated from the time,
 * so a test can assert them.
 */
import { DEMO_CARDS, DEMO_MERCHANTS } from '@/features/demo/demoCatalog';
import type { WalletSnapshot } from '@/features/recommendations/api/snapshot';
import type { ClassifiableMerchant } from '@/domain/classifier/types';
import type { RecommendationResult } from '@/domain/rewards/types';
import type { Session } from '@supabase/supabase-js';
import type { WalletCard } from '@/features/wallet/api/wallet';
import type { RecommendationSummary } from '@/features/recommendations/api/recommendations';
import type { UserRow } from '@/types/database';
import { DISCLAIMER_VERSION } from '@/components/Disclaimers';

/**
 * The demo user's identity.
 *
 * A fixed, obviously-fake id. It never reaches a database, because in demo mode
 * there is no database to reach.
 */
export const DEMO_USER_ID = '00000000-0000-4000-8000-000000000000';
export const DEMO_USER_EMAIL = 'demo@walletwise.example';

/**
 * The valuation used in demo mode.
 *
 * Every demo rule pays cash back in dollars, so no points valuation is needed and
 * none is invented. `prefersCashBackOnly` stays false so the preference screen has
 * something honest to show.
 */
const DEMO_VALUATION: WalletSnapshot['valuation'] = {
  byProgramId: {},
  // Every demo rule pays cash back in dollars. The points and miles figures are
  // never consulted by these rules; they are 0 rather than a guess, because a
  // made-up points valuation would be exactly the invented number this project
  // refuses to show.
  byUnit: { usd: 1, points: 0, miles: 0 },
  prefersCashBackOnly: false,
  minimumSwitchBenefitUsd: 0,
};

export function demoWalletSnapshot(): WalletSnapshot {
  return { cards: DEMO_CARDS, valuation: DEMO_VALUATION };
}

export function demoMerchants(): readonly ClassifiableMerchant[] {
  return DEMO_MERCHANTS;
}

interface StoredRecommendation {
  readonly recommendationId: string;
  readonly purchaseQueryId: string;
  readonly result: RecommendationResult;
}

/**
 * Recommendations made during this page's lifetime, newest first.
 *
 * Module state rather than a store, because it is scoped to one demo session and
 * has no persistence requirement. `resetDemoStore()` exists so tests start clean.
 */
let recommendations: StoredRecommendation[] = [];
let counter = 0;

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

export function demoRecordPurchaseQuery(): { readonly id: string } {
  return { id: nextId('demo-query') };
}

export function demoPersistRecommendation(
  purchaseQueryId: string,
  result: RecommendationResult,
): { readonly id: string } {
  const recommendationId = nextId('demo-recommendation');
  recommendations = [{ recommendationId, purchaseQueryId, result }, ...recommendations];
  return { id: recommendationId };
}

export function demoRecommendationById(id: string): StoredRecommendation | null {
  return recommendations.find((entry) => entry.recommendationId === id) ?? null;
}

export function demoRecentRecommendations(): readonly StoredRecommendation[] {
  return recommendations;
}

/** Test-only, and used when a demo session is restarted. */
export function resetDemoStore(): void {
  recommendations = [];
  counter = 0;
}

/**
 * A local stand-in session, so the app is "signed in" during a demonstration.
 *
 * The token strings are obviously not tokens. Nothing validates them, because in
 * demo mode nothing is called that would: every data path checks `isDemoMode()`
 * first and returns bundled data. If one ever did reach Supabase it would be
 * rejected, which is the correct failure — better a clear rejection than a
 * plausible-looking fake credential that works somewhere unintended.
 */
export function demoSession(): Session {
  return {
    access_token: 'demo-mode-no-token',
    refresh_token: 'demo-mode-no-token',
    token_type: 'bearer',
    expires_in: 0,
    expires_at: 0,
    user: {
      id: DEMO_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: DEMO_USER_EMAIL,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

/**
 * The demo wallet as the wallet screen wants it.
 *
 * Derived from `DEMO_CARDS` rather than written out again, so the wallet list and
 * the engine's view of the wallet cannot disagree — one source, two shapes.
 *
 * `lastFourCipher` is null for every card. There are no stored digits in a demo,
 * and inventing a ciphertext would produce a card that renders `••••` and fails to
 * decrypt, which looks like a bug rather than a demo.
 */
export function demoWalletCards(): readonly WalletCard[] {
  return DEMO_CARDS.map((card, index) => ({
    id: card.userCardId,
    cardProductId: card.cardProductId,
    productName: card.displayName,
    issuerName: card.issuerName,
    nickname: card.nickname,
    lastFourCipher: null,
    lastFourKeyId: null,
    displayOrder: index,
    isArchived: false,
    isExcludedFromRecommendations: card.isExcludedFromRecommendations,
    isPreferred: card.isPreferred,
    accountOpenedOn: card.accountOpenedOn?.toISOString().slice(0, 10) ?? null,
    notes: null,
    annualFeeUsd: card.annualFeeUsd,
    foreignTransactionFeePercent: card.foreignTransactionFeePercent,
    // True, and shown on screen: every one of these is invented.
    isFictional: true,
    isUserDefined: false,
    rewardProgramName: null,
    // The card's best headline rule, taken from the rule records themselves rather
    // than composed here, so the wallet cannot claim a rate the engine would not use.
    headline:
      card.rules.find((entry) => entry.kind !== 'base')?.label ?? card.rules[0]?.label ?? null,
    verificationStatus: 'verified',
  }));
}

/**
 * The demo user's profile row.
 *
 * A `member`, not an admin: the demonstration should show what an ordinary user
 * sees, and the catalog administration screen refusing entry is itself worth
 * seeing, because that refusal is a security control.
 */
export function demoProfile(): UserRow {
  return {
    id: DEMO_USER_ID,
    email: DEMO_USER_EMAIL,
    display_name: 'Demo visitor',
    role: 'member',
    home_country_code: 'US',
    home_currency_code: 'USD',
    preferred_locale: 'en-US',
    disclaimers_accepted_version: DISCLAIMER_VERSION,
    disclaimers_accepted_at: '2026-07-01T00:00:00.000Z',
    onboarding_completed_at: '2026-07-01T00:00:00.000Z',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: '2026-07-01T00:00:00.000Z',
  };
}

/**
 * The recent-recommendation list for the home screen.
 *
 * Built from what the engine actually returned during this demo session, so the
 * figures in the list are the same ones the results screen showed. Nothing is
 * summarised or re-derived here — re-deriving would be a second implementation of
 * the same calculation, and the two would eventually disagree.
 */
export function demoRecentSummaries(limit: number): RecommendationSummary[] {
  return recommendations.slice(0, limit).map((entry) => {
    const recommended = entry.result.recommended;
    return {
      id: entry.recommendationId,
      merchantInput: entry.result.intent.merchantInput,
      amountUsd: entry.result.intent.amountUsd,
      categoryId: entry.result.intent.categoryId,
      hasCodingWarning: entry.result.intent.hasAmbiguousCoding,
      estimatedValueUsd: recommended?.breakdown.netValueUsd ?? null,
      recommendedCardName: recommended?.card.nickname ?? recommended?.card.displayName ?? null,
      confidence: entry.result.confidence,
      // The engine stamps the result; this is not a fresh clock reading.
      createdAt: entry.result.computedAt.toISOString(),
    };
  });
}
