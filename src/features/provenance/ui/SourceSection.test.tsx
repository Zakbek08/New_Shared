/**
 * "Where these rates came from".
 *
 * Beyond rendering, three things are asserted, each of which the section exists for.
 *
 * A rate verified long ago must read as out of date **even when the stored status says
 * verified**, because that downgrade is derived from `asOf` and is the honest answer.
 * Fictional data must announce itself in words, not only in colour. And a rule with no
 * document behind it must say so, rather than leaving a gap a user reads as still
 * loading.
 */
import { screen } from '@testing-library/react-native';

import { renderScreen } from '@/test-support/renderScreen';

import type { RuleProvenance } from '../api/provenance';

interface FakeQuery {
  readonly data?: readonly RuleProvenance[];
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error?: unknown;
}

// `mock`-prefixed so Jest permits the hoisted factory to close over it.
let mockProvenance: FakeQuery = { isPending: true, isError: false };

jest.mock('../hooks', () => ({
  useRuleProvenance: () => ({ ...mockProvenance, refetch: jest.fn() }),
}));

import { SourceSection } from './SourceSection';

/** 15 July 2026: 14 days after the demo verification date, so inside the window. */
const AS_OF = new Date('2026-07-15T12:00:00.000Z');

function entry(overrides: Partial<RuleProvenance> = {}): RuleProvenance {
  return {
    ruleId: 'rule-1',
    ruleLabel: '6% at supermarkets',
    verificationStatus: 'verified',
    lastVerifiedAt: '2026-07-01T00:00:00.000Z',
    source: {
      id: 'source-1',
      label: 'Northwind Grocery Card terms',
      url: 'https://example.test/terms',
      publisher: 'Northwind Financial',
      documentType: 'issuer_terms',
      publishedOn: '2026-06-15',
      retrievedOn: '2026-07-01',
      notes: null,
      isFictional: false,
    },
    history: [],
    ...overrides,
  };
}

afterEach(() => {
  mockProvenance = { isPending: true, isError: false };
});

