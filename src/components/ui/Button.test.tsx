import { StyleSheet } from 'react-native';
import { render, screen, userEvent } from '@testing-library/react-native';

import { ThemeProvider } from '@/theme/ThemeProvider';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';

import { Badge } from './Badge';
import { Button } from './Button';

const renderInTheme = (ui: React.ReactElement, scheme: 'light' | 'dark' = 'light') =>
  render(<ThemeProvider initialPreference={scheme}>{ui}</ThemeProvider>);

describe('Button', () => {
  it('reports the button role and its label', () => {
    renderInTheme(<Button label="Start a purchase" onPress={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Start a purchase' });
    expect(button).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    renderInTheme(<Button label="Tap me" onPress={onPress} testID="tap" />);

    await userEvent.press(screen.getByTestId('tap'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('meets the 44pt minimum touch target', () => {
    renderInTheme(<Button label="Small" onPress={jest.fn()} testID="small" />);
    // Pressable resolves its style prop to an array, so flatten before reading.
    const style = StyleSheet.flatten(screen.getByTestId('small').props.style) as {
      minHeight?: number;
    };
    expect(style.minHeight).toBe(MIN_TOUCH_TARGET);
  });

  it('reports its disabled state to assistive technology and ignores taps', async () => {
    const onPress = jest.fn();
    renderInTheme(<Button label="Disabled" onPress={onPress} disabled testID="disabled" />);

    const button = screen.getByTestId('disabled');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });

    await userEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports a busy state while loading, and does not fire', async () => {
    const onPress = jest.fn();
    renderInTheme(<Button label="Saving" onPress={onPress} loading testID="loading" />);

    const button = screen.getByTestId('loading');
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });

    await userEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('passes an accessibility hint through', () => {
    renderInTheme(
      <Button
        label="Add card"
        onPress={jest.fn()}
        accessibilityHint="Opens the card catalog"
        testID="hinted"
      />,
    );
    expect(screen.getByTestId('hinted').props.accessibilityHint).toBe('Opens the card catalog');
  });

  it('renders every variant in both schemes', () => {
    for (const scheme of ['light', 'dark'] as const) {
      for (const variant of ['primary', 'secondary', 'ghost', 'danger'] as const) {
        const view = renderInTheme(
          <Button label={variant} onPress={jest.fn()} variant={variant} />,
          scheme,
        );
        expect(view.getByText(variant)).toBeTruthy();
        view.unmount();
      }
    }
  });
});

describe('Badge', () => {
  it('always renders a text label, so meaning never depends on colour alone', () => {
    renderInTheme(<Badge label="Best value" tone="best" glyph="✓" />);
    expect(screen.getByText('Best value')).toBeTruthy();
  });

  it('announces the label to a screen reader', () => {
    renderInTheme(<Badge label="Fee applies" tone="negative" />);
    expect(screen.getByLabelText('Fee applies')).toBeTruthy();
  });

  it('lets an abbreviated label be expanded for screen readers', () => {
    renderInTheme(
      <Badge
        label="3% FX"
        tone="negative"
        accessibilityLabel="3 percent foreign transaction fee"
      />,
    );
    expect(screen.getByLabelText('3 percent foreign transaction fee')).toBeTruthy();
  });

  it('hides the decorative glyph from assistive technology', () => {
    renderInTheme(<Badge label="Coding uncertain" tone="uncertain" glyph="!" testID="badge" />);
    // The glyph is rendered visually but hidden from the accessibility tree, so
    // it only turns up when hidden elements are explicitly included.
    expect(screen.getByText('!', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('!', { includeHiddenElements: false })).toBeNull();
    // The accessible name is the label alone, never the glyph.
    expect(screen.getByTestId('badge').props.accessibilityLabel).toBe('Coding uncertain');
  });
});
