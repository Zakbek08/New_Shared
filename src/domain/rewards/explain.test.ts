/**
 * The explanation layer must be able to say only what the breakdown contains.
 * These tests pin the wording and, more importantly, check that no figure appears
 * which the engine did not compute.
 */
import { evaluateWallet } from './evaluate';
import { describeCandidate, describeIneligibility, describeReward } from './explain';
import { INELIGIBILITY_CODES } from './types';
import {
  CATEGORY,
  MERCHANT,
  PROGRAM,
  baseRule,
  capUsage,
  card,
  categoryRule,
  context,
  flatCard,
  intent,
  offer,
  rule,
  valuation,
} from './__fixtures__/wallet';

const evaluate = (
  cards: Parameters<typeof evaluateWallet>[1],
  overrides: Partial<Parameters<typeof evaluateWallet>[0]> = {},
  ctx: Partial<Parameters<typeof evaluateWallet>[2]> = {},
) => evaluateWallet(intent(overrides), cards, context(ctx));

describe('describeIneligibility', () => {
  it('has plain-language wording for every code', () => {
    // A missing entry would render an empty reason on the results screen.
    for (const code of INELIGIBILITY_CODES) {
      const reason = describeIneligibility(code);
      expect(reason.length).toBeGreaterThan(10);
      expect(reason.endsWith('.')).toBe(true);
    }
  });

  it('never leaks the machine-readable code into the wording', () => {
    for (const code of INELIGIBILITY_CODES) {
      expect(describeIneligibility(code)).not.toContain(code);
      expect(describeIneligibility(code)).not.toContain('_');
    }
  });

  it('falls back to a general statement for a null code', () => {
    expect(describeIneligibility(null)).toMatch(/cannot be used/i);
  });
});

describe('describeCandidate', () => {
  it('uses the applied rule’s own label, not a paraphrase', () => {
    const groceryCard = card({
      userCardId: 'grocery',
      rules: [categoryRule({ id: 'g', categoryId: CATEGORY.grocery, rate: 6 })],
    });
    // The builder labels this rule "6% on that category".
    const result = evaluate([groceryCard]);
    expect(describeCandidate(result.recommended!)).toContain('6% on that category');
  });

  it('mentions an offer’s contribution', () => {
    const withOffer = flatCard(2, {
      userCardId: 'offer-card',
      offers: [offer({ merchantId: MERCHANT.greenleafMarket, rate: 10 })],
    });
    expect(describeCandidate(evaluate([withOffer]).recommended!)).toContain(
      '$12.00 from an offer',
    );
  });

  it('mentions a statement credit', () => {
    const hotel = card({
      userCardId: 'hotel',
      rules: [
        baseRule(1),
        rule({
          id: 'credit',
          kind: 'statement_credit',
          rewardType: 'statement_credit',
          rewardUnit: 'usd',
          baseRate: 0,
          fixedAmountUsd: 50,
          stackGroup: 'credit',
          isStackable: true,
        }),
      ],
    });
    expect(describeCandidate(evaluate([hotel]).recommended!)).toContain(
      '$50.00 statement credit',
    );
  });

  it('mentions a subtracted foreign transaction fee', () => {
    const feeCard = flatCard(2, {
      userCardId: 'fee',
      foreignTransactionFeePercent: 3,
      supportedCountryCodes: ['US', 'FR'],
    });
    const result = evaluate([feeCard], { currencyCode: 'EUR', countryCode: 'FR' });
    expect(describeCandidate(result.recommended!)).toContain('foreign transaction fee');
  });

  it('gives the rejection reason for an ineligible card', () => {
    const diningOnly = card({
      userCardId: 'dining',
      rules: [categoryRule({ id: 'd', categoryId: CATEGORY.dining, rate: 4 })],
    });
    const result = evaluate([diningOnly]);
    expect(result.ineligible[0]?.reason).toMatch(/no bonus for that category/i);
  });
});

describe('describeReward', () => {
  it('shows cash back as a dollar figure', () => {
    expect(describeReward(evaluate([flatCard(6)]).recommended!)).toBe('$7.20');
  });

  it('shows points in their own units and their dollar value', () => {
    // "480 points" alone is not comparable to "$7.20"; the user needs both.
    const points = card({
      userCardId: 'points',
      rules: [baseRule(4, { rewardUnit: 'points', rewardProgramId: PROGRAM.cobaltPoints })],
    });
    const result = evaluate(
      [points],
      {},
      {
        valuation: valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 1.25 } }),
      },
    );

    expect(describeReward(result.recommended!)).toBe('480 points (about $6.00)');
  });
});

