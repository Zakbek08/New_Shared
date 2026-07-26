/**
 * The audit table is the user's means of checking our arithmetic, so the rows have
 * to add up on paper. Each test below writes the sum out in words.
 *
 * `breakdownRows` is asserted rather than the rendered component: the rows *are*
 * the contract, and testing them directly means a failure names the wrong number
 * instead of a missing text node.
 */
import { evaluateWallet } from '@/domain/rewards';
import {
  AS_OF,
  CATEGORY,
  card,
  categoryRule,
  context,
  intent,
  rule,
  valuation,
} from '@/domain/rewards/__fixtures__/wallet';

import { breakdownRows } from './BreakdownTable';

/** Pulls one row's value out, so a test can name the row it means. */
function valueOf(rows: readonly { label: string; value: string }[], label: string): string {
  const row = rows.find((candidate) => candidate.label === label);
  if (row === undefined) {
    throw new Error(`No row labelled "${label}". Rows: ${rows.map((r) => r.label).join(', ')}`);
  }
  return row.value;
}

function labelsOf(rows: readonly { label: string }[]): string[] {
  return rows.map((row) => row.label);
}

describe('breakdownRows', () => {
  it('shows the specification example: $120 × 6% = $7.20', () => {
    const result = evaluateWallet(
      intent(),
      [
        card({
          userCardId: 'grocery-card',
          rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })],
        }),
      ],
      context(),
    );

    const candidate = result.recommended;
    expect(candidate).not.toBeNull();
    const rows = breakdownRows(candidate!, 120);

    expect(valueOf(rows, 'Purchase amount')).toBe('$120.00');
    expect(valueOf(rows, 'Reward rate')).toBe('6%');
    expect(valueOf(rows, 'Cash back')).toBe('$7.20');
    expect(valueOf(rows, 'Estimated value')).toBe('$7.20');
  });

  it('marks the total row so the screen can emphasise it, and puts it last', () => {
    const result = evaluateWallet(
      intent(),
      [card({ rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })] })],
      context(),
    );

    const rows = breakdownRows(result.recommended!, 120);
    const total = rows[rows.length - 1];

    expect(total?.label).toBe('Estimated value');
    expect(total?.isTotal).toBe(true);
    expect(total?.tone).toBe('success');
  });

  it('hides the cap split when no cap was reached', () => {
    const result = evaluateWallet(
      intent(),
      [card({ rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })] })],
      context(),
    );

    // Showing "$120 earning the bonus rate, $0 above the cap" on every purchase is
    // noise that makes the rows that matter harder to find.
    expect(labelsOf(breakdownRows(result.recommended!, 120))).not.toContain('Above the cap');
  });

  it('shows the cap split when the cap bit, and the split adds back to the amount', () => {
    // $6,000 annual cap with $5,950 already spent leaves $50 at 6% and $70 at 1%.
    // 50 × 6% = $3.00; 70 × 1% = $0.70; total $3.70.
    const capped = categoryRule({
      id: 'rule-capped',
      categoryId: CATEGORY.grocery,
      rate: 6,
      capAmount: 6000,
      capPeriod: 'calendar_year',
      postCapRate: 1,
    });

    const result = evaluateWallet(
      intent(),
      [
        card({
          rules: [capped],
          capUsage: {
            'rule-capped': {
              periodStart: new Date('2026-01-01T00:00:00.000Z'),
              periodEnd: new Date('2027-01-01T00:00:00.000Z'),
              qualifyingSpendUsd: 5950,
              accruedRewardUsd: 357,
            },
          },
        }),
      ],
      context(),
    );

    const rows = breakdownRows(result.recommended!, 120);

    expect(valueOf(rows, 'Earning the bonus rate')).toBe('$50.00');
    expect(valueOf(rows, 'Above the cap')).toBe('$70.00');
    expect(valueOf(rows, 'Rate above the cap')).toBe('1%');
    expect(valueOf(rows, 'Estimated value')).toBe('$3.70');
  });

  it('shows units, valuation and value for a points card, and never just units', () => {
    // 3 points per dollar on $120 = 360 points, valued at 1.5¢ = $5.40.
    const pointsRule = rule({
      id: 'rule-points',
      label: '3× points on groceries',
      rewardUnit: 'points',
      rewardType: 'points_per_dollar',
      baseRate: 3,
      rewardProgramId: 'program-points',
      conditions: [
        { ...categoryRule({ categoryId: CATEGORY.grocery, rate: 3 }).conditions[0]! },
      ],
    });

    const result = evaluateWallet(
      intent(),
      [card({ rules: [pointsRule] })],
      context({ valuation: valuation({ byProgramId: { 'program-points': 1.5 } }) }),
    );

    const rows = breakdownRows(result.recommended!, 120);

    expect(valueOf(rows, 'Reward earned')).toBe('360 points');
    expect(valueOf(rows, 'Your valuation')).toBe('1.5¢ per point');
    expect(valueOf(rows, 'Reward value')).toBe('$5.40');
    expect(valueOf(rows, 'Estimated value')).toBe('$5.40');
    // A points figure with no dollar value beside it invites the user to guess.
    expect(labelsOf(rows)).not.toContain('Cash back');
  });

  it('subtracts a foreign transaction fee as a negative, in red', () => {
    // $120 abroad at 2% cash back earns $2.40; a 3% fee costs $3.60; net −$1.20.
    const result = evaluateWallet(
      intent({ currencyCode: 'EUR', countryCode: 'FR', categoryId: CATEGORY.grocery }),
      [
        card({
          foreignTransactionFeePercent: 3,
          supportedCountryCodes: ['US', 'FR'],
          rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 2 })],
        }),
      ],
      context(),
    );

    const rows = breakdownRows(result.recommended!, 120);
    const fee = rows.find((row) => row.label === 'Foreign transaction fee');

    expect(fee?.value).toBe('−$3.60');
    expect(fee?.tone).toBe('danger');
    // The engine floors the net at zero (`atLeastZero`): WalletWise reports what a
    // card *earns*, and a reward cannot be negative. The fee row above still shows
    // the full $3.60, so the user can see it swallowed the reward.
    expect(valueOf(rows, 'Estimated value')).toBe('$0.00');
  });

  it('names the rule that produced the figure', () => {
    const result = evaluateWallet(
      intent(),
      [
        card({
          rules: [
            rule({
              id: 'rule-named',
              label: '6% back at US supermarkets',
              baseRate: 6,
              conditions: [
                { ...categoryRule({ categoryId: CATEGORY.grocery, rate: 6 }).conditions[0]! },
              ],
            }),
          ],
        }),
      ],
      context(),
    );

    expect(valueOf(breakdownRows(result.recommended!, 120), 'Rule applied')).toBe(
      '6% back at US supermarkets',
    );
  });

  it('shows an offer as its own line rather than folding it into the rate', () => {
    // $120 at 1% = $1.20, plus a $10 flat offer = $11.20. Folding the offer into an
    // "effective rate" would misrepresent a one-off as an ongoing return.
    const result = evaluateWallet(
      intent(),
      [
        card({
          rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 1 })],
          offers: [
            {
              id: 'offer-flat',
              title: '$10 back at Greenleaf',
              merchantId: intent().merchantId,
              merchantLabel: 'Greenleaf Market',
              rewardType: 'statement_credit',
              rewardUnit: 'usd',
              rate: 0,
              fixedAmountUsd: 10,
              minimumSpendUsd: 50,
              maxBenefitUsd: null,
              channel: 'either',
              startsAt: null,
              endsAt: null,
              isEnrolled: true,
            },
          ],
        }),
      ],
      context(),
    );

    const rows = breakdownRows(result.recommended!, 120);

    expect(valueOf(rows, 'Cash back')).toBe('$1.20');
    expect(valueOf(rows, 'Estimated value')).toBe('$11.20');
    // The offer is reported on its own line — either as an offer or as a credit,
    // depending on how the engine classified it — never silently absorbed.
    const offerLabels = labelsOf(rows).filter(
      (label) => label === 'Merchant offer' || label === 'Statement credit',
    );
    expect(offerLabels.length).toBeGreaterThan(0);
  });

  it('renders a zero-dollar purchase without inventing a reward', () => {
    const result = evaluateWallet(
      intent({ amountUsd: 0 }),
      [card({ rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })] })],
      context(),
    );

    if (result.recommended === null) {
      // A zero-value reward is legitimately ineligible; either way, no figure is
      // invented, which is the property under test.
      expect(result.eligible).toHaveLength(0);
      return;
    }

    const rows = breakdownRows(result.recommended, 0);
    expect(valueOf(rows, 'Purchase amount')).toBe('$0.00');
    expect(valueOf(rows, 'Estimated value')).toBe('$0.00');
  });

  it('is pure with respect to the instant, given the same snapshot', () => {
    const wallet = [card({ rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })] })];

    const first = breakdownRows(
      evaluateWallet(intent(), wallet, context({ asOf: AS_OF })).recommended!,
      120,
    );
    const second = breakdownRows(
      evaluateWallet(intent(), wallet, context({ asOf: AS_OF })).recommended!,
      120,
    );

    expect(first).toEqual(second);
  });
});
