import {
  CATEGORIES,
  CATEGORY_SLUGS,
  categoriesForMcc,
  getCategoryById,
  getCategoryBySlug,
  isCategorySlug,
  MERCHANT_CATEGORY_DISCLAIMER,
} from './categories';

describe('category taxonomy', () => {
  it('defines exactly the thirteen quick-category buttons the product specifies', () => {
    expect(CATEGORIES).toHaveLength(13);
    expect(CATEGORIES.map((category) => category.slug)).toEqual([...CATEGORY_SLUGS]);
  });

  it('includes every category named in the purchase-form specification', () => {
    const required = [
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
    ];
    for (const slug of required) {
      expect(isCategorySlug(slug)).toBe(true);
    }
  });

  it('uses unique slugs, ids and display orders', () => {
    const slugs = new Set(CATEGORIES.map((category) => category.slug));
    const ids = new Set(CATEGORIES.map((category) => category.id));
    const orders = new Set(CATEGORIES.map((category) => category.displayOrder));

    expect(slugs.size).toBe(CATEGORIES.length);
    expect(ids.size).toBe(CATEGORIES.length);
    expect(orders.size).toBe(CATEGORIES.length);
  });

  it('uses ids matching the seed-data UUID convention, so offline joins work', () => {
    for (const category of CATEGORIES) {
      expect(category.id).toMatch(/^33333333-0000-4000-8000-0000000000\d{2}$/);
    }
  });

  it('gives every category a screen-reader hint', () => {
    for (const category of CATEGORIES) {
      expect(category.accessibilityHint.length).toBeGreaterThan(10);
    }
  });

  it('defines only well-ordered, valid MCC ranges', () => {
    for (const category of CATEGORIES) {
      for (const [from, to] of category.mccRanges) {
        expect(from).toBeLessThanOrEqual(to);
        expect(from).toBeGreaterThanOrEqual(1);
        expect(to).toBeLessThanOrEqual(9999);
      }
    }
  });
});

describe('lookup', () => {
  it('finds a category by slug', () => {
    expect(getCategoryBySlug('grocery').displayName).toBe('Grocery');
  });

  it('returns undefined for an unknown slug rather than throwing', () => {
    expect(getCategoryBySlug('not_a_category')).toBeUndefined();
  });

  it('finds a category by id', () => {
    const grocery = getCategoryBySlug('grocery');
    expect(getCategoryById(grocery.id)?.slug).toBe('grocery');
  });

  it('returns undefined for an unknown id', () => {
    expect(getCategoryById('00000000-0000-4000-8000-000000000000')).toBeUndefined();
  });
});

describe('categoriesForMcc', () => {
  it('maps a supermarket MCC to grocery', () => {
    expect(categoriesForMcc(5411).map((category) => category.slug)).toEqual(['grocery']);
  });

  it('maps a restaurant MCC to dining', () => {
    expect(categoriesForMcc(5812).map((category) => category.slug)).toEqual(['dining']);
  });

  it('maps a service-station MCC to gas', () => {
    expect(categoriesForMcc(5541).map((category) => category.slug)).toEqual(['gas']);
  });

  it('maps a warehouse-club MCC to warehouse club, not grocery', () => {
    // This is the coding surprise the amber warning exists for: a superstore
    // codes as 5300 and a grocery bonus will not apply to it.
    expect(categoriesForMcc(5300).map((category) => category.slug)).toEqual(['warehouse_club']);
  });

  it('returns more than one candidate for a genuinely ambiguous MCC', () => {
    // 4111 (commuter transport) sits in both general travel and transit. The
    // caller must treat this as a set of candidates and lower confidence, not
    // pick one and pretend to be sure.
    const slugs = categoriesForMcc(4111).map((category) => category.slug);
    expect(slugs).toContain('general_travel');
    expect(slugs).toContain('transit');
    expect(slugs.length).toBeGreaterThan(1);
  });

  it('returns nothing for an MCC we do not map', () => {
    expect(categoriesForMcc(9999)).toEqual([]);
  });

  it('returns nothing for an invalid MCC instead of throwing', () => {
    expect(categoriesForMcc(0)).toEqual([]);
    expect(categoriesForMcc(-5)).toEqual([]);
    expect(categoriesForMcc(10_000)).toEqual([]);
    expect(categoriesForMcc(5411.5)).toEqual([]);
    expect(categoriesForMcc(Number.NaN)).toEqual([]);
  });

  it('never maps anything to "other", which is a user choice not an inference', () => {
    for (let mcc = 1; mcc <= 9999; mcc += 1) {
      expect(categoriesForMcc(mcc).map((category) => category.slug)).not.toContain('other');
    }
  });
});

describe('MERCHANT_CATEGORY_DISCLAIMER', () => {
  it('states plainly that the issuer decides the category', () => {
    expect(MERCHANT_CATEGORY_DISCLAIMER).toMatch(/issuer/i);
    expect(MERCHANT_CATEGORY_DISCLAIMER).toMatch(/differ/i);
  });
});
