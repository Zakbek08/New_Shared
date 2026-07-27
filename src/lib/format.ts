/**
 * Display formatting. Presentation only — never used inside the rewards engine,
 * which deals exclusively in numbers (see `src/domain/rewards/money.ts`).
 */
import type { CapPeriod, RewardType, RewardUnit } from '@/types/database';

import { CAP_PERIOD_LABELS } from '@/domain/enums';

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const wholeUsdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const unitFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

const preciseUnitFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

/** `7.2` becomes `"$7.20"`. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return usdFormatter.format(value);
}

/** `6000` becomes `"$6,000"`. Used for caps and thresholds, where cents are noise. */
export function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? wholeUsdFormatter.format(value) : usdFormatter.format(value);
}

/** `480` becomes `"480 points"`; `1` becomes `"1 point"`. */
export function formatRewardUnits(units: number, unit: RewardUnit): string {
  if (!Number.isFinite(units)) return '—';
  if (unit === 'usd') return formatUsd(units);

  const formatted =
    Number.isInteger(units) || units >= 100
      ? unitFormatter.format(Math.round(units))
      : preciseUnitFormatter.format(units);

  const singular = unit === 'points' ? 'point' : 'mile';
  const isOne = Math.abs(units - 1) < 1e-9;
  return `${formatted} ${isOne ? singular : `${singular}s`}`;
}

/**
 * Renders a reward rate the way the card's terms would express it: `6%` for cash
 * back, `4x` for points and miles.
 */
export function formatRewardRate(rate: number, rewardType: RewardType): string {
  if (!Number.isFinite(rate)) return '—';

  switch (rewardType) {
    case 'cash_back_percent':
      return `${trimTrailingZeros(rate)}%`;
    case 'points_per_dollar':
    case 'miles_per_dollar':
      return `${trimTrailingZeros(rate)}x`;
    case 'statement_credit':
    case 'fixed_amount':
      return formatUsd(rate);
  }
}

/** `"$6,000 per calendar year"`. */
export function formatCap(capAmountUsd: number, period: CapPeriod): string {
  if (period === 'none') return 'No cap';
  return `${formatUsdCompact(capAmountUsd)} ${CAP_PERIOD_LABELS[period]}`;
}

/** `"$1,240 of $6,000 left"`. */
export function formatCapRemaining(remainingUsd: number, capAmountUsd: number): string {
  return `${formatUsdCompact(remainingUsd)} of ${formatUsdCompact(capAmountUsd)} left`;
}

const dayFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  // UTC deliberately. A `date` column arrives as `"2026-07-01"`, which parses to
  // UTC midnight; formatting it in the device's zone would show 30 June to anyone
  // west of Greenwich and make a published-on date look a day early.
  timeZone: 'UTC',
});

/**
 * A calendar day, phrased for a person: `"25 July 2026"`.
 *
 * Returns `null` rather than a placeholder when there is no usable date, so the
 * caller decides whether to omit the line or say something about the absence.
 */
export function formatDay(date: Date | string | null): string | null {
  if (date === null) return null;
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return null;
  return dayFormatter.format(parsed);
}

/**
 * A verification date, phrased for a person: `"Verified 25 July 2026"`.
 * Returns a plain statement of ignorance when there is no date, rather than
 * implying freshness we cannot support.
 */
export function formatVerifiedOn(date: Date | string | null): string {
  if (date === null) return 'Not yet verified';
  const parsed = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(parsed.getTime())) return 'Not yet verified';

  return `Verified ${new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed)}`;
}

/** `1.25` becomes `"1.25¢ per point"`. */
export function formatValuation(centsPerUnit: number, unit: RewardUnit): string {
  if (unit === 'usd') return 'Cash back';
  const noun = unit === 'points' ? 'point' : 'mile';
  return `${trimTrailingZeros(centsPerUnit)}¢ per ${noun}`;
}

/**
 * A card's display name: the user's nickname when they set one, otherwise the
 * product name. Never includes card digits.
 */
export function formatCardName(productName: string, nickname: string | null): string {
  const trimmed = nickname?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : productName;
}

function trimTrailingZeros(value: number): string {
  return Number.parseFloat(value.toFixed(4)).toString();
}
