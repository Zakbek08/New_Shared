/**
 * The bulk-import panel.
 *
 * The property under test is "look before you leap": pasting text writes nothing,
 * checking writes nothing, and the import button appears only after the report — with
 * the count of *valid* rows on it, so an editor cannot press a button believing it will
 * import rows the report just rejected.
 */
import { fireEvent, screen } from '@testing-library/react-native';

import { renderScreen } from '@/test-support/renderScreen';

import { BulkImportPanel } from './BulkImportPanel';

const PRODUCT_ID = '55555555-0000-4000-8000-000000000001';

function ruleJson(overrides: Record<string, unknown> = {}) {
  return {
    cardProductId: PRODUCT_ID,
    label: '6% cash back at US supermarkets',
    kind: 'category_bonus',
    rewardType: 'cash_back_percent',
    rewardUnit: 'usd',
    baseRate: 6,
    bonusRate: 0,
    priority: 100,
    stackGroup: 'category',
    capAmount: 6000,
    capPeriod: 'calendar_year',
    capAppliesTo: 'spend',
    ...overrides,
  };
}

function renderPanel(onImport = jest.fn()) {
  renderScreen(<BulkImportPanel onImport={onImport} testID="import" />);
  return onImport;
}

describe('before anything is checked', () => {
  it('says nothing is written until the report has been seen', () => {
    renderPanel();

    expect(screen.getByText(/Nothing is written until you have seen the report/)).toBeTruthy();
  });

  it('offers no import button', () => {
    renderPanel();

    expect(screen.queryByTestId('import-submit')).toBeNull();
  });

  it('disables the check button while the box is empty', () => {
    renderPanel();

    expect(screen.getByTestId('import-check').props.accessibilityState?.disabled).toBe(true);
  });
});

describe('checking a good batch', () => {
  it('reports every row as ready and offers to import them', () => {
    const onImport = renderPanel();

    fireEvent.changeText(
      screen.getByTestId('import-text'),
      JSON.stringify([ruleJson(), ruleJson({ label: 'A second rule' })]),
    );
    fireEvent.press(screen.getByTestId('import-check'));

    expect(screen.getByText('All 2 rules are ready to import.')).toBeTruthy();
    expect(screen.getByText('2 ready')).toBeTruthy();

    fireEvent.press(screen.getByTestId('import-submit'));
    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onImport.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it('writes nothing when only checking', () => {
    const onImport = renderPanel();

    fireEvent.changeText(screen.getByTestId('import-text'), JSON.stringify([ruleJson()]));
    fireEvent.press(screen.getByTestId('import-check'));

    expect(onImport).not.toHaveBeenCalled();
  });

  it('accepts a single pasted rule without brackets', () => {
    renderPanel();

    fireEvent.changeText(screen.getByTestId('import-text'), JSON.stringify(ruleJson()));
    fireEvent.press(screen.getByTestId('import-check'));

    expect(screen.getByText('1 rule is ready to import.')).toBeTruthy();
    expect(screen.getByText('Import 1 rule')).toBeTruthy();
  });
});

describe('checking a mixed batch', () => {
  const paste = () => {
    fireEvent.changeText(
      screen.getByTestId('import-text'),
      JSON.stringify([ruleJson(), ruleJson({ label: 'x', baseRate: -3 })]),
    );
    fireEvent.press(screen.getByTestId('import-check'));
  };

  it('states the split so the rejected row cannot be missed', () => {
    renderPanel();
    paste();

    expect(
      screen.getByText('1 of 2 rules are ready to import. 1 row needs fixing first.'),
    ).toBeTruthy();
    expect(screen.getByText('1 rejected')).toBeTruthy();
  });

  it('names the row, the field and the reason', () => {
    renderPanel();
    paste();

    expect(screen.getByTestId('import-row-1')).toBeTruthy();
    expect(screen.getByText(/Row 2:/)).toBeTruthy();
    expect(screen.getByTestId('import-row-1').props.accessibilityLabel as string).toMatch(
      /Row 2 rejected/,
    );
  });

  it('offers to import only the valid rows, with the count on the button', () => {
    const onImport = renderPanel();
    paste();

    expect(screen.getByText('Import 1 rule')).toBeTruthy();

    fireEvent.press(screen.getByTestId('import-submit'));
    expect(onImport.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it('says the rejected rows are left alone', () => {
    renderPanel();
    paste();

    expect(screen.getByText(/are not written and not\s+changed/)).toBeTruthy();
  });
});

describe('checking a batch that cannot be imported at all', () => {
  it('refuses rather than offering a no-op import', () => {
    renderPanel();

    fireEvent.changeText(
      screen.getByTestId('import-text'),
      JSON.stringify([ruleJson({ label: 'x' })]),
    );
    fireEvent.press(screen.getByTestId('import-check'));

    expect(screen.getByText(/The rule cannot be imported/)).toBeTruthy();
    expect(screen.getByTestId('import-submit').props.accessibilityState?.disabled).toBe(true);
  });
});

describe('malformed input', () => {
  it('explains the expected shape instead of quoting a parser error', () => {
    renderPanel();

    fireEvent.changeText(screen.getByTestId('import-text'), '{not json');
    fireEvent.press(screen.getByTestId('import-check'));

    expect(screen.getByText(/Expected an array of rule objects/)).toBeTruthy();
    expect(screen.queryByTestId('import-report')).toBeNull();
  });
});

describe('editing after a check', () => {
  it('drops the stale report, which would describe rows that no longer exist', () => {
    renderPanel();

    fireEvent.changeText(screen.getByTestId('import-text'), JSON.stringify([ruleJson()]));
    fireEvent.press(screen.getByTestId('import-check'));
    expect(screen.getByTestId('import-report')).toBeTruthy();

    fireEvent.changeText(screen.getByTestId('import-text'), '[]');
    expect(screen.queryByTestId('import-report')).toBeNull();
  });
});

describe('after a successful import', () => {
  it('confirms the count and says the rules are unverified', () => {
    // Imported rules have been read by nobody. Saying so stops an editor assuming a
    // bulk import is a bulk verification.
    renderScreen(<BulkImportPanel onImport={jest.fn()} importedCount={3} testID="import" />);

    expect(screen.getByText(/Imported 3 rules/)).toBeTruthy();
    expect(
      screen.getByText(/unverified until someone checks it against a source/),
    ).toBeTruthy();
  });
});
