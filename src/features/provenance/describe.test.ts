/**
 * The wording of the provenance layer.
 *
 * These assertions look pedantic and are not. The provenance screens exist so a user
 * can judge how much to trust a figure, and that judgement is carried entirely by the
 * words: "Invented demonstration data" versus "Issuer's own terms" is the difference
 * between a number you would act on and one you would not. Softening the copy would
 * break the feature while leaving every render test passing, so the copy is pinned.
 */
import { SOURCE_DOCUMENT_TYPE_LABELS } from '@/domain/enums';
import type { SourceDocumentType } from '@/types/database';

import type { SourceSummary, VerificationEvent } from './api/provenance';
import {
  describeRecordedRate,
  describeSourceCaveat,
  describeSourceDocument,
  describeVerificationEvent,
  isStrongSource,
} from './describe';

function source(overrides: Partial<SourceSummary> = {}): SourceSummary {
  return {
    id: 'source-1',
    label: 'Northwind Grocery Card terms and conditions',
    url: 'https://example.test/terms',
    publisher: 'Northwind Financial',
    documentType: 'issuer_terms',
    publishedOn: '2026-06-15',
    retrievedOn: '2026-07-01',
    notes: null,
    isFictional: false,
    ...overrides,
  };
}

function event(overrides: Partial<VerificationEvent> = {}): VerificationEvent {
  return {
    id: 'event-1',
    rewardRuleId: 'rule-1',
    previousStatus: 'unverified',
    newStatus: 'verified',
    verifiedBaseRate: 1,
    verifiedBonusRate: 5,
    verifiedAt: '2026-07-01T00:00:00.000Z',
    sourceLabel: 'Northwind Grocery Card terms and conditions',
    note: null,
    ...overrides,
  };
}

describe('describeSourceDocument', () => {
  it('names the document type, publisher and both dates', () => {
    expect(describeSourceDocument(source())).toBe(
      'Issuer’s own terms · Published by Northwind Financial · dated June 15, 2026 · read on July 1, 2026.',
    );
  });

  // A `date` column arrives as "2026-06-15", which parses to UTC midnight. Formatted
  // in a zone west of Greenwich it would read as the 14th, making a published-on date
  // look a day early — so the formatter pins UTC and this asserts it.
  it('does not shift a date across a day boundary', () => {
    expect(describeSourceDocument(source({ publishedOn: '2026-01-01' }))).toContain(
      'dated January 1, 2026',
    );
  });

  it('says the publisher is unrecorded rather than guessing it from the label', () => {
    const described = describeSourceDocument(source({ publisher: null }));

    expect(described).toContain('Publisher not recorded');
    expect(described).not.toContain('Northwind');
  });

  it('omits a date it does not have, rather than printing a placeholder', () => {
    const described = describeSourceDocument(source({ publishedOn: null, retrievedOn: null }));

    expect(described).toBe('Issuer’s own terms · Published by Northwind Financial.');
    expect(described).not.toContain('null');
  });

  it('survives an unparseable date without printing "Invalid Date"', () => {
    const described = describeSourceDocument(source({ publishedOn: 'not-a-date' }));

    expect(described).not.toContain('Invalid');
    expect(described).not.toContain('NaN');
  });
});

describe('describeSourceCaveat', () => {
  it('adds no caveat to an issuer’s own terms', () => {
    expect(describeSourceCaveat(source())).toBeNull();
  });

  it('says a marketing page is not the terms it advertises', () => {
    expect(describeSourceCaveat(source({ documentType: 'issuer_marketing' }))).toContain(
      'not the same as the terms',
    );
  });

  it('says plainly that nobody has checked a cardholder submission', () => {
    expect(describeSourceCaveat(source({ documentType: 'user_submission' }))).toContain(
      'Nobody has checked it against the issuer',
    );
  });

  // The fictional flag overrides the document type: demo data pretending to be
  // issuer terms must still announce itself as invented.
  it('flags fictional data as invented whatever the document type claims', () => {
    const caveat = describeSourceCaveat(
      source({ documentType: 'issuer_terms', isFictional: true }),
    );

    expect(caveat).toContain('invented demonstration data');
    expect(caveat).toContain('no purchase decision should be made on it');
  });

  // Exhaustiveness: every document type must have a decided answer, so a new one
  // cannot slip through with no caveat by accident. The switch has no `default`, so
  // this is belt-and-braces over a typecheck failure.
  const ALL_TYPES = Object.keys(SOURCE_DOCUMENT_TYPE_LABELS) as SourceDocumentType[];

  it.each(ALL_TYPES)('has a decided answer for %s', (documentType) => {
    const caveat = describeSourceCaveat(source({ documentType }));
    // `issuer_terms` is the one type with nothing to warn about.
    if (documentType === 'issuer_terms') {
      expect(caveat).toBeNull();
    } else {
      expect(caveat).not.toBeNull();
      expect((caveat ?? '').length).toBeGreaterThan(20);
    }
  });
});

describe('isStrongSource', () => {
  it('accepts only a non-fictional issuer terms document', () => {
    expect(isStrongSource(source())).toBe(true);
  });

  it('rejects fictional data even when it is filed as issuer terms', () => {
    expect(isStrongSource(source({ isFictional: true }))).toBe(false);
  });

  it('rejects a marketing page', () => {
    expect(isStrongSource(source({ documentType: 'issuer_marketing' }))).toBe(false);
  });
});

describe('describeVerificationEvent', () => {
  it('phrases the first entry as a first recording, not a change', () => {
    const described = describeVerificationEvent(event({ previousStatus: null }));

    expect(described).toBe('First recorded as: verified against a source.');
    expect(described).not.toContain('Changed');
  });

  it('names both statuses when one changed', () => {
    expect(
      describeVerificationEvent(event({ previousStatus: 'verified', newStatus: 'stale' })),
    ).toBe('Changed from “Verified against a source” to “Source may be out of date”.');
  });

  // "Changed from verified to verified" reads like a bug in the log rather than a
  // re-check that found nothing wrong.
  it('phrases an unchanged re-check as a re-check', () => {
    expect(
      describeVerificationEvent(event({ previousStatus: 'verified', newStatus: 'verified' })),
    ).toBe('Checked again, still: verified against a source.');
  });
});

describe('describeRecordedRate', () => {
  // base 1 + bonus 5 = 6, formatted as a cash-back percentage.
  it('adds the two recorded rates the way the engine reads them: 1 + 5 = 6%', () => {
    expect(describeRecordedRate(event(), 'cash_back_percent')).toBe(
      'Rate on file that day: 6%',
    );
  });

  it('treats a missing half of the pair as zero: 3 + nothing = 3%', () => {
    expect(
      describeRecordedRate(
        event({ verifiedBaseRate: 3, verifiedBonusRate: null }),
        'cash_back_percent',
      ),
    ).toBe('Rate on file that day: 3%');
  });

  // No recorded rate is a real state — history rows predate the snapshot columns —
  // and the honest answer is to say nothing rather than to print "0%".
  it('says nothing when no rate was recorded', () => {
    expect(
      describeRecordedRate(
        event({ verifiedBaseRate: null, verifiedBonusRate: null }),
        'cash_back_percent',
      ),
    ).toBeNull();
  });

  it('says nothing when the reward type is unknown, rather than assuming cash back', () => {
    expect(describeRecordedRate(event(), null)).toBeNull();
  });

  it('formats a points rule as a multiplier, not a percentage', () => {
    expect(
      describeRecordedRate(
        event({ verifiedBaseRate: 4, verifiedBonusRate: 0 }),
        'points_per_dollar',
      ),
    ).toContain('4');
  });
});
