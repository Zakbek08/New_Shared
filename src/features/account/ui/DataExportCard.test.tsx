/**
 * The data-export card.
 *
 * The copy is the feature here as much as the button is: this is where a user
 * checks whether we kept something we said we would not. So the tests assert what
 * the card claims, and in particular that it says the file contains no card
 * number — a claim that must stay true and stay visible.
 *
 * Hook stubbed with a plain object, per the convention in this repository; see
 * DeleteAccountCard.test.tsx for why.
 */
import { fireEvent } from '@testing-library/react-native';

import type { AccountExportResult } from '@/features/account/api/account';

const mockExport = jest.fn();
const mockState = {
  isPending: false,
  isError: false,
  error: null as Error | null,
  data: null as AccountExportResult | null,
};

jest.mock('@/features/account/hooks', () => ({
  useExportAccountData: () => ({
    mutate: mockExport,
    isPending: mockState.isPending,
    isError: mockState.isError,
    error: mockState.error,
    data: mockState.data,
  }),
}));

import { renderScreen } from '@/test-support/renderScreen';

import { DataExportCard } from './DataExportCard';

function result(overrides: Partial<AccountExportResult> = {}): AccountExportResult {
  return {
    document: {} as AccountExportResult['document'],
    fileName: 'walletwise-export-2026-07-26T15-30-00-000Z.json',
    recordCount: 42,
    fileUri: 'file:///cache/walletwise-export-2026-07-26T15-30-00-000Z.json',
    wasShared: true,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.isPending = false;
  mockState.isError = false;
  mockState.error = null;
  mockState.data = null;
});

describe('what the card promises', () => {
  it('lists what the file contains', () => {
    const { getByText } = renderScreen(<DataExportCard />);

    expect(getByText(/your profile, your cards, your reward\s+valuations/)).toBeTruthy();
  });

  it('says stored digits are encrypted rather than pretending they are absent', () => {
    const { getByText } = renderScreen(<DataExportCard />);

    expect(getByText(/marks them as encrypted rather than showing them/)).toBeTruthy();
  });

  it('states that no card number, security code or PIN exists to export', () => {
    // The security claim the whole product rests on, stated where the user is
    // most likely to look for it.
    const { getByText } = renderScreen(<DataExportCard />);

    expect(getByText(/no card number, security code or PIN/)).toBeTruthy();
  });
});

describe('exporting', () => {
  it('exports when pressed', () => {
    const { getByTestId } = renderScreen(<DataExportCard />);

    fireEvent.press(getByTestId('account-export'));

    expect(mockExport).toHaveBeenCalledTimes(1);
  });

  it('shows no result line before an export has run', () => {
    const { queryByTestId } = renderScreen(<DataExportCard />);

    expect(queryByTestId('account-export-result')).toBeNull();
  });

  it('reports the record count and filename after a shared export', () => {
    mockState.data = result();
    const { getByTestId } = renderScreen(<DataExportCard />);

    expect(getByTestId('account-export-result').props.children).toContain(
      'Exported 42 records as walletwise-export-2026-07-26T15-30-00-000Z.json.',
    );
  });

  it('says the file was saved but not sent when sharing was unavailable', () => {
    // Otherwise the user is left thinking the export silently failed.
    mockState.data = result({ wasShared: false });
    const { getByTestId } = renderScreen(<DataExportCard />);

    expect(getByTestId('account-export-result').props.children).toContain(
      'has not been sent anywhere',
    );
  });

  it('shows the busy state while the export is running', () => {
    mockState.isPending = true;
    const { getByTestId } = renderScreen(<DataExportCard />);

    expect(getByTestId('account-export').props.accessibilityState?.busy).toBe(true);
  });

  it('shows the error when the export failed', () => {
    mockState.isError = true;
    mockState.error = new Error('nope');
    const { getByTestId } = renderScreen(<DataExportCard />);

    expect(getByTestId('account-export-error')).toBeTruthy();
  });
});
