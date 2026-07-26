import { assessConfidence, confidenceForVerification, weaker, weakest } from './confidence';
import { intent } from './__fixtures__/wallet';
import type { ConfidenceInputs } from './confidence';

const inputs = (overrides: Partial<ConfidenceInputs> = {}): ConfidenceInputs => ({
  intent: intent(),
  verificationStatus: 'verified',
  isCapPartiallyAvailable: false,
  isCapNearlyReached: false,
  requiresEnrollmentNotConfirmed: false,
  hasForeignTransactionFee: false,
  usesEstimatedValuation: false,
  offerRequiresActivation: false,
  ...overrides,
});

describe('weaker and weakest', () => {
  it('picks the lower of two levels', () => {
    expect(weaker('high', 'low')).toBe('low');
    expect(weaker('medium', 'high')).toBe('medium');
    expect(weaker('low', 'low')).toBe('low');
  });

  it('picks the weakest of many, defaulting to high for none', () => {
    expect(weakest(['high', 'medium', 'low'])).toBe('low');
    expect(weakest(['high', 'medium'])).toBe('medium');
    expect(weakest([])).toBe('high');
  });
});

describe('confidenceForVerification', () => {
  it.each([
    ['verified', 'high'],
    ['user_reported', 'medium'],
    ['stale', 'medium'],
    ['unverified', 'medium'],
    ['disputed', 'low'],
    ['retired', 'low'],
  ] as const)('caps a %s rate at %s', (status, expected) => {
    expect(confidenceForVerification(status)).toBe(expected);
  });

  it('treats an absent status as low', () => {
    expect(confidenceForVerification(null)).toBe('low');
  });
});

describe('assessConfidence', () => {
  it('reaches high only when nothing is in doubt', () => {
    const result = assessConfidence(inputs());
    expect(result.confidence).toBe('high');
    expect(result.warnings).toEqual([]);
  });

  it('drops to low for ambiguous merchant coding', () => {
    const result = assessConfidence(inputs({ intent: intent({ hasAmbiguousCoding: true }) }));
    expect(result.confidence).toBe('low');
    expect(result.warnings).toContain('merchant_coding_uncertain');
  });

  it('drops to low for a missing category', () => {
    const result = assessConfidence(
      inputs({
        intent: intent({
          categoryId: null,
          categoryMatchKind: 'unknown',
          categoryConfidence: 'low',
        }),
      }),
    );
    expect(result.confidence).toBe('low');
    expect(result.warnings).toContain('category_missing');
  });

  it('caps at medium for an inferred category', () => {
    const result = assessConfidence(
      inputs({ intent: intent({ categoryMatchKind: 'inferred' }) }),
    );
    expect(result.confidence).toBe('medium');
    expect(result.warnings).toContain('category_inferred');
  });

  it('respects the classifier’s own confidence as a ceiling', () => {
    const result = assessConfidence(
      inputs({ intent: intent({ categoryConfidence: 'medium' }) }),
    );
    expect(result.confidence).toBe('medium');
  });

  it.each([
    ['stale', 'source_stale'],
    ['unverified', 'source_unverified'],
    ['user_reported', 'source_unverified'],
  ] as const)('caps at medium and warns for a %s source', (status, warning) => {
    const result = assessConfidence(inputs({ verificationStatus: status }));
    expect(result.confidence).toBe('medium');
    expect(result.warnings).toContain(warning);
  });

  it('caps at medium for a partially available cap', () => {
    const result = assessConfidence(inputs({ isCapPartiallyAvailable: true }));
    expect(result.confidence).toBe('medium');
    expect(result.warnings).toContain('cap_partially_available');
  });

  it('warns about a nearly-reached cap without lowering confidence', () => {
    const result = assessConfidence(inputs({ isCapNearlyReached: true }));
    expect(result.confidence).toBe('high');
    expect(result.warnings).toContain('cap_nearly_reached');
  });

  it('caps at medium when a rule still needs activating', () => {
    const result = assessConfidence(inputs({ requiresEnrollmentNotConfirmed: true }));
    expect(result.confidence).toBe('medium');
    expect(result.warnings).toContain('enrollment_required');
  });

  it('warns about a fee without lowering confidence — the arithmetic is exact', () => {
    const result = assessConfidence(inputs({ hasForeignTransactionFee: true }));
    expect(result.confidence).toBe('high');
    expect(result.warnings).toContain('foreign_transaction_fee_applied');
  });

  it('warns about an estimated valuation without lowering confidence', () => {
    // The maths is exact; the *input* is the user's guess.
    const result = assessConfidence(inputs({ usesEstimatedValuation: true }));
    expect(result.confidence).toBe('high');
    expect(result.warnings).toContain('estimated_point_valuation');
  });

  it('warns when an offer needs activating', () => {
    const result = assessConfidence(inputs({ offerRequiresActivation: true }));
    expect(result.warnings).toContain('offer_requires_activation');
  });

  it('is weakest-link: the worst single factor governs', () => {
    const result = assessConfidence(
      inputs({
        intent: intent({ hasAmbiguousCoding: true, categoryMatchKind: 'inferred' }),
        verificationStatus: 'stale',
        isCapPartiallyAvailable: true,
      }),
    );
    expect(result.confidence).toBe('low');
  });

  it('never raises confidence, whatever the order of factors', () => {
    // A verified source cannot rescue an ambiguous merchant.
    const result = assessConfidence(
      inputs({ intent: intent({ hasAmbiguousCoding: true }), verificationStatus: 'verified' }),
    );
    expect(result.confidence).toBe('low');
  });

  it('explains every downgrade with a warning', () => {
    for (const scenario of [
      inputs({ intent: intent({ hasAmbiguousCoding: true }) }),
      inputs({ intent: intent({ categoryMatchKind: 'inferred' }) }),
      inputs({ verificationStatus: 'stale' }),
      inputs({ verificationStatus: 'unverified' }),
      inputs({ isCapPartiallyAvailable: true }),
      inputs({ requiresEnrollmentNotConfirmed: true }),
    ]) {
      const result = assessConfidence(scenario);
      // A downgrade with no stated reason is worse than no badge at all.
      expect(result.confidence).not.toBe('high');
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });

  it('does not repeat a warning', () => {
    const result = assessConfidence(
      inputs({ verificationStatus: 'user_reported', requiresEnrollmentNotConfirmed: true }),
    );
    expect(new Set(result.warnings).size).toBe(result.warnings.length);
  });
});
