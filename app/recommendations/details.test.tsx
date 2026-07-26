/**
 * The details screen — the audit trail.
 *
 * The point of this screen is that a sceptical user can reproduce the figure on
 * paper, so the tests check the arithmetic is all present and attributed: the rate,
 * the rule that produced it, what that rule required, how the category was decided,
 * and how far the source can be trusted.
 */
import { screen } from '@testing-library/react-native';

import { evaluateWallet, type RecommendationResult } from '@/domain/rewards';
import {
  CATEGORY,
  card,
  categoryRule,
  context,
  intent,
  rule,
} from '@/domain/rewards/__fixtures__/wallet';
import type { Classification } from '@/domain/classifier/types';
import type { RecommendationOutcome } from '@/features/recommendations/hooks';
import { renderScreen } from '@/test-support/renderScreen';

import RecommendationDetailsScreen from './[id]';

// `mock`-prefixed so Jest permits the hoisted factory to close over it.
let mockLatest: RecommendationOutcome | null = null;
let mockParams: { id?: string } = { id: 'recommendation-1' };

jest.mock('@/features/recommendations/RecommendationProvider', () => ({
  useLatestRecommendation: () => ({
    latest: mockLatest,
    setLatest: jest.fn(),
    clear: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

function classification(overrides: Partial<Classification> = {}): Classification {
  return {
    merchantId: intent().merchantId,
    resolvedMerchantName: 'DEMO — Greenleaf Market',
    categoryId: CATEGORY.grocery,
    mcc: 5411,
    matchKind: 'exact_merchant',
    confidence: 'high',
    hasAmbiguousCoding: false,
    alternativeCategoryIds: [],
    disagreesWithUserSelection: false,
    ...overrides,
  };
}

/**
 * A card with two active rules, so "also considered on this card" has something to
 * say: the 6% supermarket bonus and the 1% base rate.
 */
function groceryResult(): RecommendationResult {
  return evaluateWallet(
    intent(),
    [
      card({
        userCardId: 'six',
        displayName: 'Northwind Grocery Card',
        issuerName: 'Northwind Bank',
        rules: [
          rule({
            id: 'rule-base',
            label: '1% cash back on everything else',
            kind: 'base',
            baseRate: 1,
            priority: 10,
          }),
          categoryRule({
            id: 'rule-bonus',
            categoryId: CATEGORY.grocery,
            rate: 6,
            capAmount: 6000,
            capPeriod: 'calendar_year',
          }),
        ],
      }),
    ],
    context(),
  );
}

function seed(overrides: Partial<RecommendationOutcome> = {}) {
  mockLatest = {
    recommendationId: 'recommendation-1',
    purchaseQueryId: 'query-1',
    result: groceryResult(),
    classification: classification(),
    ...overrides,
  };
}

beforeEach(() => {
  mockParams = { id: 'recommendation-1' };
});

afterEach(() => {
  mockLatest = null;
});

describe('the details screen for the current recommendation', () => {
  beforeEach(seed);

  it('shows the purchase it is explaining', () => {
    renderScreen(<RecommendationDetailsScreen />);

    expect(screen.getByText(/\$120\.00 at Greenleaf Market/)).toBeTruthy();
  });

  it('lays out the arithmetic, ending in the total', () => {
    renderScreen(<RecommendationDetailsScreen />);

    // $120.00 × 6% = $7.20.
    expect(screen.getByText('Purchase amount')).toBeTruthy();
    expect(screen.getByText('$120.00')).toBeTruthy();
    expect(screen.getByText('Reward rate')).toBeTruthy();
    expect(screen.getByText('Estimated value')).toBeTruthy();
    expect(screen.getAllByText('$7.20').length).toBeGreaterThan(0);
  });

  it('names the rule that produced the figure and what it required', () => {
    renderScreen(<RecommendationDetailsScreen />);

    expect(screen.getByText('Why this rule applied')).toBeTruthy();
    expect(screen.getByText(/Category is Grocery/)).toBeTruthy();
    expect(screen.getByText(/\$6,000 of spend per calendar year is the cap/)).toBeTruthy();
  });

  it('lists the other rule on the same card as also considered', () => {
    renderScreen(<RecommendationDetailsScreen />);

    expect(screen.getByText('Also considered on this card')).toBeTruthy();
    expect(screen.getByText('1% cash back on everything else')).toBeTruthy();
  });

  it('explains how the category was decided', () => {
    renderScreen(<RecommendationDetailsScreen />);

    expect(screen.getByText('How the category was decided')).toBeTruthy();
    expect(screen.getByText('Matched a known merchant')).toBeTruthy();
    expect(screen.getByText(/is in our catalog, coded as Grocery/)).toBeTruthy();
    expect(screen.getByText(/Merchant category code used: 5411/)).toBeTruthy();
  });

  it('reports the source status and the verification date', () => {
    renderScreen(<RecommendationDetailsScreen />);

    expect(screen.getByText('Source status: Verified against a source.')).toBeTruthy();
    expect(screen.getByText(/Verified July 1, 2026/)).toBeTruthy();
  });

  it('states that nothing on the screen came from a model', () => {
    // The claim the whole architecture exists to support, so it is asserted rather
    // than left to a reviewer's memory.
    renderScreen(<RecommendationDetailsScreen />);

    expect(
      screen.getAllByText(/Nothing (here|on this screen) is generated by a model/).length,
    ).toBeGreaterThan(0);
  });

  it('lists the engine’s steps in order', () => {
    renderScreen(<RecommendationDetailsScreen />);

    expect(screen.getByText('The steps, in order')).toBeTruthy();
    expect(screen.getByText(/1\. Collect every active reward rule/)).toBeTruthy();
  });

  it('carries the financial and merchant-category disclaimers', () => {
    renderScreen(<RecommendationDetailsScreen />);

    expect(screen.getByText(/estimates, not financial advice/i)).toBeTruthy();
    expect(screen.getAllByText(/issuer/i).length).toBeGreaterThan(0);
  });
});

describe('the details screen without the matching calculation', () => {
  it('refuses to render a breakdown for a different recommendation id', () => {
    // The workings are held in memory for one recommendation. Rendering these
    // numbers under someone else's id would be an audit trail that lies.
    seed();
    mockParams = { id: 'a-different-recommendation' };

    renderScreen(<RecommendationDetailsScreen />);

    expect(screen.getByTestId('details-empty')).toBeTruthy();
    expect(screen.queryByTestId('details-breakdown')).toBeNull();
  });

  it('says the calculation is gone after a restart, and offers a way forward', () => {
    mockLatest = null;

    renderScreen(<RecommendationDetailsScreen />);

    expect(screen.getByText('This calculation is no longer in memory')).toBeTruthy();
    expect(screen.getByText('Start a purchase')).toBeTruthy();
  });

  it('shows no dollar figure when there is nothing to explain', () => {
    mockLatest = null;

    const { toJSON } = renderScreen(<RecommendationDetailsScreen />);

    expect(JSON.stringify(toJSON())).not.toMatch(/\$\d/);
  });

  it('renders the empty state when no card qualified', () => {
    // There is no winning calculation to walk through, and inventing one for the
    // best of a bad set would misrepresent the answer.
    seed({
      result: evaluateWallet(
        intent(),
        [
          card({
            userCardId: 'dining',
            rules: [categoryRule({ id: 'dining-bonus', categoryId: CATEGORY.dining, rate: 4 })],
          }),
        ],
        context(),
      ),
    });

    renderScreen(<RecommendationDetailsScreen />);

    expect(screen.getByTestId('details-empty')).toBeTruthy();
  });
});
