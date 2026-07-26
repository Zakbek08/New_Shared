/**
 * The delete-account card.
 *
 * The only behaviour worth testing here is the gate: the destructive button must
 * be unreachable until the user has typed the word. A test that only checked the
 * copy would pass while the button was live on first render, which is the exact
 * failure this component exists to prevent.
 */
import { fireEvent } from '@testing-library/react-native';

const mockDeleteAccount = jest.fn();
const mockState = {
  isPending: false,
  isError: false,
  error: null as Error | null,
};

// The hook is stubbed with a plain object, which is how every component test in
// this repository handles a mutation. Running a real `useMutation` here does not
// work: under jest-expo, a mutation resolved inside `waitFor` never settles, so
// the test hangs rather than failing. The mutation's own behaviour is covered
// where it belongs — api/account.test.ts for the calls it makes, and
// supabase/tests/10_rls.sql for what the database allows.
jest.mock('@/features/account/hooks', () => ({
  useDeleteAccount: () => ({
    mutate: mockDeleteAccount,
    isPending: mockState.isPending,
    isError: mockState.isError,
    error: mockState.error,
  }),
}));

import { renderScreen } from '@/test-support/renderScreen';

import { DeleteAccountCard, DELETE_CONFIRMATION_WORD } from './DeleteAccountCard';

beforeEach(() => {
  jest.clearAllMocks();
  mockState.isPending = false;
  mockState.isError = false;
  mockState.error = null;
});

describe('the confirmation gate', () => {
  it('disables the delete button until the word is typed', () => {
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    expect(getByTestId('account-delete').props.accessibilityState?.disabled).toBe(true);
  });

  it('does not delete when the button is pressed while disabled', () => {
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    fireEvent.press(getByTestId('account-delete'));

    expect(mockDeleteAccount).not.toHaveBeenCalled();
  });

  it('enables the button once the word matches', () => {
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    fireEvent.changeText(getByTestId('account-delete-confirmation'), DELETE_CONFIRMATION_WORD);

    expect(getByTestId('account-delete').props.accessibilityState?.disabled).toBe(false);
  });

  it('accepts the word in lower case and with stray spaces', () => {
    // Typing on a phone adds a trailing space more often than not, and autocaps
    // cannot be relied on. Refusing over whitespace would be a puzzle, not a
    // safeguard — the deliberateness comes from typing the word at all.
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    fireEvent.changeText(getByTestId('account-delete-confirmation'), ' delete ');

    expect(getByTestId('account-delete').props.accessibilityState?.disabled).toBe(false);
  });

  it('stays disabled for a near miss', () => {
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    fireEvent.changeText(getByTestId('account-delete-confirmation'), 'DELET');

    expect(getByTestId('account-delete').props.accessibilityState?.disabled).toBe(true);
  });

  it('re-disables the button if the user edits the word back out', () => {
    const { getByTestId } = renderScreen(<DeleteAccountCard />);
    const field = getByTestId('account-delete-confirmation');

    fireEvent.changeText(field, DELETE_CONFIRMATION_WORD);
    fireEvent.changeText(field, 'DEL');

    expect(getByTestId('account-delete').props.accessibilityState?.disabled).toBe(true);
  });

  it('deletes once the gate is open', () => {
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    fireEvent.changeText(getByTestId('account-delete-confirmation'), DELETE_CONFIRMATION_WORD);
    fireEvent.press(getByTestId('account-delete'));

    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
  });

  it('shows the pending state while the deletion is in flight', () => {
    mockState.isPending = true;
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    // A disabled-looking button during an irreversible action, so a second tap
    // cannot queue a second attempt.
    expect(getByTestId('account-delete').props.accessibilityState?.busy).toBe(true);
  });
});

describe('what the card tells the user', () => {
  it('names what is deleted, rather than saying "your account"', () => {
    const { getByText } = renderScreen(<DeleteAccountCard />);

    expect(getByText(/your cards, your reward valuations/)).toBeTruthy();
  });

  it('says the device key is wiped too', () => {
    const { getByText } = renderScreen(<DeleteAccountCard />);

    expect(getByText(/encryption key .* is wiped from this device/)).toBeTruthy();
  });

  it('says the shared catalog is not affected', () => {
    const { getByText } = renderScreen(<DeleteAccountCard />);

    expect(getByText(/shared card catalog is not affected/)).toBeTruthy();
  });

  it('says it cannot be undone and points at the export', () => {
    const { getByText } = renderScreen(<DeleteAccountCard />);

    expect(getByText(/cannot be undone.*Export it/s)).toBeTruthy();
  });

  it('explains why the button is disabled, for a screen reader that cannot see it', () => {
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    expect(getByTestId('account-delete').props.accessibilityHint).toContain(
      `Disabled until you type ${DELETE_CONFIRMATION_WORD}`,
    );
  });

  it('warns that the action is permanent once the button is live', () => {
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    fireEvent.changeText(getByTestId('account-delete-confirmation'), DELETE_CONFIRMATION_WORD);

    expect(getByTestId('account-delete').props.accessibilityHint).toContain('cannot be undone');
  });
});

describe('failure', () => {
  it('shows the error when the deletion failed', () => {
    mockState.isError = true;
    mockState.error = new Error('nope');
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    expect(getByTestId('account-delete-error')).toBeTruthy();
  });

  it('keeps the gate closed after a failure, so a retry is deliberate too', () => {
    mockState.isError = true;
    mockState.error = new Error('nope');
    const { getByTestId } = renderScreen(<DeleteAccountCard />);

    expect(getByTestId('account-delete').props.accessibilityState?.disabled).toBe(true);
  });
});
