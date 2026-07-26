/**
 * The canonical WalletWise merchant-category taxonomy.
 *
 * This mirrors `supabase/seed/01_reference_taxonomy.sql`. Keeping a local copy
 * lets the purchase form render its quick-category buttons offline and gives
 * the classifier a deterministic fallback when the catalog is unreachable.
 *
 * MCC ranges are INDICATIVE. Card issuers decide how a merchant is coded and
 * their decision is authoritative. Wherever WalletWise relies on an MCC hint
 * rather than a confirmed coding, it must say so — see
 * `MERCHANT_CATEGORY_DISCLAIMER`.
 */

export const CATEGORY_SLUGS = [
  'dining',
  'grocery',
  'gas',
  'airfare',
  'hotel',
  'general_travel',
  'transit',
  'pharmacy',
  'online_shopping',
  'entertainment',
  'warehouse_club',
  'utilities',
  'other',
] as const;

export type CategorySlug = (typeof CATEGORY_SLUGS)[number];

export interface CategoryDefinition {
  readonly slug: CategorySlug;
  readonly displayName: string;
  /** Stable UUID matching the seed data, so offline lookups still join. */
  readonly id: string;
  readonly displayOrder: number;
  readonly iconName: string;
  /** Inclusive MCC ranges, `[from, to]`. Indicative only. */
  readonly mccRanges: readonly (readonly [number, number])[];
  /** Short, factual accessibility description. */
  readonly accessibilityHint: string;
}

const CATEGORY_ID_PREFIX = '33333333-0000-4000-8000-0000000000';

const categoryId = (index: number): string =>
  `${CATEGORY_ID_PREFIX}${index.toString().padStart(2, '0')}`;

export const CATEGORIES: readonly CategoryDefinition[] = [
  {
    slug: 'dining',
    displayName: 'Dining',
    id: categoryId(1),
    displayOrder: 1,
    iconName: 'utensils',
    mccRanges: [[5811, 5814]],
    accessibilityHint: 'Restaurants, cafes, bars and food delivery',
  },
  {
    slug: 'grocery',
    displayName: 'Grocery',
    id: categoryId(2),
    displayOrder: 2,
    iconName: 'shopping-basket',
    mccRanges: [
      [5411, 5411],
      [5422, 5422],
      [5451, 5451],
      [5499, 5499],
    ],
    accessibilityHint: 'Supermarkets and grocery stores',
  },
  {
    slug: 'gas',
    displayName: 'Gas',
    id: categoryId(3),
    displayOrder: 3,
    iconName: 'fuel',
    mccRanges: [
      [5541, 5542],
      [5983, 5983],
    ],
    accessibilityHint: 'Service stations and fuel dealers',
  },
  {
    slug: 'airfare',
    displayName: 'Airfare',
    id: categoryId(4),
    displayOrder: 4,
    iconName: 'plane',
    mccRanges: [
      [3000, 3350],
      [4511, 4511],
    ],
    accessibilityHint: 'Airline tickets and air carriers',
  },
  {
    slug: 'hotel',
    displayName: 'Hotel',
    id: categoryId(5),
    displayOrder: 5,
    iconName: 'bed',
    mccRanges: [
      [3501, 3999],
      [7011, 7011],
    ],
    accessibilityHint: 'Hotels, motels and lodging',
  },
  {
    slug: 'general_travel',
    displayName: 'General travel',
    id: categoryId(6),
    displayOrder: 6,
    iconName: 'globe',
    mccRanges: [
      [4111, 4112],
      [4411, 4411],
      [4722, 4723],
      [7512, 7513],
    ],
    accessibilityHint: 'Travel agencies, cruises, car rental and rail',
  },
  {
    slug: 'transit',
    displayName: 'Transit',
    id: categoryId(7),
    displayOrder: 7,
    iconName: 'train',
    mccRanges: [
      [4111, 4131],
      [7523, 7523],
    ],
    accessibilityHint: 'Commuter rail, buses, rideshare, tolls and parking',
  },
  {
    slug: 'pharmacy',
    displayName: 'Pharmacy',
    id: categoryId(8),
    displayOrder: 8,
    iconName: 'pill',
    mccRanges: [
      [5122, 5122],
      [5912, 5912],
    ],
    accessibilityHint: 'Pharmacies and drug stores',
  },
  {
    slug: 'online_shopping',
    displayName: 'Online shopping',
    id: categoryId(9),
    displayOrder: 9,
    iconName: 'package',
    mccRanges: [
      [5262, 5262],
      [5310, 5311],
      [5942, 5942],
      [5964, 5969],
    ],
    accessibilityHint: 'Online retailers, marketplaces and mail order',
  },
  {
    slug: 'entertainment',
    displayName: 'Entertainment',
    id: categoryId(10),
    displayOrder: 10,
    iconName: 'ticket',
    mccRanges: [
      [7832, 7832],
      [7922, 7922],
      [7929, 7929],
      [7996, 7999],
    ],
    accessibilityHint: 'Cinemas, live events, streaming and attractions',
  },
  {
    slug: 'warehouse_club',
    displayName: 'Warehouse club',
    id: categoryId(11),
    displayOrder: 11,
    iconName: 'warehouse',
    mccRanges: [[5300, 5300]],
    accessibilityHint: 'Membership warehouse clubs and wholesale stores',
  },
  {
    slug: 'utilities',
    displayName: 'Utilities',
    id: categoryId(12),
    displayOrder: 12,
    iconName: 'plug',
    mccRanges: [
      [4814, 4816],
      [4900, 4900],
    ],
    accessibilityHint: 'Electricity, gas, water, phone and internet bills',
  },
  {
    slug: 'other',
    displayName: 'Other',
    id: categoryId(13),
    displayOrder: 13,
    iconName: 'circle-dot',
    mccRanges: [],
    accessibilityHint: 'Anything that does not fit the categories above',
  },
];

const BY_SLUG: ReadonlyMap<CategorySlug, CategoryDefinition> = new Map(
  CATEGORIES.map((category) => [category.slug, category]),
);

const BY_ID: ReadonlyMap<string, CategoryDefinition> = new Map(
  CATEGORIES.map((category) => [category.id, category]),
);

export function getCategoryBySlug(slug: CategorySlug): CategoryDefinition;
export function getCategoryBySlug(slug: string): CategoryDefinition | undefined;
export function getCategoryBySlug(slug: string): CategoryDefinition | undefined {
  return BY_SLUG.get(slug as CategorySlug);
}

export function getCategoryById(id: string): CategoryDefinition | undefined {
  return BY_ID.get(id);
}

export function isCategorySlug(value: string): value is CategorySlug {
  return BY_SLUG.has(value as CategorySlug);
}

/**
 * Every category whose indicative MCC ranges contain `mcc`.
 *
 * More than one category can match — 4111 for example sits in both
 * `general_travel` and `transit`. Callers must treat the result as a set of
 * candidates, not an answer, and lower confidence accordingly.
 */
export function categoriesForMcc(mcc: number): readonly CategoryDefinition[] {
  if (!Number.isInteger(mcc) || mcc < 1 || mcc > 9999) return [];
  return CATEGORIES.filter((category) =>
    category.mccRanges.some(([from, to]) => mcc >= from && mcc <= to),
  );
}

/** Shown wherever a category was inferred rather than confirmed. */
export const MERCHANT_CATEGORY_DISCLAIMER =
  'Categories are our best interpretation of how a merchant is usually coded. ' +
  'Your card issuer decides the actual category, and it can differ from what we show.';
