/**
 * The card catalog: real products from real issuers.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO READ THE NUMBERS IN THIS FILE, AND WHAT THEY ARE NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * Every rate here is the issuer's own published headline rate, transcribed by hand
 * from the product page linked in `sourceUrl`, as it stood on `ratesAsOf`.
 *
 * Issuers change rates, categories, caps and annual fees without notice, and they
 * do it often. So this file is a **dated transcription, not a live feed**. Two
 * consequences the UI must honour, and does:
 *
 *   1. Every card shows its `ratesAsOf` date and links its source, so a user can
 *      check the figure against the issuer in one tap.
 *   2. The app tells the user to confirm with their bank before relying on a
 *      number. It never claims to know today's terms.
 *
 * WalletWise does not scrape these pages and never will — a human reads them and
 * types the result here, which is why the date matters and why it is shown.
 *
 * WHAT IS DELIBERATELY OMITTED
 * Sign-up bonuses, transfer-partner valuations, credits with hoops, and
 * "up to $X in statement credits" perks are all absent. They depend on behaviour
 * the app cannot see, and folding them into a per-purchase recommendation would
 * make the answer to "which card for this coffee?" quietly wrong.
 *
 * Rotating quarterly categories (Chase Freedom Flex, Discover it) are modelled as
 * requiring activation, without asserting which quarter is live: the app cannot
 * know that, so it says the card needs activation and leaves the base rate to
 * compete honestly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNITS
 * ─────────────────────────────────────────────────────────────────────────────
 * `rate` is a **percentage** for cash back (`3` means 3%) and a **multiplier** for
 * points and miles (`3` means 3x). This mirrors `reward_rules.base_rate`, and
 * `money.percentOf` divides by 100 — writing `0.03` for 3% would pay three
 * hundredths of a percent. There is a hand-checked test for exactly that.
 */
import { CATEGORIES, type CategorySlug } from '@/domain/categories';
import type { EvaluableCard, EvaluableCondition, EvaluableRule } from '@/domain/rewards/types';
import type { PaymentMethod, PurchaseChannel, RewardType } from '@/types/database';

/** Resolves a category id from its slug so the data below reads legibly. */
function categoryId(slug: CategorySlug): string {
  const category = CATEGORIES.find((candidate) => candidate.slug === slug);
  if (category === undefined) {
    // A typo would silently produce a rule matching nothing, which reads as an
    // engine bug rather than a data bug.
    throw new Error(`marketCards references an unknown category slug: ${slug}`);
  }
  return category.id;
}

/** One earn rate as it appears on an issuer's product page. */
interface RateSpec {
  /** The issuer's own wording, shortened only where it does not change meaning. */
  readonly label: string;
  readonly rate: number;
  /** Categories this rate applies to. Empty means every purchase. */
  readonly categories?: readonly CategorySlug[];
  readonly channel?: PurchaseChannel;
  readonly paymentMethods?: readonly PaymentMethod[];
  /** Spend cap in dollars, with the period it resets on. */
  readonly capUsd?: number;
  readonly capPeriod?: 'monthly' | 'quarterly' | 'calendar_year';
  /** What the card pays once the cap is spent. Defaults to the card's base rate. */
  readonly postCapRate?: number;
  /** Rotating and choose-your-category rates the cardholder must switch on. */
  readonly requiresEnrollment?: boolean;
}

/** A card product as published by its issuer. */
export interface MarketCard {
  readonly id: string;
  readonly productName: string;
  readonly issuerName: string;
  readonly annualFeeUsd: number;
  readonly foreignTransactionFeePercent: number;
  /** What the card earns. Drives both the copy and the engine's unit handling. */
  readonly rewardType: RewardType;
  /** One line a user can recognise the card by. */
  readonly summary: string;
  /** The issuer's product page. Shown, and openable, never fetched. */
  readonly sourceUrl: string;
  /** The day these rates were read off that page. */
  readonly ratesAsOf: string;
  /** The base rate that applies when no bonus category matches. */
  readonly baseRate: number;
  readonly baseLabel: string;
  readonly bonuses: readonly RateSpec[];
  /** Extra words a user might search by — nicknames, abbreviations. */
  readonly searchTerms?: readonly string[];
}

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------
// Ordered by issuer, then by annual fee. Every `sourceUrl` is the issuer's own
// domain — no aggregator, no affiliate link, no referral code. WalletWise earns
// nothing from any of these and never will; the moment it did, the ranking would
// be worthless.

const AS_OF = '2026-05-01';

