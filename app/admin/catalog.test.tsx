/**
 * The admin catalog screen.
 *
 * What is asserted is the honesty of the role gate: a member sees the catalog and is
 * told plainly that the *database* refuses their writes, and the editing tools are
 * hidden because they would not work — not as a security measure. A screen that
 * implied the hiding was the protection would be teaching the reader the wrong model.
 */
import { screen } from '@testing-library/react-native';

import { ruleFreshness } from '@/domain/catalog/staleness';
import type { CatalogRule } from '@/features/admin/api/catalog';
import { renderScreen } from '@/test-support/renderScreen';

import AdminCatalogScreen from './catalog';

const AS_OF = new Date('2026-07-26T14:30:00.000Z');

interface FakeQuery<T> {
  readonly data?: T;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly error?: unknown;
}

// All `mock`-prefixed so Jest permits the hoisted factory to close over them.
let mockAccess = {
  role: 'catalog_editor' as string | null,
  canEdit: true,
  isAdmin: false,
  isPending: false,
};
let mockRules: FakeQuery<CatalogRule[]> = { data: [], isPending: false, isError: false };
const mockMutation = () => ({
  mutate: jest.fn(),
  isPending: false,
  isError: false,
  error: null,
  data: null,
});

jest.mock('@/features/admin/hooks', () => ({
  useCatalogAccess: () => mockAccess,
  useCatalogRules: () => ({ ...mockRules, refetch: jest.fn() }),
  useSources: () => ({ data: [], isPending: false, isError: false }),
  useVerificationHistory: () => ({ data: [], isPending: false, isError: false }),
  useAuditLog: () => ({ data: [], isPending: false, isError: false, refetch: jest.fn() }),
  useSaveRule: () => mockMutation(),
  useRetireRule: () => mockMutation(),
  useSaveCondition: () => mockMutation(),
  useCreateSource: () => mockMutation(),
  useRecordVerification: () => mockMutation(),
  useBulkImport: () => mockMutation(),
}));

function catalogRule(overrides: Partial<CatalogRule> = {}): CatalogRule {
  // `in` rather than `??`: an explicit `null` means "never verified", which `??`
  // would silently replace with the default date.
  const lastVerifiedAt =
    'lastVerifiedAt' in overrides ? overrides.lastVerifiedAt! : '2026-07-01T00:00:00.000Z';

  return {
    id: 'rule-1',
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
    sourceId: 'source-1',
    sourceLabel: 'Issuer terms',
    sourceUrl: 'https://example.test/terms',
    isFictionalSource: true,
    lastVerifiedAt,
    verificationStatus: 'verified',
    isActive: true,
    notes: null,
    conditions: [],
    freshness: ruleFreshness(
      {
        lastVerifiedAt: lastVerifiedAt === null ? null : new Date(lastVerifiedAt),
        verificationStatus: overrides.verificationStatus ?? 'verified',
      },
      AS_OF,
    ),
    ...overrides,
  };
}

beforeEach(() => {
  mockAccess = { role: 'catalog_editor', canEdit: true, isAdmin: false, isPending: false };
  mockRules = { data: [catalogRule()], isPending: false, isError: false };
});

describe('the screen states where access is enforced', () => {
  it('says the database refuses the write, not the screen', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText(/row-level security policies/)).toBeTruthy();
    expect(screen.getByText(/the database refuses the write regardless/)).toBeTruthy();
  });

  it('says a member cannot promote themselves', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText(/pins their own role to its current value/)).toBeTruthy();
  });

  it('explains that staleness needs no scheduled job', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText(/90 days/)).toBeTruthy();
    expect(screen.getByText(/no write and no scheduled job/)).toBeTruthy();
  });
});

