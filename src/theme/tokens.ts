/**
 * WalletWise design tokens.
 *
 * A calm, original fintech palette: deep slate-navy neutrals, a teal primary and
 * a restrained semantic set. It deliberately does not resemble any existing
 * financial brand — no borrowed blues, greens or wordmarks.
 *
 * SEMANTIC COLOUR IS LOAD-BEARING and specified by the product:
 *   green — the highest-value option
 *   amber — merchant coding is uncertain
 *   red   — a fee applies, or the card is ineligible
 *
 * Colour is never the only signal. Every coloured element also carries an icon
 * or a text label, so the meaning survives colour-blindness and greyscale.
 *
 * All foreground/background pairs below meet WCAG 2.2 AA (4.5:1 for body text,
 * 3:1 for large text and UI boundaries) in both schemes; the contrast test suite
 * asserts this rather than trusting the comment.
 */

export const palette = {
  // Neutrals — cool slate, warm enough not to look clinical.
  white: '#FFFFFF',
  neutral25: '#F8FAFB',
  neutral50: '#F1F4F6',
  neutral100: '#E3E8EC',
  neutral200: '#C9D1D8',
  neutral300: '#A4B0BA',
  neutral400: '#798895',
  neutral500: '#5A6875',
  neutral600: '#41505E',
  neutral700: '#2C3A47',
  neutral800: '#1B2733',
  neutral900: '#111C26',
  neutral950: '#0B1220',

  // Primary — teal. Distinct from the blue every bank uses.
  // teal600 is the light-mode primary and is chosen to clear 4.5:1 both *under*
  // white button text and *on* the near-white app background, so it works as a
  // filled button and as a ghost-button label. See contrast.test.ts.
  teal100: '#CCEDEA',
  teal300: '#6FC9C1',
  teal500: '#2A9D8F',
  teal600: '#1E7A70',
  teal700: '#1A6A61',
  teal900: '#0E3F3A',

  // Success / best value.
  green100: '#D3EEDC',
  green300: '#7FC99A',
  green500: '#2E8B57',
  green600: '#26744A',
  green700: '#1D5B3A',
  green900: '#0F3321',

  // Caution / uncertain merchant coding.
  amber100: '#FBEBCD',
  amber300: '#EFC978',
  amber500: '#C77D0A',
  amber600: '#A96908',
  amber700: '#875306',
  amber900: '#4A2D03',

  // Fees / ineligible.
  red100: '#F8D9D6',
  red300: '#E99A93',
  red500: '#C0392B',
  red600: '#A32F23',
  red700: '#82251C',
  red900: '#4A1510',

  // Informational accent.
  indigo100: '#DBDEF5',
  indigo300: '#9AA2E3',
  indigo500: '#4C56B8',
  indigo700: '#333B85',
} as const;

/** 4pt base scale. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  /** Default for cards — generous rounding reads as considered, not playful. */
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/**
 * Type scale.
 *
 * `fontSize` values are *base* sizes. Text components scale them with the OS
 * font-size setting via `allowFontScaling`, which is why every line height is
 * expressed as a multiplier rather than a fixed pixel value.
 */
export const typography = {
  display: { fontSize: 32, lineHeightRatio: 1.2, fontWeight: '700' },
  title1: { fontSize: 26, lineHeightRatio: 1.25, fontWeight: '700' },
  title2: { fontSize: 21, lineHeightRatio: 1.3, fontWeight: '600' },
  title3: { fontSize: 18, lineHeightRatio: 1.35, fontWeight: '600' },
  body: { fontSize: 16, lineHeightRatio: 1.5, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeightRatio: 1.5, fontWeight: '600' },
  callout: { fontSize: 15, lineHeightRatio: 1.45, fontWeight: '400' },
  label: { fontSize: 13, lineHeightRatio: 1.4, fontWeight: '600' },
  caption: { fontSize: 13, lineHeightRatio: 1.4, fontWeight: '400' },
  /** Reserved for legal text. Never smaller than this. */
  footnote: { fontSize: 12, lineHeightRatio: 1.45, fontWeight: '400' },
  /** Tabular figures for reward comparisons, so columns line up. */
  numeric: { fontSize: 28, lineHeightRatio: 1.15, fontWeight: '700' },
} as const;

export type TypographyVariant = keyof typeof typography;

