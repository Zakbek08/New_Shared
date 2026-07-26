/**
 * The results screen — Phase 4's screen-reader pass.
 *
 * What is asserted:
 *   * the winner, the runner-up and every rejected card are all on the screen,
 *     each with a reason;
 *   * every figure shown is one the engine produced;
 *   * nothing on the screen is a fabricated number, including in the empty state;
 *   * the amber merchant-coding warning appears exactly when the classifier said
 *     the coding was uncertain.
 */
import { screen } from '@testing-library/react-native';

import { evaluateWallet, type RecommendationResult } from '@/domain/rewards';
import {
  CATEGORY,
  card,
  categoryRule,
  context,
  intent,
} from '@/domain/rewards/__fixtures__/wallet';
import type { Classification } from '@/domain/classifier/types';
import type { RecommendationOutcome } from '@/features/recommendations/hooks';
import { renderScreen } from '@/test-support/renderScreen';

import RecommendationResultsScreen from './results';

/**
 * The provider is mocked rather than driven, so a test can state the outcome it
 * cares about in one place. `RecommendationProvider` itself is exercised through
 * the screens that write to it.
 */
// The `mock` prefix is required: Jest hoists the factory above this declaration
// and only permits out-of-scope names that begin with it.
let mockLatest: RecommendationOutcome | null = null;

jest.mock('@/features/recommendations/RecommendationProvider', () => ({
  useLatestRecommendation: () => ({
    latest: mockLatest,
    setLatest: jest.fn(),
    clear: jest.fn(),
  }),
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

/** The specification's wallet: a 6% grocery card, a 5% card, and a dining-only card. */
function specificationResult(
  intentOverrides: Partial<Parameters<typeof evaluateWallet>[0]> = {},
): RecommendationResult {
  return evaluateWallet(
    intent(intentOverrides),
    [
      card({
        userCardId: 'six',
        displayName: 'Northwind Grocery Card',
        issuerName: 'Northwind Bank',
        rules: [categoryRule({ id: 'six-bonus', categoryId: CATEGORY.grocery, rate: 6 })],
      }),
      card({
        userCardId: 'five',
        displayName: 'Harborline Rotator Card',
        issuerName: 'Harborline Financial',
        rules: [categoryRule({ id: 'five-bonus', categoryId: CATEGORY.grocery, rate: 5 })],
      }),
      card({
        userCardId: 'dining',
        displayName: 'Cobalt Table Card',
        issuerName: 'Cobalt Bank',
        rules: [categoryRule({ id: 'dining-bonus', categoryId: CATEGORY.dining, rate: 4 })],
      }),
    ],
    context(),
  );
}

function seed(overrides: Partial<RecommendationOutcome> = {}) {
  mockLatest = {
    recommendationId: 'recommendation-1',
    purchaseQueryId: 'query-1',
    result: specificationResult(),
    classification: classification(),
    ...overrides,
  };
}

afterEach(() => {
  mockLatest = null;
});

describe('the results screen with a live recommendation', () => {
  beforeEach(seed);

  it('names the winner and shows its value', () => {
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByText('Northwind Grocery Card')).toBeTruthy();
    // $120 × 6% = $7.20.
    expect(screen.getByText('$7.20', { includeHiddenElements: true })).toBeTruthy();
  });

  it('summarises what was compared', () => {
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByText(/\$120\.00 at Greenleaf Market/)).toBeTruthy();
  });

  it('shows the runner-up and how much less it earns', () => {
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByText('Second best')).toBeTruthy();
    expect(screen.getByText('Harborline Rotator Card')).toBeTruthy();
    // $7.20 − $6.00 = $1.20.
    expect(screen.getByText('$1.20 less than the card above.')).toBeTruthy();
    expect(screen.getByText('$6.00', { includeHiddenElements: true })).toBeTruthy();
  });

  it('shows the card that did not qualify, with its reason', () => {
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByText('Cards that do not qualify')).toBeTruthy();
    expect(screen.getByText('Cobalt Table Card')).toBeTruthy();
    expect(screen.getByText('Not eligible')).toBeTruthy();
  });

  it('shows the engine’s explanation verbatim', () => {
    const result = specificationResult();
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByText(result.explanation)).toBeTruthy();
  });

  it('offers the audit trail and the record-it action', () => {
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByTestId('results-details')).toBeTruthy();
    expect(screen.getByTestId('results-accept')).toBeTruthy();
  });

  it('carries the financial-information disclaimer', () => {
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByText(/estimates, not financial advice/i)).toBeTruthy();
  });

  it('gives the screen an accessible name', () => {
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByTestId('results-screen').props.accessibilityLabel).toBe(
      'Recommendation results',
    );
  });

  it('does not show the coding warning when the merchant is known', () => {
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.queryByText(/coding is uncertain/i)).toBeNull();
  });
});

