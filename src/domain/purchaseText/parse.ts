/**
 * Deterministic extraction of purchase fields from free text.
 *
 * WHERE THIS SITS RELATIVE TO THE LANGUAGE MODEL
 * The specification allows a model to turn free text into structured fields. That
 * is one of exactly two things a model may do in this codebase, and it happens in
 * a Supabase Edge Function, because the model API key is server-side only.
 *
 * This module is the deterministic first pass and the fallback. It handles the
 * common shapes — "twelve dollars", "$43.17", "tapped my phone", "online" —
 * without any network call, and it is what runs when the function is unreachable
 * or the user is offline. Its output is fed through the same Zod schema as the
 * manual form, so a model's output and this module's output are validated
 * identically.
 *
 * IT PRODUCES NO REWARD FIGURE. Nothing here touches a rate, and nothing here
 * decides which card wins.
 */
import { CATEGORIES, type CategorySlug } from '@/domain/categories';
import type { PaymentMethod } from '@/types/database';

export interface ParsedPurchaseText {
  /** `null` when no amount could be found. The form then asks for one. */
  readonly amountUsd: number | null;
  /** Best guess at the merchant, or `null`. */
  readonly merchant: string | null;
  readonly categorySlug: CategorySlug | null;
  readonly channel: 'online' | 'in_store' | null;
  readonly paymentMethod: PaymentMethod | null;
  /** Which fields the parser actually determined, for the UI to highlight. */
  readonly recognised: readonly ('amount' | 'merchant' | 'category' | 'channel' | 'payment')[];
}

const EMPTY: ParsedPurchaseText = {
  amountUsd: null,
  merchant: null,
  categorySlug: null,
  channel: null,
  paymentMethod: null,
  recognised: [],
};

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

/** Number words up to twenty, plus the tens, which covers everyday speech. */
const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  hundred: 100,
};

/**
 * Reads a spelled-out amount such as "twelve" or "forty three".
 *
 * Handles the additive tens-plus-units form and "N hundred". Anything more
 * elaborate is left to the numeric matcher or to the user — guessing at
 * "a couple hundred odd" would be worse than asking.
 */
function parseNumberWords(text: string): number | null {
  const tokens = text.split(/[\s-]+/u).filter((token) => token in NUMBER_WORDS);
  if (tokens.length === 0) return null;

  let total = 0;
  let current = 0;

  for (const token of tokens) {
    const value = NUMBER_WORDS[token];
    if (value === undefined) continue;

    if (value === 100) {
      current = (current === 0 ? 1 : current) * 100;
      continue;
    }
    current += value;
  }

  total += current;
  return total > 0 ? total : null;
}

/**
 * Extracts a dollar amount.
 *
 * Prefers an explicit `$` figure, then a bare decimal, then a spelled-out number
 * followed by a currency word. A bare integer with no currency marker is *not*
 * treated as an amount — "coffee at gate 12" is a gate number.
 */
export function extractAmountUsd(text: string): number | null {
  const lower = text.toLowerCase();

  // "$43.17", "$1,234.50", "$12"
  const dollarMatch = /\$\s*([\d,]+(?:\.\d+)?)/u.exec(lower);
  if (dollarMatch?.[1] !== undefined) {
    return toAmount(dollarMatch[1]);
  }

  // "43.17 dollars", "43.17 usd", or a bare decimal like "43.17"
  const decimalMatch = /\b([\d,]+\.\d+)\b/u.exec(lower);
  if (decimalMatch?.[1] !== undefined) {
    return toAmount(decimalMatch[1]);
  }

  // "12 dollars", "12 bucks", "12 usd"
  const numberWithCurrency = /\b([\d,]+)\s*(?:dollars?|bucks?|usd)\b/u.exec(lower);
  if (numberWithCurrency?.[1] !== undefined) {
    return toAmount(numberWithCurrency[1]);
  }

  // "twelve dollars", "forty three bucks"
  const wordsWithCurrency = /\b((?:[a-z]+[\s-]?){1,4})(?:dollars?|bucks?)\b/u.exec(lower);
  if (wordsWithCurrency?.[1] !== undefined) {
    const parsed = parseNumberWords(wordsWithCurrency[1]);
    if (parsed !== null) return parsed;
  }

  return null;
}