/**
 * Cards whose published terms were re-read on 29 July 2026.
 *
 * A second date rather than one date for the whole file, because a single constant would
 * be a lie about the cards it was not applied to. `ratesAsOf` is per-card precisely so
 * this stays honest as the catalog is maintained in batches.
 */
const CHECKED_2026_07_29 = '2026-07-29';

export const MARKET_CARDS: readonly MarketCard[] = [
  // ---- American Express ---------------------------------------------------
  {
    id: 'amex-blue-cash-everyday',
    productName: 'Blue Cash Everyday Card',
    issuerName: 'American Express',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 2.7,
    rewardType: 'cash_back_percent',
    summary: 'No annual fee. 3% back at US supermarkets, online retail and petrol stations.',
    sourceUrl: 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-everyday/',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        label: '3% at US supermarkets, on up to $6,000 per year',
        rate: 3,
        categories: ['grocery'],
        capUsd: 6000,
        capPeriod: 'calendar_year',
      },
      {
        label: '3% on US online retail purchases, on up to $6,000 per year',
        rate: 3,
        categories: ['online_shopping'],
        channel: 'online',
        capUsd: 6000,
        capPeriod: 'calendar_year',
      },
      {
        label: '3% at US petrol stations, on up to $6,000 per year',
        rate: 3,
        categories: ['gas'],
        capUsd: 6000,
        capPeriod: 'calendar_year',
      },
    ],
    searchTerms: ['amex', 'bce', 'blue cash'],
  },
  {
    id: 'amex-blue-cash-preferred',
    productName: 'Blue Cash Preferred Card',
    issuerName: 'American Express',
    annualFeeUsd: 95,
    foreignTransactionFeePercent: 2.7,
    rewardType: 'cash_back_percent',
    summary: 'The strongest mainstream supermarket card: 6% back, capped yearly.',
    sourceUrl: 'https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        label: '6% at US supermarkets, on up to $6,000 per year',
        rate: 6,
        categories: ['grocery'],
        capUsd: 6000,
        capPeriod: 'calendar_year',
      },
      {
        label: '6% on select US streaming subscriptions',
        rate: 6,
        categories: ['entertainment'],
      },
      { label: '3% on transit', rate: 3, categories: ['transit'] },
      { label: '3% at US petrol stations', rate: 3, categories: ['gas'] },
    ],
    searchTerms: ['amex', 'bcp', 'blue cash preferred'],
  },
  {
    id: 'amex-gold',
    productName: 'American Express Gold Card',
    issuerName: 'American Express',
    annualFeeUsd: 325,
    foreignTransactionFeePercent: 0,
    rewardType: 'points_per_dollar',
    summary: 'Restaurants and US supermarkets at 4x Membership Rewards points.',
    sourceUrl: 'https://www.americanexpress.com/us/credit-cards/card/gold-card/',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1x points on everything else',
    bonuses: [
      { label: '4x points at restaurants worldwide', rate: 4, categories: ['dining'] },
      {
        label: '4x points at US supermarkets, on up to $25,000 per year',
        rate: 4,
        categories: ['grocery'],
        capUsd: 25000,
        capPeriod: 'calendar_year',
      },
      {
        label: '3x points on flights booked direct with airlines',
        rate: 3,
        categories: ['airfare'],
      },
    ],
    searchTerms: ['amex', 'gold card', 'membership rewards'],
  },
  {
    id: 'amex-platinum',
    productName: 'The Platinum Card',
    issuerName: 'American Express',
    annualFeeUsd: 695,
    foreignTransactionFeePercent: 0,
    rewardType: 'points_per_dollar',
    summary: 'A travel card. 5x on flights; 1x on everything else.',
    sourceUrl: 'https://www.americanexpress.com/us/credit-cards/card/platinum/',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1x points on everything else',
    bonuses: [
      {
        label: '5x points on flights booked direct with airlines',
        rate: 5,
        categories: ['airfare'],
      },
      {
        label: '5x points on prepaid hotels booked with Amex Travel',
        rate: 5,
        categories: ['hotel'],
      },
    ],
    searchTerms: ['amex', 'platinum'],
  },

  // ---- Bank of America ---------------------------------------------------
  {
    id: 'boa-customized-cash',
    productName: 'Customized Cash Rewards',
    issuerName: 'Bank of America',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 3,
    rewardType: 'cash_back_percent',
    summary: 'Pick your own 3% category. 2% at supermarkets and wholesale clubs.',
    sourceUrl: 'https://www.bankofamerica.com/credit-cards/products/cash-back-credit-card/',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        label: '3% in a category you choose, on up to $2,500 per quarter',
        rate: 3,
        // No category constraint: the cardholder picks it, and the app cannot know
        // which. Enrollment is required, so the engine will not count on it unless
        // the user says they have set it.
        capUsd: 2500,
        capPeriod: 'quarterly',
        requiresEnrollment: true,
      },
      {
        label: '2% at supermarkets and wholesale clubs, on up to $2,500 per quarter',
        rate: 2,
        categories: ['grocery', 'warehouse_club'],
        capUsd: 2500,
        capPeriod: 'quarterly',
      },
    ],
    searchTerms: ['bofa', 'bank of america', 'customized cash'],
  },
  {
    id: 'boa-travel-rewards',
    productName: 'Travel Rewards',
    issuerName: 'Bank of America',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 0,
    rewardType: 'points_per_dollar',
    summary: 'Flat 1.5x points, no annual fee, no foreign transaction fee.',
    sourceUrl:
      'https://www.bankofamerica.com/credit-cards/products/travel-rewards-credit-card/',
    ratesAsOf: AS_OF,
    baseRate: 1.5,
    baseLabel: '1.5x points on every purchase',
    bonuses: [],
    searchTerms: ['bofa', 'bank of america', 'travel rewards'],
  },
  {
    id: 'boa-unlimited-cash',
    productName: 'Unlimited Cash Rewards',
    issuerName: 'Bank of America',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 3,
    rewardType: 'cash_back_percent',
    summary: 'Flat 1.5% on everything, no categories to track.',
    sourceUrl:
      'https://www.bankofamerica.com/credit-cards/products/unlimited-cash-back-credit-card/',
    ratesAsOf: CHECKED_2026_07_29,
    baseRate: 1.5,
    baseLabel: '1.5% cash back on every purchase',
    // Bank of America publishes a 2% first-year rate for new cardholders, and Preferred
    // Rewards members earn 25–75% more. Neither is modelled: the app cannot know how long
    // someone has held a card or what their banking balances are, and guessing either
    // would inflate the figure. 1.5% is what this card pays without conditions.
    bonuses: [],
    searchTerms: ['bofa', 'bank of america', 'unlimited cash'],
  },
  {
    id: 'boa-premium-rewards',
    productName: 'Premium Rewards',
    issuerName: 'Bank of America',
    annualFeeUsd: 95,
    foreignTransactionFeePercent: 0,
    rewardType: 'points_per_dollar',
    summary: '2x on travel and dining, 1.5x on everything else.',
    sourceUrl:
      'https://www.bankofamerica.com/credit-cards/products/premium-rewards-credit-card/',
    ratesAsOf: AS_OF,
    baseRate: 1.5,
    baseLabel: '1.5x points on everything else',
    bonuses: [
      {
        label: '2x points on travel and dining',
        rate: 2,
        categories: ['dining', 'airfare', 'hotel', 'general_travel', 'transit'],
      },
    ],
    searchTerms: ['bofa', 'bank of america', 'premium rewards'],
  },

  // ---- Capital One -------------------------------------------------------
  {
    id: 'capitalone-quicksilver',
    productName: 'Quicksilver Cash Rewards',
    issuerName: 'Capital One',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 0,
    rewardType: 'cash_back_percent',
    summary: 'Flat 1.5% on everything. No annual fee, no foreign transaction fee.',
    sourceUrl: 'https://www.capitalone.com/credit-cards/quicksilver/',
    ratesAsOf: AS_OF,
    baseRate: 1.5,
    baseLabel: '1.5% cash back on every purchase',
    bonuses: [],
    searchTerms: ['capital one', 'quicksilver'],
  },
  {
    id: 'capitalone-savor',
    productName: 'Savor Cash Rewards',
    issuerName: 'Capital One',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 0,
    rewardType: 'cash_back_percent',
    summary: '3% on dining, entertainment, streaming and supermarkets.',
    sourceUrl: 'https://www.capitalone.com/credit-cards/savor/',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        label: '3% on dining, entertainment, streaming and supermarkets',
        rate: 3,
        categories: ['dining', 'entertainment', 'grocery'],
      },
    ],
    searchTerms: ['capital one', 'savor', 'savorone'],
  },
  {
    id: 'capitalone-venture',
    productName: 'Venture Rewards',
    issuerName: 'Capital One',
    annualFeeUsd: 95,
    foreignTransactionFeePercent: 0,
    rewardType: 'miles_per_dollar',
    summary: 'Flat 2x miles on everything.',
    sourceUrl: 'https://www.capitalone.com/credit-cards/venture/',
    ratesAsOf: AS_OF,
    baseRate: 2,
    baseLabel: '2x miles on every purchase',
    bonuses: [],
    searchTerms: ['capital one', 'venture'],
  },
  {
    id: 'capitalone-venture-x',
    productName: 'Venture X Rewards',
    issuerName: 'Capital One',
    annualFeeUsd: 395,
    foreignTransactionFeePercent: 0,
    rewardType: 'miles_per_dollar',
    summary: '2x miles on everything, more through the Capital One travel portal.',
    sourceUrl: 'https://www.capitalone.com/credit-cards/venture-x/',
    ratesAsOf: AS_OF,
    baseRate: 2,
    baseLabel: '2x miles on everything else',
    bonuses: [
      {
        label: '5x miles on flights booked through Capital One Travel',
        rate: 5,
        categories: ['airfare'],
        channel: 'online',
      },
      {
        label: '10x miles on hotels and rental cars booked through Capital One Travel',
        rate: 10,
        categories: ['hotel'],
        channel: 'online',
      },
    ],
    searchTerms: ['capital one', 'venture x'],
  },

  // ---- Chase --------------------------------------------------------------
  {
    id: 'chase-freedom-unlimited',
    productName: 'Freedom Unlimited',
    issuerName: 'Chase',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 3,
    rewardType: 'cash_back_percent',
    summary: '1.5% on everything, 3% on dining and drugstores.',
    sourceUrl: 'https://creditcards.chase.com/cash-back-credit-cards/freedom/unlimited',
    ratesAsOf: AS_OF,
    baseRate: 1.5,
    baseLabel: '1.5% cash back on everything else',
    bonuses: [
      { label: '3% at restaurants', rate: 3, categories: ['dining'] },
      { label: '3% at drugstores', rate: 3, categories: ['pharmacy'] },
      {
        label: '5% on travel booked through Chase Travel',
        rate: 5,
        categories: ['airfare', 'hotel', 'general_travel'],
        channel: 'online',
      },
    ],
    searchTerms: ['chase', 'cfu', 'freedom unlimited'],
  },
  {
    id: 'chase-freedom-flex',
    productName: 'Freedom Flex',
    issuerName: 'Chase',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 3,
    rewardType: 'cash_back_percent',
    summary: '5% on rotating quarterly categories you activate, plus 3% dining.',
    sourceUrl: 'https://creditcards.chase.com/cash-back-credit-cards/freedom/flex',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        label: "5% on this quarter's rotating categories, on up to $1,500 per quarter",
        rate: 5,
        // No category constraint, because which categories are live changes every
        // quarter and the app has no feed for it. Activation is required, so this
        // only competes when the user says they have activated it.
        capUsd: 1500,
        capPeriod: 'quarterly',
        requiresEnrollment: true,
      },
      { label: '3% at restaurants', rate: 3, categories: ['dining'] },
      { label: '3% at drugstores', rate: 3, categories: ['pharmacy'] },
      {
        label: '5% on travel booked through Chase Travel',
        rate: 5,
        categories: ['airfare', 'hotel', 'general_travel'],
        channel: 'online',
      },
    ],
    searchTerms: ['chase', 'freedom flex'],
  },
  {
    id: 'chase-prime-visa',
    productName: 'Prime Visa',
    issuerName: 'Chase',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 0,
    rewardType: 'cash_back_percent',
    summary: '5% at Amazon and Whole Foods with an eligible Prime membership.',
    sourceUrl: 'https://creditcards.chase.com/rewards-credit-cards/amazon-rewards',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        label: '5% at Amazon and Whole Foods, with an eligible Prime membership',
        rate: 5,
        categories: ['online_shopping'],
        requiresEnrollment: true,
      },
      {
        label: '2% at restaurants, petrol stations and on transit',
        rate: 2,
        categories: ['dining', 'gas', 'transit'],
      },
    ],
    searchTerms: ['chase', 'amazon', 'prime'],
  },
  {
    id: 'chase-sapphire-preferred',
    productName: 'Sapphire Preferred',
    issuerName: 'Chase',
    annualFeeUsd: 95,
    foreignTransactionFeePercent: 0,
    rewardType: 'points_per_dollar',
    summary: '3x on dining and streaming, 2x on travel.',
    sourceUrl: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/preferred',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1x points on everything else',
    bonuses: [
      { label: '3x points at restaurants', rate: 3, categories: ['dining'] },
      {
        label: '3x points on select streaming services',
        rate: 3,
        categories: ['entertainment'],
      },
      {
        label: '2x points on travel',
        rate: 2,
        categories: ['airfare', 'hotel', 'general_travel', 'transit'],
      },
    ],
    searchTerms: ['chase', 'csp', 'sapphire preferred'],
  },
  {
    id: 'chase-sapphire-reserve',
    productName: 'Sapphire Reserve',
    issuerName: 'Chase',
    annualFeeUsd: 550,
    foreignTransactionFeePercent: 0,
    rewardType: 'points_per_dollar',
    summary: '3x on dining and travel, with a large annual fee.',
    sourceUrl: 'https://creditcards.chase.com/rewards-credit-cards/sapphire/reserve',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1x points on everything else',
    bonuses: [
      { label: '3x points at restaurants', rate: 3, categories: ['dining'] },
      {
        label: '3x points on travel',
        rate: 3,
        categories: ['airfare', 'hotel', 'general_travel', 'transit'],
      },
    ],
    searchTerms: ['chase', 'csr', 'sapphire reserve'],
  },

  // ---- Citi ---------------------------------------------------------------
  {
    id: 'citi-double-cash',
    productName: 'Double Cash Card',
    issuerName: 'Citi',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 3,
    rewardType: 'cash_back_percent',
    summary: 'Flat 2% — 1% when you buy, 1% when you pay it off.',
    sourceUrl: 'https://www.citi.com/credit-cards/citi-double-cash-credit-card',
    ratesAsOf: AS_OF,
    baseRate: 2,
    baseLabel: '2% cash back on every purchase',
    bonuses: [],
    searchTerms: ['citi', 'double cash'],
  },
  {
    id: 'citi-custom-cash',
    productName: 'Custom Cash Card',
    issuerName: 'Citi',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 3,
    rewardType: 'cash_back_percent',
    summary: '5% in whichever eligible category you spend most on each cycle.',
    sourceUrl: 'https://www.citi.com/credit-cards/citi-custom-cash-credit-card',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        label: '5% in your top eligible category, on up to $500 per billing cycle',
        rate: 5,
        // Which category depends on where the cardholder spends most that cycle,
        // which the app cannot know from one purchase. Treated as needing the user
        // to confirm rather than assumed.
        capUsd: 500,
        capPeriod: 'monthly',
        requiresEnrollment: true,
      },
    ],
    searchTerms: ['citi', 'custom cash'],
  },
  {
    id: 'citi-strata-premier',
    productName: 'Strata Premier Card',
    issuerName: 'Citi',
    annualFeeUsd: 95,
    foreignTransactionFeePercent: 0,
    rewardType: 'points_per_dollar',
    summary: '3x across restaurants, supermarkets, petrol, air travel and hotels.',
    sourceUrl: 'https://www.citi.com/credit-cards/citi-strata-premier-credit-card',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1x points on everything else',
    bonuses: [
      {
        label: '3x points at restaurants, supermarkets and petrol stations',
        rate: 3,
        categories: ['dining', 'grocery', 'gas'],
      },
      {
        label: '3x points on air travel and hotels',
        rate: 3,
        categories: ['airfare', 'hotel'],
      },
    ],
    searchTerms: ['citi', 'strata', 'premier'],
  },

  // ---- Discover -----------------------------------------------------------
  {
    id: 'discover-it-cash-back',
    productName: 'Discover it Cash Back',
    issuerName: 'Discover',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 0,
    rewardType: 'cash_back_percent',
    summary: '5% on rotating quarterly categories you activate.',
    sourceUrl: 'https://www.discover.com/credit-cards/cash-back/it-card.html',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        label: "5% on this quarter's rotating categories, on up to $1,500 per quarter",
        rate: 5,
        capUsd: 1500,
        capPeriod: 'quarterly',
        requiresEnrollment: true,
      },
    ],
    searchTerms: ['discover', 'discover it'],
  },

  // ---- U.S. Bank ----------------------------------------------------------
  {
    id: 'usbank-cash-plus',
    productName: 'Cash+ Visa Signature',
    issuerName: 'U.S. Bank',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 3,
    rewardType: 'cash_back_percent',
    summary: 'Choose two 5% categories each quarter, plus a 2% everyday category.',
    sourceUrl: 'https://www.usbank.com/credit-cards/cash-plus-visa-signature-credit-card.html',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        label: '5% in two categories you choose, on up to $2,000 per quarter combined',
        rate: 5,
        capUsd: 2000,
        capPeriod: 'quarterly',
        requiresEnrollment: true,
      },
      {
        label: '2% in one everyday category you choose',
        rate: 2,
        requiresEnrollment: true,
      },
    ],
    searchTerms: ['us bank', 'usbank', 'cash plus', 'cash+'],
  },

  // ---- Wells Fargo --------------------------------------------------------
  {
    id: 'wellsfargo-active-cash',
    productName: 'Active Cash Card',
    issuerName: 'Wells Fargo',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 3,
    rewardType: 'cash_back_percent',
    summary: 'Flat 2% on everything, no annual fee.',
    sourceUrl: 'https://www.wellsfargo.com/credit-cards/active-cash/',
    ratesAsOf: AS_OF,
    baseRate: 2,
    baseLabel: '2% cash back on every purchase',
    bonuses: [],
    searchTerms: ['wells fargo', 'active cash'],
  },
  {
    id: 'wellsfargo-autograph',
    productName: 'Autograph Card',
    issuerName: 'Wells Fargo',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 0,
    rewardType: 'points_per_dollar',
    summary: '3x across dining, travel, petrol, transit and streaming.',
    sourceUrl: 'https://www.wellsfargo.com/credit-cards/autograph/',
    ratesAsOf: AS_OF,
    baseRate: 1,
    baseLabel: '1x points on everything else',
    bonuses: [
      {
        label: '3x points on dining, travel, petrol, transit and streaming',
        rate: 3,
        categories: [
          'dining',
          'gas',
          'transit',
          'airfare',
          'hotel',
          'general_travel',
          'entertainment',
        ],
      },
    ],
    searchTerms: ['wells fargo', 'autograph'],
  },

  // ---- Goldman Sachs ------------------------------------------------------
  {
    id: 'apple-card',
    productName: 'Apple Card',
    issuerName: 'Apple (Goldman Sachs)',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 0,
    rewardType: 'cash_back_percent',
    summary:
      '2% Daily Cash whenever you pay with Apple Pay, 1% with the physical card. The 3% at Apple and select merchants is not modelled — see the note on this card.',
    sourceUrl: 'https://www.apple.com/apple-card/',
    ratesAsOf: CHECKED_2026_07_29,
    baseRate: 1,
    baseLabel: '1% Daily Cash when you use the physical card',
    bonuses: [
      {
        // The engine's payment-method dimension earns its keep here: on this card the
        // difference between tapping the phone and tapping the card is the whole
        // difference between 2% and 1%.
        label: '2% Daily Cash on any purchase paid with Apple Pay',
        rate: 2,
        paymentMethods: ['apple_pay'],
      },
    ],
    // Apple also pays 3% at Apple and at named merchants (Nike, Uber, Walgreens and
    // others) when paid with Apple Pay. That is merchant-specific, and WalletWise has no
    // merchant list — modelling it would mean guessing which shop you are standing in.
    // Omitted rather than approximated, and the summary says so, so the figure shown is
    // the floor rather than a hopeful maximum.
    searchTerms: ['apple', 'goldman', 'daily cash', 'iphone'],
  },

  // ---- TD Bank ------------------------------------------------------------
  {
    id: 'td-cash',
    productName: 'TD Cash Credit Card',
    issuerName: 'TD Bank',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 3,
    rewardType: 'cash_back_percent',
    summary: 'You choose the 3% and 2% categories, and can change them each quarter.',
    sourceUrl: 'https://www.td.com/us/en/personal-banking/credit-cards/cash-card',
    ratesAsOf: CHECKED_2026_07_29,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        // Which categories are live is the cardholder's own quarterly choice, and the app
        // cannot know it. Dining and groceries are only TD's opening default. So both
        // rates need confirming before they count — the same treatment as a rotating
        // bonus, for the same reason.
        label: '3% in the category you choose (dining by default)',
        rate: 3,
        requiresEnrollment: true,
      },
      {
        label: '2% in your second chosen category (groceries by default)',
        rate: 2,
        requiresEnrollment: true,
      },
    ],
    searchTerms: ['td', 'td bank', 'td cash'],
  },
  {
    id: 'td-double-up',
    productName: 'TD Double Up Credit Card',
    issuerName: 'TD Bank',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 3,
    rewardType: 'cash_back_percent',
    summary: 'Flat 2% on everything, no categories to track.',
    sourceUrl: 'https://www.td.com/us/en/personal-banking/credit-cards/double-up',
    ratesAsOf: CHECKED_2026_07_29,
    baseRate: 2,
    baseLabel: '2% cash back on every purchase',
    bonuses: [],
    searchTerms: ['td', 'td bank', 'double up'],
  },

  // ---- Costco, issued by Citi --------------------------------------------
  {
    id: 'citi-costco-anywhere',
    productName: 'Costco Anywhere Visa',
    issuerName: 'Citi',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 0,
    rewardType: 'cash_back_percent',
    summary:
      'No annual fee with a paid Costco membership. 4% on petrol and EV charging, 3% on restaurants and travel.',
    sourceUrl: 'https://www.citi.com/credit-cards/citi-costco-anywhere-visa-credit-card',
    ratesAsOf: CHECKED_2026_07_29,
    baseRate: 1,
    baseLabel: '1% cash back on everything else',
    bonuses: [
      {
        // Citi publishes 5% at Costco's own petrol stations and 4% elsewhere, sharing one
        // $7,000 yearly cap. Modelled at the 4% anyone can get: the 5% needs the app to
        // know you are at a Costco pump, and it has no merchant list. Understating is the
        // safe direction — this card can only do better than the figure shown.
        label: '4% on petrol and EV charging, on up to $7,000 per year',
        rate: 4,
        categories: ['gas'],
        capUsd: 7000,
        capPeriod: 'calendar_year',
      },
      {
        label: '3% at restaurants and on eligible travel',
        rate: 3,
        categories: ['dining', 'airfare', 'hotel', 'general_travel'],
      },
      {
        label: '2% on purchases at Costco and Costco.com',
        rate: 2,
        categories: ['warehouse_club'],
      },
    ],
    searchTerms: ['costco', 'citi', 'anywhere'],
  },

  // ---- Fidelity, issued by Elan ------------------------------------------
  {
    id: 'fidelity-rewards',
    productName: 'Fidelity Rewards Visa Signature',
    issuerName: 'Fidelity',
    annualFeeUsd: 0,
    foreignTransactionFeePercent: 0,
    rewardType: 'cash_back_percent',
    summary: 'Flat 2% on everything, at full value only when redeemed into a Fidelity account.',
    sourceUrl: 'https://www.fidelity.com/spend-save/visa-signature-card',
    ratesAsOf: CHECKED_2026_07_29,
    baseRate: 2,
    baseLabel: '2% cash back on every purchase',
    bonuses: [],
    searchTerms: ['fidelity', 'rewards visa'],
  },
];

