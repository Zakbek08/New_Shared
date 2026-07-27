/**
 * "Source document and change history".
 *
 * The section closes the audit trail, so what is asserted is that it never asserts more
 * than it knows: a rule that has left the catalog says so instead of showing a blank
 * source; a load failure reads as a failure rather than as "nothing has changed"; and a
 * history entry shows the rate that was on file *that day*, which is the whole reason
 * the log exists.
 */
import { screen } from '@testing-library/react-native';

import { renderScreen } from '@/test-support/renderScreen';

import type { RuleProvenance, VerificationEvent } from '../api/provenance';

interface FakeQuery {
  readonly data?: readonly RuleProvenance[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error?: unknown;
}

// `mock`-prefixed so Jest permits the hoisted factory to close over it.
let mockProvenance: FakeQuery = { isPending: true, isError: false };
const mockUseRuleProvenance = jest.fn();

jest.mock('../hooks', () => ({
  useRuleProvenance: (ruleIds: readonly string[]) => {
    mockUseRuleProvenance(ruleIds);
    return { ...mockProvenance, refetch: jest.fn() };
  },
}));

import { RuleHistorySection } from './RuleHistorySection';

function event(overrides: Partial<VerificationEvent> = {}): VerificationEvent {
  return {
    id: 'event-1',
    rewardRuleId: 'rule-1',
    previousStatus: 'unverified',
    newStatus: 'verified',
    verifiedBaseRate: 0,
    verifiedBonusRate: 6,
    verifiedAt: '2026-07-01T00:00:00.000Z',
    sourceLabel: 'Northwind Grocery Card terms',
    note: 'Initial load.',
    ...overrides,
  };
}

function entry(overrides: Partial<RuleProvenance> = {}): RuleProvenance {
  return {
    ruleId: 'rule-1',
    ruleLabel: '6% at supermarkets',
    verificationStatus: 'verified',
    lastVerifiedAt: '2026-07-01T00:00:00.000Z',
    source: {
      id: 'source-1',
      label: 'Northwind Grocery Card terms',
      url: null,
      publisher: 'Northwind Financial',
      documentType: 'issuer_terms',
      publishedOn: '2026-06-15',
      retrievedOn: '2026-07-01',
      notes: null,
      isFictional: false,
    },
    history: [event()],
    ...overrides,
  };
}

afterEach(() => {
  mockProvenance = { isPending: true, isError: false };
  mockUseRuleProvenance.mockClear();
});

describe('RuleHistorySection', () => {
  // A null rule id must not become a query for the empty string, which would be a
  // request for a rule that cannot exist.
  it('asks for nothing when no rule was applied', () => {
    renderScreen(<RuleHistorySection ruleId={null} rewardType="cash_back_percent" />);

    expect(mockUseRuleProvenance).toHaveBeenCalledWith([]);
    expect(screen.getByText(/No bonus rule was applied/i)).toBeTruthy();
  });

  it('asks for exactly the applied rule', () => {
    mockProvenance = { isPending: false, isError: false, data: [entry()] };
    renderScreen(<RuleHistorySection ruleId="rule-1" rewardType="cash_back_percent" />);

    expect(mockUseRuleProvenance).toHaveBeenCalledWith(['rule-1']);
  });

  it('shows a loading state while the source loads', () => {
    renderScreen(<RuleHistorySection ruleId="rule-1" rewardType="cash_back_percent" />);

    expect(screen.getByTestId('history-loading')).toBeTruthy();
  });

  // Silently reading as "nothing has changed" would turn a failure to load into a
  // statement about the rule.
  it('reads as a failure, not as an empty history, when the read fails', () => {
    mockProvenance = { isPending: false, isError: true, error: new Error('nope') };
    renderScreen(<RuleHistorySection ruleId="rule-1" rewardType="cash_back_percent" />);

    expect(screen.getByTestId('history-error')).toBeTruthy();
    expect(screen.queryByText(/Nothing has been recorded/i)).toBeNull();
  });

  it('says the rule has left the catalog, while standing by the figures already shown', () => {
    mockProvenance = { isPending: false, isError: false, data: [] };
    renderScreen(<RuleHistorySection ruleId="rule-gone" rewardType="cash_back_percent" />);

    expect(screen.getByText(/no longer in the catalog/i)).toBeTruthy();
    expect(screen.getByText(/still the ones that were used at the time/i)).toBeTruthy();
  });

  it('names the document behind the rate', () => {
    mockProvenance = { isPending: false, isError: false, data: [entry()] };
    renderScreen(<RuleHistorySection ruleId="rule-1" rewardType="cash_back_percent" />);

    expect(screen.getByTestId('history-source')).toBeTruthy();
    expect(screen.getByText('Northwind Grocery Card terms')).toBeTruthy();
  });

  // 0 base + 6 bonus = 6%, formatted as a cash-back rate. This is the figure that keeps
  // an old recommendation checkable after the issuer changes the rate.
  it('shows the rate that was on file that day: 0 + 6 = 6%', () => {
    mockProvenance = { isPending: false, isError: false, data: [entry()] };
    renderScreen(<RuleHistorySection ruleId="rule-1" rewardType="cash_back_percent" />);

    expect(screen.getByText('Rate on file that day: 6%')).toBeTruthy();
    expect(screen.getByText('July 1, 2026')).toBeTruthy();
    // The fixture records a status change, so the entry reads as a change rather than
    // as a first recording.
    expect(
      screen.getByText('Changed from “Not yet verified” to “Verified against a source”.'),
    ).toBeTruthy();
  });

  it('shows every entry, and states that the log is append-only', () => {
    mockProvenance = {
      isPending: false,
      isError: false,
      data: [
        entry({
          history: [
            event({ id: 'newer', verifiedAt: '2026-07-01T00:00:00.000Z' }),
            event({
              id: 'older',
              verifiedAt: '2026-04-02T00:00:00.000Z',
              previousStatus: 'verified',
              newStatus: 'verified',
            }),
          ],
        }),
      ],
    };
    renderScreen(<RuleHistorySection ruleId="rule-1" rewardType="cash_back_percent" />);

    expect(screen.getByTestId('history-entry-newer')).toBeTruthy();
    expect(screen.getByTestId('history-entry-older')).toBeTruthy();
    expect(screen.getByText(/append-only/i)).toBeTruthy();
    expect(screen.getByText('Newest first')).toBeTruthy();
  });

  it('says nothing has been recorded when the log is genuinely empty', () => {
    mockProvenance = { isPending: false, isError: false, data: [entry({ history: [] })] };
    renderScreen(<RuleHistorySection ruleId="rule-1" rewardType="cash_back_percent" />);

    expect(screen.getByText(/Nothing has been recorded against this rule/i)).toBeTruthy();
  });

  // Rather than defaulting to a percentage, which would misdescribe a points rule.
  it('omits the recorded rate when the reward type is unknown', () => {
    mockProvenance = { isPending: false, isError: false, data: [entry()] };
    renderScreen(<RuleHistorySection ruleId="rule-1" rewardType={null} />);

    expect(screen.queryByText(/Rate on file that day/)).toBeNull();
  });
});
