/**
 * The results row.
 *
 * Two properties are asserted here, and both are accessibility requirements rather
 * than cosmetics:
 *
 *   1. **Colour is never the only signal.** Green, amber and red each carry a text
 *      label, so the meaning survives greyscale, colour-blindness and a screenshot.
 *   2. **The row reads as one thought.** A screen reader should say "Best value.
 *      Northwind…. Earns about $7.20." rather than emitting a dozen fragments the
 *      user has to reassemble.
 */
import { render, screen } from '@testing-library/react-native';

import { evaluateWallet, type RecommendationCandidate } from '@/domain/rewards';
import {
  CATEGORY,
  card,
  categoryRule,
  context,
  flatCard,
  intent,
  rule,
  valuation,
} from '@/domain/rewards/__fixtures__/wallet';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { CandidateCard } from './CandidateCard';

const renderInTheme = (ui: React.ReactElement) =>
  render(<ThemeProvider initialPreference="light">{ui}</ThemeProvider>);

/** Runs the real engine, so the component is never fed a hand-written figure. */
function evaluate(
  cards: Parameters<typeof evaluateWallet>[1],
  overrides: Partial<Parameters<typeof evaluateWallet>[0]> = {},
  contextOverrides: Partial<Parameters<typeof evaluateWallet>[2]> = {},
) {
  return evaluateWallet(intent(overrides), cards, context(contextOverrides));
}

function groceryWinner(): RecommendationCandidate {
  const result = evaluate([
    card({
      userCardId: 'grocery',
      displayName: 'Northwind Grocery Card',
      issuerName: 'Northwind Bank',
      rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })],
    }),
  ]);

  if (result.recommended === null) throw new Error('fixture should produce a winner');
  return result.recommended;
}