// ---------------------------------------------------------------------------
// Mapping to the engine's input shape
// ---------------------------------------------------------------------------

/** The reward unit each reward type pays in. The database enforces this pairing. */
const UNIT_FOR_TYPE = {
  cash_back_percent: 'usd',
  points_per_dollar: 'points',
  miles_per_dollar: 'miles',
  statement_credit: 'usd',
  fixed_amount: 'usd',
} as const;

const NO_CONSTRAINTS: Omit<EvaluableCondition, 'id'> = {
  categoryIds: [],
  excludedCategoryIds: [],
  includedMccs: [],
  includedMccRanges: [],
  excludedMccs: [],
  includedMerchantIds: [],
  excludedMerchantIds: [],
  includedCountryCodes: [],
  excludedCountryCodes: [],
  includedCurrencyCodes: [],
  channel: 'either',
  includedPaymentMethods: [],
  startsAt: null,
  endsAt: null,
  minAmountUsd: null,
  maxAmountUsd: null,
};

/**
 * All rules on a card share one stack group.
 *
 * The engine applies the single best-earning qualifying rule per group, which is
 * the correct model for these products: a purchase is groceries or it is dining,
 * and no mainstream card pays both bonuses on the same transaction.
 */
const STACK_GROUP = 'earn';

function toRule(card: MarketCard, spec: RateSpec, index: number): EvaluableRule {
  const hasConstraints =
    spec.categories !== undefined ||
    spec.channel !== undefined ||
    spec.paymentMethods !== undefined;

  return {
    id: `${card.id}-rule-${index}`,
    cardProductId: card.id,
    // One reward currency per card, so the per-unit valuation is the right lever
    // and no per-program valuation is invented.
    rewardProgramId: null,
    label: spec.label,
    kind: 'category_bonus',
    rewardType: card.rewardType,
    rewardUnit: UNIT_FOR_TYPE[card.rewardType],
    baseRate: 0,
    bonusRate: spec.rate,
    fixedAmountUsd: null,
    // Bonuses are considered before the base rule. Ordering is a hint only — the
    // engine still picks by resulting value, so a capped-out bonus loses on merit.
    priority: 10,
    stackGroup: STACK_GROUP,
    isStackable: false,
    capAmount: spec.capUsd ?? null,
    capAppliesTo: 'spend',
    capPeriod: spec.capPeriod ?? 'none',
    postCapRate: spec.capUsd === undefined ? null : (spec.postCapRate ?? card.baseRate),
    startsAt: null,
    endsAt: null,
    requiresEnrollment: spec.requiresEnrollment ?? false,
    spendThresholdUsd: null,
    lastVerifiedAt: new Date(`${card.ratesAsOf}T00:00:00.000Z`),
    // What this actually claims: a person read the issuer's page on `ratesAsOf` and
    // transcribed it. Not that the rate is still live today — which is why the UI
    // shows the date beside every figure.
    verificationStatus: 'verified',
    isActive: true,
    conditions: hasConstraints
      ? [
          {
            id: `${card.id}-cond-${index}`,
            ...NO_CONSTRAINTS,
            categoryIds: (spec.categories ?? []).map(categoryId),
            channel: spec.channel ?? 'either',
            includedPaymentMethods: spec.paymentMethods ?? [],
          },
        ]
      : [],
  };
}

