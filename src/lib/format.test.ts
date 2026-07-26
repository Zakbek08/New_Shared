import {
  formatCap,
  formatCapRemaining,
  formatCardName,
  formatRewardRate,
  formatRewardUnits,
  formatUsd,
  formatUsdCompact,
  formatValuation,
  formatVerifiedOn,
} from './format';

describe('formatUsd', () => {
  it('always shows two decimal places', () => {
    expect(formatUsd(7.2)).toBe('$7.20');
    expect(formatUsd(6)).toBe('$6.00');
    expect(formatUsd(0)).toBe('$0.00');
  });

  it('groups thousands', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50');
  });

  it('renders a placeholder rather than "NaN" for invalid input', () => {
    expect(formatUsd(Number.NaN)).toBe('—');
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatUsdCompact', () => {
  it('drops cents for round figures, which is how caps are written', () => {
    expect(formatUsdCompact(6000)).toBe('$6,000');
  });

  it('keeps cents when they matter', () => {
    expect(formatUsdCompact(1240.5)).toBe('$1,240.50');
  });
});

describe('formatRewardUnits', () => {
  it('formats cash back as dollars', () => {
    expect(formatRewardUnits(7.2, 'usd')).toBe('$7.20');
  });

  it('formats points and miles with the right noun', () => {
    expect(formatRewardUnits(480, 'points')).toBe('480 points');
    expect(formatRewardUnits(360, 'miles')).toBe('360 miles');
  });

  it('uses the singular for exactly one', () => {
    expect(formatRewardUnits(1, 'points')).toBe('1 point');
    expect(formatRewardUnits(1, 'miles')).toBe('1 mile');
  });

  it('keeps two decimals for small fractional amounts', () => {
    expect(formatRewardUnits(64.755, 'points')).toBe('64.76 points');
  });

  it('rounds large amounts to whole units', () => {
    expect(formatRewardUnits(1234.56, 'points')).toBe('1,235 points');
  });
});

describe('formatRewardRate', () => {
  it('renders cash back as a percentage', () => {
    expect(formatRewardRate(6, 'cash_back_percent')).toBe('6%');
    expect(formatRewardRate(1.5, 'cash_back_percent')).toBe('1.5%');
  });

  it('renders points and miles as a multiplier', () => {
    expect(formatRewardRate(4, 'points_per_dollar')).toBe('4x');
    expect(formatRewardRate(3, 'miles_per_dollar')).toBe('3x');
  });

  it('trims trailing zeros so 6.000000 reads as 6%', () => {
    expect(formatRewardRate(6.0, 'cash_back_percent')).toBe('6%');
    expect(formatRewardRate(10.0, 'points_per_dollar')).toBe('10x');
  });

  it('renders a statement credit as a dollar amount', () => {
    expect(formatRewardRate(50, 'statement_credit')).toBe('$50.00');
  });
});

describe('formatCap', () => {
  it('phrases a cap with its period', () => {
    expect(formatCap(6000, 'calendar_year')).toBe('$6,000 per calendar year');
    expect(formatCap(1500, 'quarterly')).toBe('$1,500 per quarter');
    expect(formatCap(1000, 'monthly')).toBe('$1,000 per month');
  });

  it('says so plainly when there is no cap', () => {
    expect(formatCap(0, 'none')).toBe('No cap');
  });
});

describe('formatCapRemaining', () => {
  it('shows progress against the cap', () => {
    expect(formatCapRemaining(1240, 6000)).toBe('$1,240 of $6,000 left');
  });

  it('shows an exhausted cap as zero, not as empty', () => {
    expect(formatCapRemaining(0, 1500)).toBe('$0 of $1,500 left');
  });
});

describe('formatVerifiedOn', () => {
  it('formats a verification date in UTC, so it does not shift by timezone', () => {
    // en-US order, matching the rest of the app's US-dollar framing. Pinning the
    // timezone to UTC is the point of the assertion: a midnight-UTC date must
    // not slip to the previous day for a user west of Greenwich.
    expect(formatVerifiedOn('2026-07-01T00:00:00.000Z')).toBe('Verified July 1, 2026');
    expect(formatVerifiedOn(new Date('2024-01-15T00:00:00.000Z'))).toBe(
      'Verified January 15, 2024',
    );
  });

  it('states plainly that a rate is unverified rather than implying freshness', () => {
    expect(formatVerifiedOn(null)).toBe('Not yet verified');
    expect(formatVerifiedOn('not a date')).toBe('Not yet verified');
  });
});

describe('formatValuation', () => {
  it('renders a per-point value', () => {
    expect(formatValuation(1.25, 'points')).toBe('1.25¢ per point');
    expect(formatValuation(1.3, 'miles')).toBe('1.3¢ per mile');
  });

  it('describes cash back as cash back rather than a valuation', () => {
    expect(formatValuation(1, 'usd')).toBe('Cash back');
  });
});

describe('formatCardName', () => {
  it('prefers the nickname when the user set one', () => {
    expect(formatCardName('DEMO — Northwind Everyday Grocery Card', 'Groceries')).toBe(
      'Groceries',
    );
  });

  it('falls back to the product name for a blank or whitespace nickname', () => {
    expect(formatCardName('Northwind Grocery', null)).toBe('Northwind Grocery');
    expect(formatCardName('Northwind Grocery', '')).toBe('Northwind Grocery');
    expect(formatCardName('Northwind Grocery', '   ')).toBe('Northwind Grocery');
  });
});