describe('explainRecommendation', () => {
  it('names the card, the amount and the comparison', () => {
    const wallet = [
      card({
        userCardId: 'grocery',
        displayName: 'Northwind Everyday Grocery Card',
        rules: [
          baseRule(1),
          categoryRule({
            id: 'grocery-bonus',
            categoryId: CATEGORY.grocery,
            rate: 6,
            capAmount: 6000,
            capPeriod: 'calendar_year',
            postCapRate: 1,
          }),
        ],
      }),
      flatCard(2, { displayName: 'Cobalt Everyday Flat Card' }),
    ];

    const explanation = evaluate(wallet).explanation;

    expect(explanation).toContain('Use your Northwind Everyday Grocery Card.');
    expect(explanation).toContain('$7.20');
    expect(explanation).toContain('$6,000 cap');
    expect(explanation).toContain('Cobalt Everyday Flat Card');
  });

  it('prefers the nickname when the user set one', () => {
    const nicknamed = flatCard(2, { userCardId: 'nick', nickname: 'Groceries' });
    expect(evaluate([nicknamed]).explanation).toContain('Use your Groceries.');
  });

  it('explains a partially available cap with the actual split', () => {
    const capped = card({
      userCardId: 'capped',
      rules: [
        baseRule(1),
        categoryRule({
          id: 'grocery-bonus',
          categoryId: CATEGORY.grocery,
          rate: 6,
          capAmount: 6000,
          capPeriod: 'calendar_year',
          postCapRate: 1,
        }),
      ],
      capUsage: { 'grocery-bonus': capUsage({ qualifyingSpendUsd: 5920 }) },
    });

    const explanation = evaluate([capped]).explanation;
    expect(explanation).toContain('Only $80.00 of this purchase fits under the $6,000 cap');
  });

  it('says plainly when a cap is fully used', () => {
    const capped = card({
      userCardId: 'capped',
      rules: [
        categoryRule({
          id: 'grocery-bonus',
          categoryId: CATEGORY.grocery,
          rate: 6,
          capAmount: 6000,
          capPeriod: 'calendar_year',
          postCapRate: 1,
        }),
      ],
      capUsage: { 'grocery-bonus': capUsage({ qualifyingSpendUsd: 6000 }) },
    });

    expect(evaluate([capped]).explanation).toContain('used the whole $6,000 bonus cap');
  });

  it('attributes the point valuation to the user', () => {
    const points = card({
      userCardId: 'points',
      rules: [baseRule(4, { rewardUnit: 'points', rewardProgramId: PROGRAM.cobaltPoints })],
    });
    const explanation = evaluate(
      [points],
      {},
      {
        valuation: valuation({ byProgramId: { [PROGRAM.cobaltPoints]: 1.25 } }),
      },
    ).explanation;

    expect(explanation).toContain('1.25¢ per point');
    expect(explanation).toContain('your own figure');
  });

  it('states the runner-up’s own figure, not only the gap', () => {
    // $120 at 6% is $7.20; at 5% it is $6.00. The specification asks for the
    // second-best amount outright — "$1.20 better" alone makes the user subtract.
    const winner = card({
      userCardId: 'six',
      displayName: 'Six Percent Card',
      rules: [categoryRule({ id: 'six-bonus', categoryId: CATEGORY.grocery, rate: 6 })],
    });
    const second = card({
      userCardId: 'five',
      displayName: 'Five Percent Card',
      rules: [categoryRule({ id: 'five-bonus', categoryId: CATEGORY.grocery, rate: 5 })],
    });

    const explanation = evaluate([winner, second]).explanation;

    expect(explanation).toContain('$1.20 more than your next best option');
    expect(explanation).toContain('Five Percent Card');
    expect(explanation).toContain('would earn about $6.00');
  });

  it('states the equal amount when two cards tie', () => {
    const a = flatCard(2, { userCardId: 'a', displayName: 'A Card' });
    const b = flatCard(2, { userCardId: 'b', displayName: 'B Card' });

    // $120 × 2% = $2.40 on both.
    const explanation = evaluate([a, b]).explanation;

    expect(explanation).toContain('earns the same amount, about $2.40');
  });

  it('explains a minimum-benefit hold in the user’s terms', () => {
    const preferred = flatCard(2, {
      userCardId: 'pref',
      displayName: 'Preferred Card',
      isPreferred: true,
    });
    const marginal = flatCard(2.05, { userCardId: 'marginal', displayName: 'Marginal Card' });

    const explanation = evaluate(
      [preferred, marginal],
      {},
      {
        valuation: valuation({ minimumSwitchBenefitUsd: 0.5 }),
      },
    ).explanation;

    expect(explanation).toContain('Use your Preferred Card.');
    expect(explanation).toContain('not enough to be worth switching');
  });

  it('explains a preference tie-break', () => {
    const preferred = flatCard(2, {
      userCardId: 'pref',
      displayName: 'Preferred Card',
      isPreferred: true,
    });
    const other = flatCard(2, { userCardId: 'other', displayName: 'Other Card' });

    expect(evaluate([preferred, other]).explanation).toContain(
      'earns the same, so we kept your preferred card',
    );
  });

  it('says so when nothing qualifies', () => {
    const diningOnly = card({
      userCardId: 'dining',
      rules: [categoryRule({ id: 'd', categoryId: CATEGORY.dining, rate: 4 })],
    });

    const explanation = evaluate([diningOnly]).explanation;
    expect(explanation).toMatch(/None of the cards in your wallet earns a reward/);
    expect(explanation).toMatch(/reason for each one is listed/);
  });

  it('contains no figure the breakdown does not hold', () => {
    // Every dollar amount in the sentence must appear in the breakdown, so the
    // explanation cannot introduce a number of its own.
    const wallet = [
      card({
        userCardId: 'grocery',
        displayName: 'Grocery Card',
        rules: [
          baseRule(1),
          categoryRule({
            id: 'g',
            categoryId: CATEGORY.grocery,
            rate: 6,
            capAmount: 6000,
            capPeriod: 'calendar_year',
            postCapRate: 1,
          }),
        ],
      }),
      flatCard(2),
    ];

    const result = evaluate(wallet);
    const breakdown = result.recommended!.breakdown;

    const permitted = new Set(
      [
        breakdown.netValueUsd,
        breakdown.rewardValueUsd,
        breakdown.offerValueUsd,
        breakdown.statementCreditUsd,
        breakdown.foreignTransactionFeeUsd,
        breakdown.withinCapSpendUsd,
        breakdown.overCapSpendUsd,
        result.recommended!.capAmountUsd,
        result.recommended!.capRemainingUsd,
        result.advantageOverRunnerUpUsd,
        result.runnerUp?.breakdown.netValueUsd,
      ]
        .filter((value): value is number => typeof value === 'number')
        .map((value) => value.toFixed(2)),
    );

    const dollarFigures = [...result.explanation.matchAll(/\$([\d,]+(?:\.\d{2})?)/g)].map(
      (match) => Number.parseFloat((match[1] ?? '0').replace(/,/g, '')).toFixed(2),
    );

    expect(dollarFigures.length).toBeGreaterThan(0);
    for (const figure of dollarFigures) {
      expect(permitted).toContain(figure);
    }
  });

  it('never mentions a rate the applied rule does not have', () => {
    const result = evaluate([flatCard(6)]);
    expect(result.explanation).toContain('6%');
    expect(result.explanation).not.toContain('7%');
  });
});

describe('rule labels flow through unchanged', () => {
  it('quotes the label from the card terms verbatim', () => {
    const labelled = card({
      userCardId: 'labelled',
      rules: [
        baseRule(6, {
          id: 'exact',
          label: '6% cash back at US supermarkets, on up to $6,000 per calendar year',
        }),
      ],
    });

    // The wording comes from the card's terms, not from us paraphrasing them.
    expect(evaluate([labelled]).explanation).toContain(
      '6% cash back at US supermarkets, on up to $6,000 per calendar year',
    );
  });

  it('keeps a leading capital when it looks deliberate', () => {
    const acronym = card({
      userCardId: 'acronym',
      rules: [baseRule(3, { id: 'us', label: 'US supermarkets earn 3%' })],
    });
    expect(evaluate([acronym]).explanation).toContain('US supermarkets earn 3%');
  });
});
