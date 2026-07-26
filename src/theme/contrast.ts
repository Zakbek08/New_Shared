/**
 * WCAG 2.2 contrast maths.
 *
 * Exists so the accessibility claim in `tokens.ts` is asserted by tests instead
 * of being taken on trust. Adding a colour pair that fails AA breaks the build.
 */

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Parses `#RGB` or `#RRGGBB`. Throws on anything else, including `rgba()`. */
export function parseHexColor(hex: string): Rgb {
  const value = hex.trim().replace(/^#/, '');

  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = [...value].map((char) => Number.parseInt(char + char, 16));
    return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
  }

  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
    };
  }

  throw new Error(`Not a hex colour: ${hex}`);
}

/** Relative luminance, per WCAG 2.x. */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number): number => {
    const normalised = value / 255;
    return normalised <= 0.04045 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio between two hex colours, from 1 to 21. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(parseHexColor(foreground));
  const b = relativeLuminance(parseHexColor(background));
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA thresholds. */
export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
/** Non-text contrast for UI components and graphical objects. */
export const AA_NON_TEXT = 3;

export function meetsAaNormalText(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= AA_NORMAL_TEXT;
}

export function meetsAaLargeText(foreground: string, background: string): boolean {
  return contrastRatio(foreground, background) >= AA_LARGE_TEXT;
}