function toBaseRule(card: MarketCard): EvaluableRule {
  return {
    id: `${card.id}-rule-base`,
    cardProductId: card.id,
    rewardProgramId: null,
    label: card.baseLabel,
    kind: 'base',
    rewardType: card.rewardType,
    rewardUnit: UNIT_FOR_TYPE[card.rewardType],
    baseRate: card.baseRate,
    bonusRate: 0,
    fixedAmountUsd: null,
    priority: 1000,
    stackGroup: STACK_GROUP,
    isStackable: false,
    capAmount: null,
    capAppliesTo: 'spend',
    capPeriod: 'none',
    postCapRate: null,
    startsAt: null,
    endsAt: null,
    requiresEnrollment: false,
    spendThresholdUsd: null,
    lastVerifiedAt: new Date(`${card.ratesAsOf}T00:00:00.000Z`),
    verificationStatus: 'verified',
    isActive: true,
    conditions: [],
  };
}

/**
 * A catalog card as the engine wants to see it.
 *
 * `enrollments` and `capUsage` are the caller's business: the engine takes them as
 * input, and this file has no idea what the user has activated or how much of a cap
 * they have spent. Both default to empty, which the engine reads as "not enrolled"
 * and "nothing spent yet".
 */
export function toEvaluableCard(
  card: MarketCard,
  options: {
    readonly nickname?: string | null;
    readonly enrollments?: Readonly<Record<string, boolean>>;
  } = {},
): EvaluableCard {
  return {
    userCardId: card.id,
    cardProductId: card.id,
    displayName: `${card.issuerName} ${card.productName}`,
    issuerName: card.issuerName,
    nickname: options.nickname ?? null,
    annualFeeUsd: card.annualFeeUsd,
    foreignTransactionFeePercent: card.foreignTransactionFeePercent,
    supportedCountryCodes: ['US'],
    isPreferred: false,
    isExcludedFromRecommendations: false,
    accountOpenedOn: null,
    rules: [...card.bonuses.map((spec, index) => toRule(card, spec, index)), toBaseRule(card)],
    enrollments: options.enrollments ?? {},
    capUsage: {},
    offers: [],
  };
}

/** Every card, indexed by id, for a cheap lookup from stored ids. */
const BY_ID = new Map(MARKET_CARDS.map((card) => [card.id, card]));

export function findMarketCard(id: string): MarketCard | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Free-text search over the catalog.
 *
 * Matches the issuer, the product name and any extra search terms, so "amex gold",
 * "gold card" and "membership rewards" all find the same card. An empty query
 * returns everything, which is the right default for a list someone is browsing
 * rather than filtering.
 */
export function searchMarketCards(query: string): readonly MarketCard[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return MARKET_CARDS;

  return MARKET_CARDS.filter((card) => {
    const haystack = [
      card.issuerName,
      card.productName,
      card.summary,
      ...(card.searchTerms ?? []),
    ]
      .join(' ')
      .toLowerCase();

    // Every term must appear, so "chase sapphire" narrows rather than widens.
    return terms.every((term) => haystack.includes(term));
  });
}

/** The issuers represented, for grouping the picker. */
export const MARKET_ISSUERS: readonly string[] = [
  ...new Set(MARKET_CARDS.map((card) => card.issuerName)),
].sort();