describe('SourceSection', () => {
  it('shows a loading state while the sources load', () => {
    renderScreen(<SourceSection ruleIds={['rule-1']} asOf={AS_OF} />);

    expect(screen.getByTestId('source-section-loading')).toBeTruthy();
  });

  it('offers a retry when the read fails', () => {
    mockProvenance = { isPending: false, isError: true, error: new Error('nope') };
    renderScreen(<SourceSection ruleIds={['rule-1']} asOf={AS_OF} />);

    expect(screen.getByTestId('source-section-error')).toBeTruthy();
  });

  it('says there is nothing to cite when the card has no rates', () => {
    mockProvenance = { isPending: false, isError: false, data: [] };
    renderScreen(<SourceSection ruleIds={[]} asOf={AS_OF} />);

    expect(screen.getByText(/no earn rates recorded/i)).toBeTruthy();
  });

  it('names the rule, the document and its publisher', () => {
    mockProvenance = { isPending: false, isError: false, data: [entry()] };
    renderScreen(<SourceSection ruleIds={['rule-1']} asOf={AS_OF} />);

    expect(screen.getByText('6% at supermarkets')).toBeTruthy();
    expect(screen.getByText('Northwind Grocery Card terms')).toBeTruthy();
    expect(screen.getByText(/Published by Northwind Financial/)).toBeTruthy();
  });

  it('states that WalletWise never signs in to a bank or scrapes a website', () => {
    mockProvenance = { isPending: false, isError: false, data: [entry()] };
    renderScreen(<SourceSection ruleIds={['rule-1']} asOf={AS_OF} />);

    expect(screen.getByText(/never signs in to your bank/i)).toBeTruthy();
    expect(screen.getByText(/never fetches or scrapes/i)).toBeTruthy();
  });

  // The whole point of deriving freshness rather than storing it. 1 January 2026 is
  // 195 days before `asOf`, well past the 90-day window, so a rule stored as
  // `verified` must still read as out of date.
  it('treats a rate verified 195 days ago as out of date, whatever the column says', () => {
    mockProvenance = {
      isPending: false,
      isError: false,
      data: [entry({ lastVerifiedAt: '2026-01-01T00:00:00.000Z' })],
    };
    renderScreen(<SourceSection ruleIds={['rule-1']} asOf={AS_OF} />);

    expect(screen.getByText(/Out of date/)).toBeTruthy();
    expect(screen.getByText(/treat it as\s+out of date/i)).toBeTruthy();
  });

  it('does not warn about a rate verified 14 days ago', () => {
    mockProvenance = { isPending: false, isError: false, data: [entry()] };
    renderScreen(<SourceSection ruleIds={['rule-1']} asOf={AS_OF} />);

    expect(screen.queryByText(/treat it as/i)).toBeNull();
    expect(screen.getByText(/Verified recently/)).toBeTruthy();
  });

  // In words, not only in colour: a badge tone tells a colour-blind user nothing.
  it('says in words that fictional data is invented', () => {
    mockProvenance = {
      isPending: false,
      isError: false,
      data: [
        entry({
          source: {
            ...entry().source!,
            documentType: 'fictional_demo_data',
            isFictional: true,
            url: null,
          },
        }),
      ],
    };
    renderScreen(<SourceSection ruleIds={['rule-1']} asOf={AS_OF} />);

    // Twice, deliberately: once as the document type, once as the caveat spelling out
    // what that means. Both lines matter, so this asserts the count rather than
    // reaching for the first match.
    expect(screen.getAllByText(/invented demonstration data/i)).toHaveLength(2);
    expect(screen.getByText(/no purchase decision should be made on it/i)).toBeTruthy();
    expect(screen.getByText(/No public link is recorded/i)).toBeTruthy();
  });

  it('says plainly when a rule cites no document at all', () => {
    mockProvenance = {
      isPending: false,
      isError: false,
      data: [entry({ source: null, verificationStatus: 'unverified', lastVerifiedAt: null })],
    };
    renderScreen(<SourceSection ruleIds={['rule-1']} asOf={AS_OF} />);

    expect(screen.getByText(/No document is recorded behind this rate/i)).toBeTruthy();
  });

  it('lists one entry per rule', () => {
    mockProvenance = {
      isPending: false,
      isError: false,
      data: [entry(), entry({ ruleId: 'rule-2', ruleLabel: '1% on everything else' })],
    };
    renderScreen(<SourceSection ruleIds={['rule-1', 'rule-2']} asOf={AS_OF} />);

    expect(screen.getByTestId('source-entry-rule-1')).toBeTruthy();
    expect(screen.getByTestId('source-entry-rule-2')).toBeTruthy();
  });

  // Two rules citing the same terms used to repeat the whole document description, and
  // its warning, verbatim. A caveat printed four times in a row stops being read.
  it('describes a shared document once, not once per rule', () => {
    mockProvenance = {
      isPending: false,
      isError: false,
      data: [entry(), entry({ ruleId: 'rule-2', ruleLabel: '1% on everything else' })],
    };
    renderScreen(<SourceSection ruleIds={['rule-1', 'rule-2']} asOf={AS_OF} />);

    expect(screen.getByTestId('source-section-shared')).toBeTruthy();
    expect(screen.getAllByText('Northwind Grocery Card terms')).toHaveLength(1);
    expect(screen.getByText(/Rates read from this document/)).toBeTruthy();
    // Each rule still carries its own freshness, which can differ from the others'.
    expect(screen.getByText('6% at supermarkets')).toBeTruthy();
    expect(screen.getByText('1% on everything else')).toBeTruthy();
  });

  it('describes each document separately when the rules cite different ones', () => {
    const base = entry();
    mockProvenance = {
      isPending: false,
      isError: false,
      data: [
        base,
        entry({
          ruleId: 'rule-2',
          ruleLabel: '1% on everything else',
          source: { ...base.source!, id: 'source-2', label: 'A different document' },
        }),
      ],
    };
    renderScreen(<SourceSection ruleIds={['rule-1', 'rule-2']} asOf={AS_OF} />);

    expect(screen.queryByTestId('source-section-shared')).toBeNull();
    expect(screen.getByText('Northwind Grocery Card terms')).toBeTruthy();
    expect(screen.getByText('A different document')).toBeTruthy();
  });

  // One rule has nothing to deduplicate, and hoisting its document would put it above
  // the rule label it belongs under.
  it('keeps a single rule on the per-rule layout', () => {
    mockProvenance = { isPending: false, isError: false, data: [entry()] };
    renderScreen(<SourceSection ruleIds={['rule-1']} asOf={AS_OF} />);

    expect(screen.queryByTestId('source-section-shared')).toBeNull();
    expect(screen.getByTestId('source-detail-rule-1')).toBeTruthy();
  });

  // The shared block speaks for every rate read out of the document, so it must show
  // the weakest of them: 6% verified, 1% disputed → the document reads as disputed.
  it('shows the weakest verification against a shared document', () => {
    mockProvenance = {
      isPending: false,
      isError: false,
      data: [
        entry(),
        entry({
          ruleId: 'rule-2',
          ruleLabel: '1% on everything else',
          verificationStatus: 'disputed',
        }),
      ],
    };
    renderScreen(<SourceSection ruleIds={['rule-1', 'rule-2']} asOf={AS_OF} />);

    expect(screen.getByText('Disputed')).toBeTruthy();
    expect(screen.queryByText('Verified against a source')).toBeNull();
  });

  it('gives the open-document button an accessible name and a hint', () => {
    mockProvenance = { isPending: false, isError: false, data: [entry()] };
    renderScreen(<SourceSection ruleIds={['rule-1']} asOf={AS_OF} />);

    const button = screen.getByLabelText('Open the source document');

    expect(button.props.accessibilityRole).toBe('button');
    expect(button.props.accessibilityHint).toMatch(/does not read it for you/i);
  });
});
