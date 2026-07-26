import { render, screen, userEvent } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

import { TextField } from './TextField';
import { Toggle } from './Toggle';

const renderInTheme = (ui: React.ReactElement, scheme: 'light' | 'dark' = 'light') =>
  render(<ThemeProvider initialPreference={scheme}>{ui}</ThemeProvider>);

describe('TextField', () => {
  it('uses the visible label as the accessible name', () => {
    renderInTheme(<TextField label="Email address" testID="field" />);

    // Both a sighted user and a screen reader get the same wording.
    expect(screen.getByText('Email address')).toBeTruthy();
    expect(screen.getByLabelText('Email address')).toBeTruthy();
  });

  it('meets the minimum touch target', () => {
    renderInTheme(<TextField label="Email" testID="field" />);
    const style = screen.getByTestId('field').props.style as { minHeight?: number };
    expect(style.minHeight).toBe(MIN_TOUCH_TARGET);
  });

  it('marks a required field in the label', () => {
    renderInTheme(<TextField label="Password" required />);
    expect(screen.getByText('Password *')).toBeTruthy();
  });

  it('shows a hint when there is no error', () => {
    renderInTheme(<TextField label="Password" hint="At least 10 characters" />);
    expect(screen.getByText('At least 10 characters')).toBeTruthy();
  });

  it('shows the error as text, so the state is not conveyed by colour alone', () => {
    renderInTheme(
      <TextField label="Email" error="Enter a valid email address" testID="field" />,
    );
    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
  });

  it('announces the error via a live region', () => {
    renderInTheme(<TextField label="Email" error="That is not right" testID="field" />);

    const region = screen.getByTestId('field-error');
    expect(region.props.accessibilityLiveRegion).toBe('polite');
  });

  it('exposes the error as the input hint and flags it invalid', () => {
    renderInTheme(<TextField label="Email" error="That is not right" testID="field" />);

    const input = screen.getByTestId('field');
    expect(input.props.accessibilityHint).toBe('That is not right');
    expect(input.props['aria-invalid']).toBe(true);
  });

  it('replaces the hint with the error when both are supplied', () => {
    renderInTheme(
      <TextField label="Email" hint="We never share this" error="That is not right" />,
    );

    expect(screen.getByText('That is not right')).toBeTruthy();
    expect(screen.queryByText('We never share this')).toBeNull();
  });

  it('is not flagged invalid when there is no error', () => {
    renderInTheme(<TextField label="Email" testID="field" />);
    expect(screen.getByTestId('field').props['aria-invalid']).toBe(false);
  });

  it('reports typed text to onChangeText', async () => {
    const onChangeText = jest.fn();
    renderInTheme(<TextField label="Email" onChangeText={onChangeText} testID="field" />);

    await userEvent.type(screen.getByTestId('field'), 'hello');
    expect(onChangeText).toHaveBeenCalled();
  });

  it('renders in dark mode', () => {
    renderInTheme(<TextField label="Email" error="Nope" />, 'dark');
    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
});

describe('Toggle', () => {
  it('reports the switch role and its checked state', () => {
    renderInTheme(
      <Toggle label="Preferred card" value onValueChange={jest.fn()} testID="toggle" />,
    );

    const toggle = screen.getByTestId('toggle');
    expect(toggle.props.accessibilityRole).toBe('switch');
    expect(toggle.props.accessibilityState).toMatchObject({ checked: true });
  });

  it('flips the value when the row is pressed', async () => {
    const onValueChange = jest.fn();
    renderInTheme(
      <Toggle
        label="Preferred card"
        value={false}
        onValueChange={onValueChange}
        testID="toggle"
      />,
    );

    await userEvent.press(screen.getByTestId('toggle'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('exposes the description as the accessibility hint', () => {
    renderInTheme(
      <Toggle
        label="Preferred card"
        description="Breaks ties in this card's favour"
        value={false}
        onValueChange={jest.fn()}
        testID="toggle"
      />,
    );

    expect(screen.getByTestId('toggle').props.accessibilityHint).toBe(
      "Breaks ties in this card's favour",
    );
  });

  it('meets the minimum touch target', () => {
    renderInTheme(<Toggle label="X" value={false} onValueChange={jest.fn()} testID="toggle" />);
    const style = screen.getByTestId('toggle').props.style as { minHeight?: number };
    expect(style.minHeight).toBe(MIN_TOUCH_TARGET);
  });

  it('does not fire when disabled', async () => {
    const onValueChange = jest.fn();
    renderInTheme(
      <Toggle
        label="Preferred card"
        value={false}
        onValueChange={onValueChange}
        disabled
        testID="toggle"
      />,
    );

    const toggle = screen.getByTestId('toggle');
    expect(toggle.props.accessibilityState).toMatchObject({ disabled: true });

    await userEvent.press(toggle);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