describe('CandidateCard', () => {
  it('shows the card, the issuer and the value', () => {
    renderInTheme(<CandidateCard candidate={groceryWinner()} isRecommended />);

    expect(screen.getByText('Northwind Grocery Card')).toBeTruthy();
    expect(screen.getByText('Northwind Bank')).toBeTruthy();
    // $120 × 6% = $7.20. The figure is deliberately hidden from assistive
    // technology — the row's composed label already speaks it — so the query has to
    // ask for hidden elements to see what a sighted user sees.
    expect(screen.getByText('$7.20', { includeHiddenElements: true })).toBeTruthy();
  });

  it('labels the winner in text as well as in green', () => {
    renderInTheme(<CandidateCard candidate={groceryWinner()} isRecommended />);

    expect(screen.getByText('Best value')).toBeTruthy();
  });

  it('does not claim "best value" for a card that is not the winner', () => {
    renderInTheme(<CandidateCard candidate={groceryWinner()} isRecommended={false} />);

    expect(screen.queryByText('Best value')).toBeNull();
  });

  it('reads as one accessible element naming the card and the amount', () => {
    renderInTheme(
      <CandidateCard candidate={groceryWinner()} isRecommended testID="candidate" />,
    );

    const label = screen.getByTestId('candidate').props.accessibilityLabel as string;

    expect(label).toContain('Best value.');
    expect(label).toContain('Northwind Grocery Card');
    expect(label).toContain('Northwind Bank');
    expect(label).toContain('$7.20');
    expect(label).toContain('High confidence');
  });

  it('labels an ineligible card in text and gives the reason', () => {
    const result = evaluate([
      card({
        userCardId: 'dining-only',
        displayName: 'Dining Only Card',
        rules: [categoryRule({ id: 'dining', categoryId: CATEGORY.dining, rate: 4 })],
      }),
    ]);

    const rejected = result.ineligible[0];
    expect(rejected).toBeDefined();

    renderInTheme(
      <CandidateCard candidate={rejected!} isRecommended={false} testID="rejected" />,
    );

    expect(screen.getByText('Not eligible')).toBeTruthy();
    // Red alone would tell a colour-blind user nothing; the reason is spelled out.
    expect(screen.getByText(rejected!.reason)).toBeTruthy();
  });

  it('does not show a reward figure for an ineligible card', () => {
    // A dollar amount beside "Not eligible" would read as money the user could earn.
    const result = evaluate([
      card({
        userCardId: 'dining-only',
        rules: [categoryRule({ id: 'dining', categoryId: CATEGORY.dining, rate: 4 })],
      }),
    ]);

    renderInTheme(<CandidateCard candidate={result.ineligible[0]!} isRecommended={false} />);

    expect(screen.queryByText('$0.00')).toBeNull();
  });

  it('names the foreign transaction fee in words, not just in red', () => {
    // $120 at 2% earns $2.40; a 3% fee costs $3.60.
    const result = evaluate(
      [
        card({
          userCardId: 'abroad',
          foreignTransactionFeePercent: 3,
          supportedCountryCodes: ['US', 'FR'],
          rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 2 })],
        }),
      ],
      { currencyCode: 'EUR', countryCode: 'FR' },
    );

    renderInTheme(<CandidateCard candidate={result.recommended!} isRecommended />);

    expect(screen.getByText('Less $3.60 foreign transaction fee')).toBeTruthy();
  });

  it('spells out an amber warning rather than relying on the colour', () => {
    const result = evaluate(
      [
        card({
          userCardId: 'grocery',
          rules: [categoryRule({ categoryId: CATEGORY.grocery, rate: 6 })],
        }),
      ],
      { hasAmbiguousCoding: true, categoryConfidence: 'low' },
    );

    renderInTheme(<CandidateCard candidate={result.recommended!} isRecommended />);

    expect(screen.getByText('Coding uncertain')).toBeTruthy();
  });

  it('marks the user’s preferred card', () => {
    const result = evaluate([
      flatCard(2, { userCardId: 'pref', displayName: 'Preferred Card', isPreferred: true }),
    ]);

    renderInTheme(<CandidateCard candidate={result.recommended!} isRecommended />);

    expect(screen.getByText('Preferred')).toBeTruthy();
  });

  it('shows points in their own units beside the dollar value', () => {
    // 3 points per dollar on $120 = 360 points, at 1.5¢ = $5.40. Showing the units
    // without the value would leave the user to guess what the points are worth.
    const pointsRule = rule({
      id: 'points',
      label: '3× points on groceries',
      rewardUnit: 'points',
      rewardType: 'points_per_dollar',
      baseRate: 3,
      rewardProgramId: 'program-points',
      conditions: [
        { ...categoryRule({ categoryId: CATEGORY.grocery, rate: 3 }).conditions[0]! },
      ],
    });

    const result = evaluate(
      [card({ userCardId: 'points-card', rules: [pointsRule] })],
      {},
      { valuation: valuation({ byProgramId: { 'program-points': 1.5 } }) },
    );

    renderInTheme(<CandidateCard candidate={result.recommended!} isRecommended />);

    expect(screen.getByText('$5.40', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByText(/360 points/)).toBeTruthy();
  });

  it('states when the rate was last verified', () => {
    renderInTheme(<CandidateCard candidate={groceryWinner()} isRecommended />);

    expect(screen.getByText(/verified/i)).toBeTruthy();
  });

  it('shows the remaining cap when the bonus is capped', () => {
    const result = evaluate([
      card({
        userCardId: 'capped',
        rules: [
          categoryRule({
            id: 'capped-rule',
            categoryId: CATEGORY.grocery,
            rate: 6,
            capAmount: 6000,
            capPeriod: 'calendar_year',
          }),
        ],
        capUsage: {
          'capped-rule': {
            periodStart: new Date('2026-01-01T00:00:00.000Z'),
            periodEnd: new Date('2027-01-01T00:00:00.000Z'),
            qualifyingSpendUsd: 1000,
            accruedRewardUsd: 60,
          },
        },
      }),
    ]);

    renderInTheme(<CandidateCard candidate={result.recommended!} isRecommended />);

    // $6,000 cap less $1,000 spent leaves $5,000.
    expect(screen.getByText('$5,000.00 of cap left')).toBeTruthy();
  });
});