describe('the results screen when the coding is uncertain', () => {
  beforeEach(() => {
    seed({
      result: specificationResult({ hasAmbiguousCoding: true, categoryConfidence: 'low' }),
      classification: classification({
        hasAmbiguousCoding: true,
        confidence: 'low',
        resolvedMerchantName: 'DEMO — BulkBarn Warehouse',
      }),
    });
  });

  it('shows the amber merchant-coding warning, naming the merchant', () => {
    renderScreen(<RecommendationResultsScreen />);

    // The name also appears in the "Matched …" badge; what matters here is the
    // warning sentence, which says the coding itself is in doubt.
    expect(
      screen.getByText(/We are not certain how DEMO — BulkBarn Warehouse is coded/),
    ).toBeTruthy();
    expect(screen.getAllByText('Coding uncertain').length).toBeGreaterThan(0);
  });
});

describe('the results screen when the classifier disagrees with the user', () => {
  beforeEach(() => {
    seed({
      classification: classification({
        disagreesWithUserSelection: true,
        hasAmbiguousCoding: true,
      }),
      result: specificationResult({ hasAmbiguousCoding: true }),
    });
  });

  it('explains that the issuer’s coding was used, not the user’s choice', () => {
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByText('Different from your choice')).toBeTruthy();
    expect(screen.getByText(/Your issuer decides the category/)).toBeTruthy();
  });
});

describe('the results screen with nothing to show', () => {
  it('says so honestly and offers a way forward', () => {
    // Reached by a deep link or after a restart. The engine's input snapshot is not
    // persisted, so there is no figure that could legitimately be rendered here —
    // and a plausible fake one would be worse than an empty state.
    mockLatest = null;
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByTestId('results-empty')).toBeTruthy();
    expect(screen.getByText('No recommendation to show')).toBeTruthy();
    expect(screen.getByText('Start a purchase')).toBeTruthy();
  });

  it('shows no dollar figure at all in the empty state', () => {
    mockLatest = null;
    const { toJSON } = renderScreen(<RecommendationResultsScreen />);

    expect(JSON.stringify(toJSON())).not.toMatch(/\$\d/);
  });
});

describe('the results screen when nothing in the wallet qualifies', () => {
  beforeEach(() => {
    seed({
      result: evaluateWallet(
        intent(),
        [
          card({
            userCardId: 'dining',
            displayName: 'Cobalt Table Card',
            rules: [categoryRule({ id: 'dining-bonus', categoryId: CATEGORY.dining, rate: 4 })],
          }),
        ],
        context(),
      ),
    });
  });

  it('says nothing earns a reward, and still lists the reason', () => {
    renderScreen(<RecommendationResultsScreen />);

    expect(screen.getByText(/None of the cards in your wallet earns a reward/)).toBeTruthy();
    expect(screen.getByText('Cards that do not qualify')).toBeTruthy();
    expect(screen.queryByTestId('results-recommended')).toBeNull();
    // No winner means no "I used this card" — there is no card to have used.
    expect(screen.queryByTestId('results-accept')).toBeNull();
  });
});
