/**
 * The dashboard's per-category list.
 *
 * The property that matters most is the negative one: a category no card earns a
 * bonus in must come back with a `null` candidate, not a plausible-looking figure
 * borrowed from somewhere else.
 */
import { CATEGORIES, getCategoryBySlug } from '@/domain/categories';
import {
  AS_OF,
  CATEGORY,
  card,
  categoryRule,
  flatCard,
  rule,
  valuation,
} from '@/domain/rewards/__fixtures__/wallet';

import { REFERENCE_AMOUNT_USD, topCardsByCategory } from './topCards';

describe('topCardsByCategory', () => {
  it('covers every category except "other"', () => {
    const entries = topCardsByCategory({
      cards: [flatCard(1.5)],
      valuation: valuation(),
      asOf: AS_OF,
    });

    expect(entries).toHaveLength(CATEGORIES.length - 1);
    expect(entries.map((entry) => entry.category.slug)).not.toContain('other');
  });

  it('picks the category bonus over the flat card in that category', () => {
    const entries = topCardsByCategory({
      cards: [
        flatCard(1.5),
        card({
          userCardId: 'grocery-card',
          displayName: 'Grocery Card',
          rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })],
        }),
      ],
      valuation: valuation(),
      asOf: AS_OF,
    });

    const grocery = entries.find((entry) => entry.category.slug === 'grocery');
    const dining = entries.find((entry) => entry.category.slug === 'dining');

    expect(grocery?.candidate?.card.userCardId).toBe('grocery-card');
    // The grocery card has no rule outside groceries, so dining falls to the flat
    // card rather than borrowing the 6%.
    expect(dining?.candidate?.card.userCardId).toBe('flat-1.5');
  });

  it('computes the effective return off the reference amount', () => {
    // $100 × 6% = $6.00, which is a 6.0% return.
    const entries = topCardsByCategory({
      cards: [card({ rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })] })],
      valuation: valuation(),
      asOf: AS_OF,
    });

    const grocery = entries.find((entry) => entry.category.slug === 'grocery');

    expect(REFERENCE_AMOUNT_USD).toBe(100);
    expect(grocery?.candidate?.breakdown.netValueUsd).toBe(6);
    expect(grocery?.effectiveReturnPercent).toBe(6);
  });

  it('rounds the effective return to one decimal place', () => {
    // $100 × 1.5% = $1.50 → 1.5%.
    const entries = topCardsByCategory({
      cards: [flatCard(1.5)],
      valuation: valuation(),
      asOf: AS_OF,
    });

    expect(entries[0]?.effectiveReturnPercent).toBe(1.5);
  });

  it('reports a null candidate rather than shortening the list', () => {
    // A card that only earns on groceries leaves twelve categories genuinely
    // uncovered. Omitting them would read as "we checked and found nothing to say";
    // a null says "no card of yours earns here", which is the real answer.
    const entries = topCardsByCategory({
      cards: [
        card({
          rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })],
        }),
      ],
      valuation: valuation(),
      asOf: AS_OF,
    });

    expect(entries).toHaveLength(CATEGORIES.length - 1);

    const uncovered = entries.filter((entry) => entry.candidate === null);
    expect(uncovered.length).toBe(CATEGORIES.length - 2);
    expect(uncovered.every((entry) => entry.effectiveReturnPercent === null)).toBe(true);
  });

  it('returns a null candidate for every category when the wallet is empty', () => {
    const entries = topCardsByCategory({
      cards: [],
      valuation: valuation(),
      asOf: AS_OF,
    });

    expect(entries.every((entry) => entry.candidate === null)).toBe(true);
  });

  it('evaluates in store, so an online-only bonus does not appear', () => {
    // Recommending a card whose bonus the user cannot use at the till would be
    // worse than saying nothing.
    const onlineOnly = rule({
      id: 'rule-online',
      label: '5% online only',
      baseRate: 5,
      conditions: [
        {
          ...categoryRule({ categoryId: CATEGORY.grocery, rate: 5 }).conditions[0]!,
          channel: 'online' as const,
        },
      ],
    });

    const entries = topCardsByCategory({
      cards: [card({ userCardId: 'online-card', rules: [onlineOnly] })],
      valuation: valuation(),
      asOf: AS_OF,
    });

    expect(entries.find((entry) => entry.category.slug === 'grocery')?.candidate).toBeNull();
  });

  it('honours the user’s point valuation rather than a headline multiplier', () => {
    // 3× points looks better than 2% cash back until the points are valued. At 0.5¢
    // a point, $100 earns 300 points worth $1.50 — less than the $2.00 cash card.
    const pointsRule = rule({
      id: 'rule-points',
      label: '3× points on dining',
      rewardUnit: 'points',
      rewardType: 'points_per_dollar',
      baseRate: 3,
      rewardProgramId: 'program-points',
      conditions: [
        { ...categoryRule({ categoryId: CATEGORY.dining, rate: 3 }).conditions[0]! },
      ],
    });

    const entries = topCardsByCategory({
      cards: [
        card({ userCardId: 'points-card', displayName: 'Points Card', rules: [pointsRule] }),
        flatCard(2, { userCardId: 'cash-card', displayName: 'Cash Card' }),
      ],
      valuation: valuation({ byProgramId: { 'program-points': 0.5 } }),
      asOf: AS_OF,
    });

    const dining = entries.find((entry) => entry.category.slug === 'dining');

    expect(dining?.candidate?.card.userCardId).toBe('cash-card');
    expect(dining?.candidate?.breakdown.netValueUsd).toBe(2);
  });

  it('drops a category whose bonus cap is already exhausted', () => {
    // $100 of the annual cap spent against a $100 cap leaves nothing, and the rule
    // has no post-cap rate, so the card earns nothing in that category.
    const capped = categoryRule({
      id: 'rule-capped',
      categoryId: CATEGORY.gas,
      rate: 5,
      capAmount: 100,
      capPeriod: 'calendar_year',
    });

    const entries = topCardsByCategory({
      cards: [
        card({
          rules: [capped],
          capUsage: {
            'rule-capped': {
              periodStart: new Date('2026-01-01T00:00:00.000Z'),
              periodEnd: new Date('2027-01-01T00:00:00.000Z'),
              qualifyingSpendUsd: 100,
              accruedRewardUsd: 5,
            },
          },
        }),
      ],
      valuation: valuation(),
      asOf: AS_OF,
    });

    expect(entries.find((entry) => entry.category.slug === 'gas')?.candidate).toBeNull();
  });

  it('is deterministic: the same snapshot and instant give the same list', () => {
    const cards = [
      flatCard(1.5),
      card({ rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })] }),
    ];
    const options = { cards, valuation: valuation(), asOf: AS_OF };

    expect(topCardsByCategory(options)).toEqual(topCardsByCategory(options));
  });

  it('accepts an explicit category list, for a narrower view', () => {
    const grocery = getCategoryBySlug('grocery');

    const entries = topCardsByCategory({
      cards: [flatCard(1)],
      valuation: valuation(),
      asOf: AS_OF,
      categories: [grocery],
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.category.slug).toBe('grocery');
  });
});