/** Minimum touch target, per both Apple HIG and Material guidance. */
export const MIN_TOUCH_TARGET = 44;

export interface ThemeColors {
  /** Page background. */
  readonly background: string;
  /** Raised surface — cards, sheets. */
  readonly surface: string;
  /** A surface on top of a surface. */
  readonly surfaceRaised: string;
  readonly surfaceSunken: string;
  readonly border: string;
  readonly borderStrong: string;

  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textTertiary: string;
  readonly textInverse: string;

  readonly primary: string;
  readonly primaryPressed: string;
  readonly onPrimary: string;
  readonly primarySubtle: string;
  readonly onPrimarySubtle: string;

  /** Highest-value option. */
  readonly success: string;
  readonly successSubtle: string;
  readonly onSuccessSubtle: string;

  /** Merchant coding uncertain. */
  readonly warning: string;
  readonly warningSubtle: string;
  readonly onWarningSubtle: string;

  /** Fees or ineligible rewards. */
  readonly danger: string;
  readonly dangerSubtle: string;
  readonly onDangerSubtle: string;

  readonly info: string;
  readonly infoSubtle: string;
  readonly onInfoSubtle: string;

  readonly focusRing: string;
  readonly overlay: string;
}

export const lightColors: ThemeColors = {
  background: palette.neutral25,
  surface: palette.white,
  surfaceRaised: palette.white,
  surfaceSunken: palette.neutral50,
  border: palette.neutral100,
  // neutral300 is too faint against the light background to clear the 3:1
  // non-text contrast bar, so a *strong* border has to be genuinely darker.
  borderStrong: palette.neutral400,

  textPrimary: palette.neutral900,
  textSecondary: palette.neutral600,
  textTertiary: palette.neutral500,
  textInverse: palette.white,

  primary: palette.teal600,
  primaryPressed: palette.teal700,
  onPrimary: palette.white,
  primarySubtle: palette.teal100,
  onPrimarySubtle: palette.teal900,

  success: palette.green600,
  successSubtle: palette.green100,
  onSuccessSubtle: palette.green900,

  warning: palette.amber600,
  warningSubtle: palette.amber100,
  onWarningSubtle: palette.amber900,

  danger: palette.red600,
  dangerSubtle: palette.red100,
  onDangerSubtle: palette.red900,

  info: palette.indigo500,
  infoSubtle: palette.indigo100,
  onInfoSubtle: palette.indigo700,

  focusRing: palette.teal600,
  overlay: 'rgba(11, 18, 32, 0.55)',
};

export const darkColors: ThemeColors = {
  background: palette.neutral950,
  surface: palette.neutral900,
  surfaceRaised: palette.neutral800,
  surfaceSunken: palette.neutral950,
  border: palette.neutral700,
  borderStrong: palette.neutral500,

  textPrimary: palette.neutral50,
  textSecondary: palette.neutral200,
  textTertiary: palette.neutral300,
  textInverse: palette.neutral950,

  primary: palette.teal300,
  primaryPressed: palette.teal100,
  onPrimary: palette.neutral950,
  primarySubtle: palette.teal900,
  onPrimarySubtle: palette.teal100,

  success: palette.green300,
  successSubtle: palette.green900,
  onSuccessSubtle: palette.green100,

  warning: palette.amber300,
  warningSubtle: palette.amber900,
  onWarningSubtle: palette.amber100,

  danger: palette.red300,
  dangerSubtle: palette.red900,
  onDangerSubtle: palette.red100,

  info: palette.indigo300,
  infoSubtle: palette.indigo700,
  onInfoSubtle: palette.indigo100,

  focusRing: palette.teal300,
  overlay: 'rgba(0, 0, 0, 0.7)',
};

/**
 * Elevation. Dark mode leans on surface lightness rather than shadow, because
 * shadows are close to invisible on a near-black background.
 */
export const shadows = {
  none: {},
  card: {
    shadowColor: palette.neutral950,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: palette.neutral950,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;

export interface Theme {
  readonly scheme: 'light' | 'dark';
  readonly colors: ThemeColors;
  readonly spacing: typeof spacing;
  readonly radii: typeof radii;
  readonly typography: typeof typography;
  readonly shadows: typeof shadows;
}

export const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
  spacing,
  radii,
  typography,
  shadows,
};

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: darkColors,
  spacing,
  radii,
  typography,
  shadows,
};
