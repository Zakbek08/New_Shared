/**
 * The condition builder.
 *
 * Two behaviours are load-bearing:
 *
 *   * **An empty condition matches everything.** That is the opposite of what "empty"
 *     suggests, so the builder warns rather than letting an editor create a rule that
 *     silently applies to every purchase.
 *   * **A contradiction is refused, not saved.** A category both required and excluded
 *     produces a rule that can never apply — a rule that looks configured and does
 *     nothing, which is worse than an error.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { CATEGORY } from '@/domain/rewards/__fixtures__/wallet';
import { renderScreen } from '@/test-support/renderScreen';

import { ConditionBuilder, formatRangeLabel } from './ConditionBuilder';

const RULE_ID = '66666666-0000-4000-8000-000000000102';
const MERCHANTS = [
  { id: '44444444-0000-4000-8000-000000000001', displayName: 'DEMO — Greenleaf Market' },
  { id: '44444444-0000-4000-8000-000000000002', displayName: 'DEMO — BulkBarn Warehouse' },
];

function renderBuilder(overrides: { readonly onSubmit?: jest.Mock } = {}) {
  const onSubmit = overrides.onSubmit ?? jest.fn();

  renderScreen(
    <ConditionBuilder
      rewardRuleId={RULE_ID}
      conditionId={null}
      merchants={MERCHANTS}
      onSubmit={onSubmit}
      onCancel={jest.fn()}
      testID="builder"
    />,
  );

  return onSubmit;
}

describe('formatRangeLabel', () => {
  it('reads a single-code range as one code', () => {
    expect(formatRangeLabel([5411, 5411])).toBe('5411');
  });

  it('reads a span as a span', () => {
    expect(formatRangeLabel([5811, 5814])).toBe('5811–5814');
  });
});

describe('the builder states the logic it implements', () => {
  it('says every filled field must be satisfied, and all conditions together', () => {
    renderBuilder();

    expect(
      screen.getByText(/Every field you fill in must be satisfied for the rule to apply/),
    ).toBeTruthy();
  });

  it('warns while nothing is set, because that matches every purchase', () => {
    renderBuilder();

    expect(screen.getByTestId('condition-unconstrained')).toBeTruthy();
  });

  it('drops the warning once a constraint is set', () => {
    renderBuilder();

    fireEvent.press(screen.getByTestId('condition-include-category-grocery'));

    expect(screen.queryByTestId('condition-unconstrained')).toBeNull();
  });

  it('says MCC ranges are inclusive at both ends', () => {
    renderBuilder();

    expect(screen.getByText(/Ranges are inclusive at both ends/)).toBeTruthy();
  });
});

describe('building a condition', () => {
  it('submits the categories that were chosen', () => {
    const onSubmit = renderBuilder();

    fireEvent.press(screen.getByTestId('condition-include-category-grocery'));
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        rewardRuleId: RULE_ID,
        includedCategoryIds: [CATEGORY.grocery],
      }),
    );
  });

  it('toggles a category off when pressed twice', () => {
    const onSubmit = renderBuilder();

    fireEvent.press(screen.getByTestId('condition-include-category-grocery'));
    fireEvent.press(screen.getByTestId('condition-include-category-grocery'));
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ includedCategoryIds: [] }));
  });

  it('adds a single MCC as an inclusive one-code range', () => {
    // Typing 5411 with no second code means exactly 5411, not "5411 and up".
    const onSubmit = renderBuilder();

    fireEvent.changeText(screen.getByTestId('condition-range-from'), '5411');
    fireEvent.press(screen.getByTestId('condition-range-add'));
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ includedMccRanges: [[5411, 5411]] }),
    );
  });

  it('adds a span of codes', () => {
    const onSubmit = renderBuilder();

    fireEvent.changeText(screen.getByTestId('condition-range-from'), '5811');
    fireEvent.changeText(screen.getByTestId('condition-range-to'), '5814');
    fireEvent.press(screen.getByTestId('condition-range-add'));

    expect(screen.getByTestId('condition-range-5811–5814')).toBeTruthy();

    fireEvent.press(screen.getByTestId('condition-save'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ includedMccRanges: [[5811, 5814]] }),
    );
  });

  it('refuses a range whose first code is higher than the second', () => {
    renderBuilder();

    fireEvent.changeText(screen.getByTestId('condition-range-from'), '5814');
    fireEvent.changeText(screen.getByTestId('condition-range-to'), '5811');
    fireEvent.press(screen.getByTestId('condition-range-add'));

    expect(screen.getByText(/must not be higher than/)).toBeTruthy();
  });

  it('refuses a code outside the MCC range', () => {
    // The field's `maxLength` stops a human typing this, but a paste — or a test —
    // can get past it, so the schema bound is the thing that actually holds.
    renderBuilder();

    fireEvent.changeText(screen.getByTestId('condition-range-from'), '99999');
    fireEvent.press(screen.getByTestId('condition-range-add'));

    expect(screen.queryByTestId('condition-range-99999')).toBeNull();
    expect(screen.getByText(/9999/)).toBeTruthy();
  });

  it('removes a range when its chip is pressed', () => {
    const onSubmit = renderBuilder();

    fireEvent.changeText(screen.getByTestId('condition-range-from'), '5411');
    fireEvent.press(screen.getByTestId('condition-range-add'));
    fireEvent.press(screen.getByTestId('condition-range-5411'));
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ includedMccRanges: [] }));
  });

  it('excludes a merchant, which is how a warehouse club is kept out', () => {
    const onSubmit = renderBuilder();

    fireEvent.press(screen.getByTestId('condition-include-category-grocery'));
    fireEvent.press(
      screen.getByTestId('condition-exclude-merchant-44444444-0000-4000-8000-000000000002'),
    );
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        excludedMerchantIds: ['44444444-0000-4000-8000-000000000002'],
      }),
    );
  });

  it('adds a country code, uppercased', () => {
    const onSubmit = renderBuilder();

    fireEvent.changeText(screen.getByTestId('condition-country-input'), 'us');
    fireEvent.press(screen.getByTestId('condition-country-add'));
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ includedCountryCodes: ['US'] }),
    );
  });

  it('restricts to a payment method, distinguishing a phone from a card', () => {
    const onSubmit = renderBuilder();

    fireEvent.press(screen.getByTestId('condition-payment-apple_pay'));
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ includedPaymentMethods: ['apple_pay'] }),
    );
  });

  it('sets a channel', () => {
    const onSubmit = renderBuilder();

    fireEvent.press(screen.getByTestId('condition-channel-online'));
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ channel: 'online' }));
  });

  it('coerces the amount bounds to numbers', () => {
    const onSubmit = renderBuilder();

    fireEvent.changeText(screen.getByTestId('condition-min-amount'), '25');
    fireEvent.changeText(screen.getByTestId('condition-max-amount'), '500');
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ minAmountUsd: 25, maxAmountUsd: 500 }),
    );
  });
});

describe('contradictions are refused rather than saved', () => {
  it('refuses a category that is both required and excluded', () => {
    // Such a rule can never apply. Saving it would produce something that looks
    // configured and does nothing.
    const onSubmit = renderBuilder();

    fireEvent.press(screen.getByTestId('condition-include-category-grocery'));
    fireEvent.press(screen.getByTestId('condition-exclude-category-grocery'));
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByTestId('condition-errors')).toBeTruthy();
    expect(screen.getByText(/could never apply/)).toBeTruthy();
  });

  it('refuses a merchant that is both required and excluded', () => {
    const onSubmit = renderBuilder();

    const merchantId = '44444444-0000-4000-8000-000000000001';
    fireEvent.press(screen.getByTestId(`condition-include-merchant-${merchantId}`));
    fireEvent.press(screen.getByTestId(`condition-exclude-merchant-${merchantId}`));
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/cannot be both required and excluded/)).toBeTruthy();
  });

  it('refuses a maximum below the minimum', () => {
    const onSubmit = renderBuilder();

    fireEvent.changeText(screen.getByTestId('condition-min-amount'), '500');
    fireEvent.changeText(screen.getByTestId('condition-max-amount'), '25');
    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/must not be below the minimum/)).toBeTruthy();
  });

  it('accepts an empty condition, having warned about it', () => {
    // Deliberately allowed: a rule that applies to every purchase is legitimate — a
    // card's base rule is exactly that. The warning informs; it does not block.
    const onSubmit = renderBuilder();

    fireEvent.press(screen.getByTestId('condition-save'));

    expect(onSubmit).toHaveBeenCalled();
  });
});
