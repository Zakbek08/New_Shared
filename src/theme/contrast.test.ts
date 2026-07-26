/**
 * Turns the accessibility claim in `tokens.ts` into an assertion.
 *
 * Every foreground/background pair the app actually renders is checked against
 * WCAG 2.2 AA, in both light and dark mode. A token change that breaks contrast
 * breaks the build.
 */
import {
  AA_LARGE_TEXT,
  AA_NORMAL_TEXT,
  contrastRatio,
  parseHexColor,
  relativeLuminance,
} from './contrast';
import { darkColors, lightColors, type ThemeColors } from './tokens';

describe('contrast maths', () => {
  it('parses six-digit and three-digit hex', () => {
    expect(parseHexColor('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHexColor('#000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseHexColor('2A9D8F')).toEqual({ r: 42, g: 157, b: 143 });
  });

  it('rejects anything that is not a hex colour', () => {
    expect(() => parseHexColor('rgba(0,0,0,0.5)')).toThrow();
    expect(() => parseHexColor('teal')).toThrow();
  });

  it('computes the reference luminance values', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });

  it('computes the known black-on-white ratio of 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 2);
  });

  it('is symmetric in its arguments', () => {
    expect(contrastRatio('#2A9D8F', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#2A9D8F'),
      6,
    );
  });
});

/** Pairs that carry body text and must reach 4.5:1. */
const bodyTextPairs = (colors: ThemeColors): readonly [string, string, string][] => [
  ['primary text on background', colors.textPrimary, colors.background],
  ['primary text on surface', colors.textPrimary, colors.surface],
  ['primary text on raised surface', colors.textPrimary, colors.surfaceRaised],
  ['primary text on sunken surface', colors.textPrimary, colors.surfaceSunken],
  ['secondary text on background', colors.textSecondary, colors.background],
  ['secondary text on surface', colors.textSecondary, colors.surface],
  ['secondary text on sunken surface', colors.textSecondary, colors.surfaceSunken],
  ['tertiary text on background', colors.textTertiary, colors.background],
  ['tertiary text on surface', colors.textTertiary, colors.surface],

  // Button labels.
  ['primary button label', colors.onPrimary, colors.primary],
  ['pressed primary button label', colors.onPrimary, colors.primaryPressed],
  ['danger button label', colors.textInverse, colors.danger],
  ['secondary button label', colors.textPrimary, colors.surfaceSunken],
  ['ghost button label', colors.primary, colors.background],

  // Badge and card text. These are the three semantic states the product
  // specifies, so their legibility is not negotiable.
  ['best-value badge text', colors.onSuccessSubtle, colors.successSubtle],
  ['uncertain badge text', colors.onWarningSubtle, colors.warningSubtle],
  ['negative badge text', colors.onDangerSubtle, colors.dangerSubtle],
  ['accent badge text', colors.onPrimarySubtle, colors.primarySubtle],
  ['info badge text', colors.onInfoSubtle, colors.infoSubtle],

  // Body text sitting on a tinted card of each emphasis.
  ['secondary text on best-value card', colors.textSecondary, colors.successSubtle],
  ['secondary text on uncertain card', colors.textSecondary, colors.warningSubtle],
  ['secondary text on negative card', colors.textSecondary, colors.dangerSubtle],
  ['secondary text on accent card', colors.textSecondary, colors.primarySubtle],
];

/** Pairs used for large text or non-text UI, where 3:1 is the AA bar. */
const largeTextPairs = (colors: ThemeColors): readonly [string, string, string][] => [
  ['success accent on background', colors.success, colors.background],
  ['warning accent on background', colors.warning, colors.background],
  ['danger accent on background', colors.danger, colors.background],
  ['success accent on surface', colors.success, colors.surface],
  ['warning accent on surface', colors.warning, colors.surface],
  ['danger accent on surface', colors.danger, colors.surface],
  ['primary accent on surface', colors.primary, colors.surface],
  ['strong border on background', colors.borderStrong, colors.background],
  ['focus ring on background', colors.focusRing, colors.background],
];

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
])('%s theme contrast', (_scheme, colors) => {
  it.each(bodyTextPairs(colors))(
    '%s meets AA for normal text',
    (_label, foreground, background) => {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
    },
  );

  it.each(largeTextPairs(colors))(
    '%s meets AA for large text and UI',
    (_label, foreground, background) => {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_LARGE_TEXT);
    },
  );
});

describe('semantic colours are distinguishable from one another', () => {
  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ])('%s theme keeps success, warning and danger visually distinct', (_scheme, colors) => {
    // Not a WCAG rule, but if the three states look alike the colour language
    // fails at its job. Requiring a measurable luminance or hue gap catches a
    // token edit that quietly collapses two states together.
    const swatches = [colors.success, colors.warning, colors.danger].map((hex) =>
      parseHexColor(hex),
    );

    for (let i = 0; i < swatches.length; i += 1) {
      for (let j = i + 1; j < swatches.length; j += 1) {
        const a = swatches[i]!;
        const b = swatches[j]!;
        const channelDistance = Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
        expect(channelDistance).toBeGreaterThan(60);
      }
    }
  });
});