describe('an editor', () => {
  it('is shown their role and that they may edit', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText('Your role: catalog editor')).toBeTruthy();
    expect(screen.getByText('May edit the catalog')).toBeTruthy();
  });

  it('gets the editing tools', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByTestId('admin-new-rule')).toBeTruthy();
    expect(screen.getByTestId('admin-bulk-import')).toBeTruthy();
  });

  it('sees the review queue with the rule and its freshness', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText('6% cash back at US supermarkets')).toBeTruthy();
    expect(screen.getByText('Verified recently')).toBeTruthy();
  });

  it('does not see the read-only notice', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.queryByTestId('admin-read-only-notice')).toBeNull();
  });
});

describe('a member', () => {
  beforeEach(() => {
    mockAccess = { role: 'member', canEdit: false, isAdmin: false, isPending: false };
  });

  it('is told plainly that the database, not the screen, refuses their writes', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByTestId('admin-read-only-notice')).toBeTruthy();
    expect(
      screen.getByText(/every write is refused by the database, not by\s+this screen/),
    ).toBeTruthy();
  });

  it('is shown as read-only', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText('Read-only')).toBeTruthy();
    expect(screen.getByText('Your role: member')).toBeTruthy();
  });

  it('does not get the editing tools, because they would not work', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.queryByTestId('admin-new-rule')).toBeNull();
    expect(screen.queryByTestId('admin-bulk-import')).toBeNull();
  });

  it('can still read the catalog and the audit trail', () => {
    // Read access is granted to every authenticated user by the RLS policy, so hiding
    // the catalog would be the screen inventing a restriction the database does not
    // have.
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText('6% cash back at US supermarkets')).toBeTruthy();
    expect(screen.getByTestId('audit-empty')).toBeTruthy();
  });
});

describe('while the role is still loading', () => {
  it('shows neither the badges nor the read-only notice', () => {
    // Flashing "read-only" at an editor for a moment would be a lie, briefly.
    mockAccess = { role: null, canEdit: false, isAdmin: false, isPending: true };

    renderScreen(<AdminCatalogScreen />);

    expect(screen.queryByTestId('admin-read-only-notice')).toBeNull();
    expect(screen.queryByText('Read-only')).toBeNull();
  });
});

describe('the queue', () => {
  it('flags a rule that is stored as verified but too old to trust', () => {
    mockRules = {
      data: [catalogRule({ lastVerifiedAt: '2025-01-01T00:00:00.000Z' })],
      isPending: false,
      isError: false,
    };

    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText('Out of date')).toBeTruthy();
    // The distinction matters to an editor: the column says one thing, the app acts
    // on another.
    expect(
      screen.getByLabelText(/Stored as verified, but treated as out of date/),
    ).toBeTruthy();
  });

  it('flags a never-verified rule', () => {
    mockRules = {
      data: [catalogRule({ lastVerifiedAt: null, verificationStatus: 'unverified' })],
      isPending: false,
      isError: false,
    };

    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText('Never verified')).toBeTruthy();
    expect(screen.getByText('1 never verified')).toBeTruthy();
  });

  it('badges a rule whose source is demonstration data', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText('Demo source')).toBeTruthy();
  });

  it('offers retire rather than delete', () => {
    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByTestId('rule-retire-rule-1')).toBeTruthy();
    expect(screen.queryByText('Delete rule')).toBeNull();
    expect(screen.getByTestId('rule-retire-rule-1').props.accessibilityHint as string).toMatch(
      /kept, not deleted/,
    );
  });

  it('offers reinstate for a retired rule', () => {
    mockRules = {
      data: [catalogRule({ isActive: false, verificationStatus: 'retired' })],
      isPending: false,
      isError: false,
    };

    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByText('Reinstate')).toBeTruthy();
    expect(screen.getByText('Retired')).toBeTruthy();
  });

  it('says so when a search matches nothing', () => {
    mockRules = { data: [], isPending: false, isError: false };

    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByTestId('admin-rules-empty')).toBeTruthy();
  });

  it('surfaces a load failure', () => {
    mockRules = {
      isPending: false,
      isError: true,
      error: new Error('network down'),
    };

    renderScreen(<AdminCatalogScreen />);

    expect(screen.getByTestId('admin-rules-error')).toBeTruthy();
  });
});
