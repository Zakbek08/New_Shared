/**
 * The verification panel.
 *
 * Three assertions carry the weight:
 *
 *   * a source is required before a rule can be marked verified;
 *   * "out of date" is not offered as a choice, because it is derived from the date;
 *   * the panel says the history is append-only, so a mistaken verification stays
 *     visible next to its correction.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { ruleFreshness } from '@/domain/catalog/staleness';
import type { CatalogRule, VerificationHistoryEntry } from '@/features/admin/api/catalog';
import { renderScreen } from '@/test-support/renderScreen';
import type { SourceRow } from '@/types/database';

import { VerificationPanel } from './VerificationPanel';

const AS_OF = new Date('2026-07-26T14:30:00.000Z');
const RULE_ID = '66666666-0000-4000-8000-000000000102';
const SOURCE_ID = '88888888-0000-4000-8000-000000000001';

const source: SourceRow = {
  id: SOURCE_ID,
  label: 'Issuer terms',
  url: 'https://example.test/terms',
  publisher: 'DEMO — Northwind',
  document_type: 'issuer_terms',
  published_on: '2026-06-01',
  retrieved_on: '2026-07-01',
  notes: null,
  is_fictional: true,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
};

function rule(overrides: Partial<CatalogRule> = {}): CatalogRule {
  const lastVerifiedAt =
    'lastVerifiedAt' in overrides ? overrides.lastVerifiedAt! : '2026-07-01T00:00:00.000Z';

  return {
    id: RULE_ID,
    cardProductId: 'product-1',
    productName: 'DEMO — Northwind Grocery Card',
    issuerName: 'DEMO — Northwind',
    label: '6% cash back at US supermarkets',
    kind: 'category_bonus',
    rewardType: 'cash_back_percent',
    rewardUnit: 'usd',
    baseRate: 6,
    bonusRate: 0,
    fixedAmountUsd: null,
    priority: 100,
    stackGroup: 'category',
    isStackable: false,
    capAmount: 6000,
    capAppliesTo: 'spend',
    capPeriod: 'calendar_year',
    postCapRate: 1,
    startsAt: null,
    endsAt: null,
    requiresEnrollment: false,
    enrollmentUrl: null,
    spendThresholdUsd: null,
    sourceId: null,
    sourceLabel: null,
    sourceUrl: null,
    isFictionalSource: false,
    lastVerifiedAt,
    verificationStatus: 'unverified',
    isActive: true,
    notes: null,
    conditions: [],
    freshness: ruleFreshness(
      {
        lastVerifiedAt: lastVerifiedAt === null ? null : new Date(lastVerifiedAt),
        verificationStatus: overrides.verificationStatus ?? 'unverified',
      },
      AS_OF,
    ),
    ...overrides,
  };
}

const historyEntry: VerificationHistoryEntry = {
  id: 'history-1',
  rewardRuleId: RULE_ID,
  previousStatus: 'unverified',
  newStatus: 'verified',
  verifiedBaseRate: 6,
  verifiedBonusRate: null,
  verifiedAt: '2026-07-01T00:00:00.000Z',
  sourceLabel: 'Issuer terms',
  note: 'Checked the terms PDF',
};

function renderPanel(
  options: {
    readonly rule?: CatalogRule;
    readonly sources?: readonly SourceRow[];
    readonly history?: readonly VerificationHistoryEntry[];
    readonly onSubmit?: jest.Mock;
  } = {},
) {
  const onSubmit = options.onSubmit ?? jest.fn();

  renderScreen(
    <VerificationPanel
      rule={options.rule ?? rule()}
      sources={options.sources ?? [source]}
      history={options.history ?? []}
      onSubmit={onSubmit}
      testID="verification"
    />,
  );

  return onSubmit;
}

describe('what the panel states', () => {
  it('says how long a verification lasts', () => {
    renderPanel();

    expect(screen.getByText(/A verification lasts\s+90 days/)).toBeTruthy();
  });

  it('says the history cannot be edited or deleted', () => {
    renderPanel();

    expect(screen.getByText(/append-only/)).toBeTruthy();
    expect(screen.getByText(/stays visible next to its\s+correction/)).toBeTruthy();
  });

  it('does not offer "out of date" as an outcome', () => {
    // It is derived from the verification date. Offering it would let an editor set a
    // status the clock would immediately disagree with.
    renderPanel();

    expect(screen.queryByTestId('verification-status-stale')).toBeNull();
    expect(
      screen.getByText(/worked out from the\s+verification date rather than chosen/),
    ).toBeTruthy();
  });

  it('shows the current status and the last verification date', () => {
    renderPanel({ rule: rule({ verificationStatus: 'verified' }) });

    expect(screen.getByText('Now: Verified against a source')).toBeTruthy();
    expect(screen.getByText('Last verified July 1, 2026')).toBeTruthy();
  });

  it('flags a rule whose stored status the clock disagrees with', () => {
    renderPanel({
      rule: rule({
        verificationStatus: 'verified',
        lastVerifiedAt: '2025-01-01T00:00:00.000Z',
      }),
    });

    expect(screen.getByText('Treated as out of date')).toBeTruthy();
  });

  it('says plainly when a rule has never been verified', () => {
    renderPanel({ rule: rule({ lastVerifiedAt: null }) });

    expect(screen.getByText('Last verified never')).toBeTruthy();
  });
});

describe('recording a verification', () => {
  it('requires a source before verified can be recorded', () => {
    const onSubmit = renderPanel();

    // No source chosen yet: the button is disabled and says why.
    expect(screen.getByTestId('verification-submit').props.accessibilityState?.disabled).toBe(
      true,
    );
    expect(screen.getByTestId('verification-submit').props.accessibilityHint as string).toMatch(
      /Choose a source document first/,
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits once a source is chosen', () => {
    const onSubmit = renderPanel();

    fireEvent.press(screen.getByTestId(`verification-source-${SOURCE_ID}`));
    fireEvent.press(screen.getByTestId('verification-submit'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        rewardRuleId: RULE_ID,
        sourceId: SOURCE_ID,
        newStatus: 'verified',
        verifiedBaseRate: 6,
      }),
    );
  });

  it('allows a dispute with no source, since there is nothing to cite', () => {
    const onSubmit = renderPanel();

    fireEvent.press(screen.getByTestId('verification-status-disputed'));
    fireEvent.press(screen.getByTestId('verification-submit'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: 'disputed', sourceId: null }),
    );
  });

  it('records the rate that was read on the source', () => {
    const onSubmit = renderPanel();

    fireEvent.press(screen.getByTestId(`verification-source-${SOURCE_ID}`));
    fireEvent.changeText(screen.getByTestId('verification-base-rate'), '5');
    fireEvent.press(screen.getByTestId('verification-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ verifiedBaseRate: 5 }));
  });

  it('carries the note through', () => {
    const onSubmit = renderPanel();

    fireEvent.press(screen.getByTestId(`verification-source-${SOURCE_ID}`));
    fireEvent.changeText(screen.getByTestId('verification-note'), 'Terms page 4');
    fireEvent.press(screen.getByTestId('verification-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ note: 'Terms page 4' }));
  });

  it('badges a demonstration source as such', () => {
    // A rate traced to fictional demo data must never look like a verified real rate.
    renderPanel();

    expect(screen.getByText('Issuer terms (demo)')).toBeTruthy();
  });

  it('says what to do when there are no sources at all', () => {
    renderPanel({ sources: [] });

    expect(screen.getByText(/Add one before marking a rule verified/)).toBeTruthy();
  });
});

describe('the history', () => {
  it('says nothing is recorded yet when the list is empty', () => {
    renderPanel();

    expect(screen.getByText('Nothing recorded yet for this rule.')).toBeTruthy();
  });

  it('reads an entry as a transition, with its source and note', () => {
    renderPanel({ history: [historyEntry] });

    const label = screen.getByTestId('verification-history-history-1').props
      .accessibilityLabel as string;

    expect(label).toContain('July 1, 2026.');
    expect(label).toContain('Changed from Not yet verified to Verified against a source.');
    expect(label).toContain('Source: Issuer terms.');
    expect(label).toContain('Rate read: 6.');
    expect(label).toContain('Checked the terms PDF');
  });

  it('reads a first entry as a set rather than a change', () => {
    renderPanel({ history: [{ ...historyEntry, previousStatus: null }] });

    expect(
      screen.getByTestId('verification-history-history-1').props.accessibilityLabel as string,
    ).toContain('Set to Verified against a source.');
  });
});