function toAmount(raw: string): number | null {
  const value = Number.parseFloat(raw.replace(/,/gu, ''));
  if (!Number.isFinite(value) || value <= 0) return null;
  // Two decimal places, matching the purchase schema.
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Payment method and channel
// ---------------------------------------------------------------------------

/** Ordered most-specific first, so "apple pay" wins over a bare "tapped". */
const PAYMENT_PATTERNS: readonly {
  readonly pattern: RegExp;
  readonly method: PaymentMethod;
}[] = [
  { pattern: /\bapple\s*pay\b/u, method: 'apple_pay' },
  { pattern: /\bgoogle\s*pay\b|\bg\s*pay\b/u, method: 'google_pay' },
  { pattern: /\bsamsung\s*pay\b/u, method: 'samsung_pay' },
  { pattern: /\btravel\s*portal\b|\bissuer\s*portal\b/u, method: 'issuer_travel_portal' },
  { pattern: /\bsaved\s*card\b|\bcard\s*on\s*file\b/u, method: 'card_on_file' },
  // "tapped my phone" is a mobile wallet; "tapped my card" is not.
  {
    pattern: /\btapp?(?:ed|ing)?\b[^.]{0,20}\bphone\b|\bphone\b[^.]{0,20}\btapp?(?:ed)?\b/u,
    method: 'apple_pay',
  },
  {
    pattern: /\btapp?(?:ed|ing)?\b[^.]{0,20}\bcard\b|\bcontactless\b/u,
    method: 'contactless_card',
  },
  {
    pattern: /\bswiped?\b|\binserted?\b|\bchip\b|\bphysical\s*card\b/u,
    method: 'physical_card',
  },
];

export function extractPaymentMethod(text: string): PaymentMethod | null {
  const lower = text.toLowerCase();
  for (const { pattern, method } of PAYMENT_PATTERNS) {
    if (pattern.test(lower)) return method;
  }
  return null;
}

export function extractChannel(text: string): 'online' | 'in_store' | null {
  const lower = text.toLowerCase();

  if (
    /\bonline\b|\bwebsite\b|\bweb\s*site\b|\bapp\b|\bdelivery\b|\bordered?\s+from\b/u.test(
      lower,
    )
  ) {
    return 'online';
  }
  if (
    /\bin\s*store\b|\bin\s*person\b|\bat\s+the\s+(?:till|counter|register)\b|\bswiped?\b|\btapp?(?:ed)?\b/u.test(
      lower,
    )
  ) {
    return 'in_store';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

/**
 * Keywords per category.
 *
 * Deliberately conservative. A wrong category is worse than no category, because
 * the engine handles `unknown` honestly whereas a confident wrong answer sends the
 * user to the wrong card.
 */
const CATEGORY_KEYWORDS: Readonly<Record<CategorySlug, readonly string[]>> = {
  dining: [
    'restaurant',
    'dinner',
    'lunch',
    'breakfast',
    'brunch',
    'cafe',
    'coffee',
    'takeaway',
    'takeout',
    'pizza',
    'bar',
    'pub',
    'diner',
    'bakery',
    'espresso',
  ],
  grocery: ['grocery', 'groceries', 'supermarket', 'market', 'food shop', 'produce'],
  gas: ['gas', 'petrol', 'fuel', 'filled up', 'gas station', 'diesel'],
  airfare: ['flight', 'flights', 'airfare', 'airline', 'plane ticket', 'boarding'],
  hotel: ['hotel', 'motel', 'lodging', 'inn', 'resort', 'stay', 'night at'],
  general_travel: [
    'travel',
    'cruise',
    'car rental',
    'rental car',
    'train ticket',
    'travel agency',
  ],
  transit: [
    'transit',
    'subway',
    'metro',
    'bus',
    'rideshare',
    'taxi',
    'toll',
    'parking',
    'commute',
  ],
  pharmacy: ['pharmacy', 'chemist', 'drug store', 'drugstore', 'prescription'],
  online_shopping: ['amazon', 'online shopping', 'ordered online', 'marketplace', 'e-commerce'],
  entertainment: [
    'cinema',
    'movie',
    'movies',
    'concert',
    'theatre',
    'theater',
    'streaming',
    'tickets',
  ],
  warehouse_club: ['warehouse club', 'warehouse', 'wholesale', 'bulk'],
  utilities: [
    'utility',
    'utilities',
    'electric bill',
    'gas bill',
    'water bill',
    'internet bill',
    'phone bill',
  ],
  // Never inferred from a keyword: "other" is a choice the user makes.
  other: [],
};

export function extractCategorySlug(text: string): CategorySlug | null {
  const lower = ` ${text.toLowerCase()} `;

  let best: { slug: CategorySlug; length: number } | null = null;

  for (const category of CATEGORIES) {
    for (const keyword of CATEGORY_KEYWORDS[category.slug]) {
      if (!lower.includes(` ${keyword} `) && !lower.includes(`${keyword} `)) continue;
      // Longest keyword wins, so "gas bill" beats "gas".
      if (best === null || keyword.length > best.length) {
        best = { slug: category.slug, length: keyword.length };
      }
    }
  }

  return best?.slug ?? null;
}

// ---------------------------------------------------------------------------
// Merchant
// ---------------------------------------------------------------------------

/** Words that introduce a merchant name. */
const MERCHANT_PREPOSITIONS = ['at', 'from', 'in', 'with'];

/**
 * Trailing words that are clearly not part of a name.
 *
 * Note `and then` rather than a bare `and`: plenty of real merchants are called
 * "Kettle and Crumb", and cutting at the first "and" would mangle them.
 */
const TRAILING_NOISE =
  /\b(?:for|and\s+then|then|using|paid|pay|with|on|about|around|roughly|today|yesterday)\b.*$/u;

/** A leading article is never part of the name the user means. */
const LEADING_ARTICLE = /^(?:the|a|an)\s+/iu;

/**
 * Best guess at the merchant name.
 *
 * Looks for "at <name>" / "from <name>" and stops at the first token that is
 * clearly something else — a number, a currency word, or a connective. Returns
 * `null` rather than guessing when there is no such phrase, because the merchant
 * field is the one the user most easily fills in themselves.
 */
export function extractMerchant(text: string): string | null {
  const cleaned = text.replace(/\$\s*[\d,]+(?:\.\d{1,2})?/gu, ' ');

  for (const preposition of MERCHANT_PREPOSITIONS) {
    const pattern = new RegExp(`\\b${preposition}\\s+(.+)$`, 'iu');
    const match = pattern.exec(cleaned);
    const tail = match?.[1];
    if (tail === undefined) continue;

    const candidate = tail
      // A comma or semicolon is a strong clause boundary in this kind of input:
      // "at Greenleaf Market, swiped my card" names one merchant, not three words
      // more. Split before stripping punctuation, or the boundary is lost.
      .split(/[,;]/u)[0]!
      .replace(TRAILING_NOISE, '')
      .replace(/\b[\d,]+(?:\.\d+)?\b/gu, ' ')
      .replace(/\b(?:dollars?|bucks?|usd)\b/giu, ' ')
      .replace(/[.:!?]+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
      .replace(LEADING_ARTICLE, '');

    // Require something name-shaped rather than a stray article.
    if (candidate.length >= 3 && /\p{L}/u.test(candidate)) {
      return titleCaseIfShouting(candidate);
    }
  }

  return null;
}

/** Leaves ordinary capitalisation alone; tidies ALL CAPS input. */
function titleCaseIfShouting(value: string): string {
  if (value !== value.toUpperCase()) return value;
  return value
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parses free text into whatever purchase fields it can support.
 *
 * Reports which fields it recognised so the UI can pre-fill those and leave the
 * rest for the user, rather than silently inventing values. Every field is
 * independently optional; the caller validates the assembled result with
 * `purchaseIntentSchema` exactly as it would a hand-filled form.
 */
export function parsePurchaseText(text: string): ParsedPurchaseText {
  const trimmed = text.trim();
  if (trimmed.length === 0) return EMPTY;

  const amountUsd = extractAmountUsd(trimmed);
  const merchant = extractMerchant(trimmed);
  const categorySlug = extractCategorySlug(trimmed);
  const channel = extractChannel(trimmed);
  const paymentMethod = extractPaymentMethod(trimmed);

  const recognised: ParsedPurchaseText['recognised'] = [
    ...(amountUsd !== null ? (['amount'] as const) : []),
    ...(merchant !== null ? (['merchant'] as const) : []),
    ...(categorySlug !== null ? (['category'] as const) : []),
    ...(channel !== null ? (['channel'] as const) : []),
    ...(paymentMethod !== null ? (['payment'] as const) : []),
  ];

  return { amountUsd, merchant, categorySlug, channel, paymentMethod, recognised };
}
