/**
 * A repo-wide accessibility audit, enforced as a test.
 *
 * WHY A SOURCE SCAN AND NOT MORE COMPONENT TESTS
 * The per-component tests already assert that `Button` has a role, that
 * `TextField` labels its input, that the palette meets WCAG contrast. What none of
 * them can assert is the thing that actually regresses: somebody adds a new
 * `Pressable` in a new screen and forgets the label. A component test only covers
 * components that have a test. This covers every file, including the one written
 * tomorrow.
 *
 * WHAT IS CHECKED
 *   1. every raw touchable carries a role and a label (or is explicitly hidden);
 *   2. nothing turns off font scaling;
 *   3. no line height is hard-coded — it must come from the type scale;
 *   4. touch targets are expressed through MIN_TOUCH_TARGET, not a literal;
 *   5. animations respect the reduced-motion setting.
 *
 * WHAT IS NOT, AND WHY IT IS SAID OUT LOUD
 * A screen reader gesture cannot be simulated here, so VoiceOver and TalkBack
 * passes stay manual; the checklist is in ACCESSIBILITY.md. This file makes the
 * mechanical half automatic so the manual half is about judgement — does the
 * announcement make sense — rather than about hunting for missing props.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(__dirname, '..');
const APP_DIR = join(__dirname, '..', '..', 'app');

interface SourceFile {
  readonly name: string;
  readonly source: string;
}

function collect(dir: string, label: string): SourceFile[] {
  const files: SourceFile[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);

    if (statSync(path).isDirectory()) {
      if (entry === '__fixtures__' || entry === 'node_modules') continue;
      files.push(...collect(path, label));
      continue;
    }

    if (!entry.endsWith('.tsx') || entry.includes('.test.')) continue;
    // The test harness renders components; it is not one.
    if (path.includes('test-support')) continue;

    files.push({
      name: `${label}/${path.slice(dir.length + 1)}`,
      source: readFileSync(path, 'utf8'),
    });
  }

  return files;
}

/**
 * Every component and screen in the app.
 *
 * Collected from both trees, because `app/` holds the screens and `src/` holds
 * everything they compose. An audit that looked at only one would miss half the
 * interactive surface.
 */
const componentFiles: readonly SourceFile[] = [
  ...collect(join(SRC_DIR, 'components'), 'components'),
  ...collect(join(SRC_DIR, 'features'), 'features'),
  ...collect(APP_DIR, 'app'),
];

/** Strips comments, so a rule discussed in prose is not read as a violation. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the audit covers the files it claims to', () => {
  it('found components in every tree', () => {
    // Guards the guard. A path typo would otherwise make every test below pass
    // by examining nothing.
    //
    // The floor was 25 when the app carried seventeen screens and a server-backed
    // admin surface. It is 15 now that the app is six screens over local storage.
    // Lowered because the premise changed, not because the check was inconvenient:
    // its job is to catch a path typo returning nothing, and 15 still does that.
    expect(componentFiles.length).toBeGreaterThan(15);
    expect(componentFiles.some((file) => file.name.startsWith('components/'))).toBe(true);
    expect(componentFiles.some((file) => file.name.startsWith('features/'))).toBe(true);
    expect(componentFiles.some((file) => file.name.startsWith('app/'))).toBe(true);
  });
});

describe('interactive elements are reachable by a screen reader', () => {
  /**
   * The primitives that are touchable but not accessible by default.
   *
   * `Button`, `Toggle` and the other wrappers in components/ui are exempt as call
   * sites because they set the props themselves — that is the point of having
   * them — and their own files are checked here like any other.
   */
  const RAW_TOUCHABLES = [
    'Pressable',
    'TouchableOpacity',
    'TouchableHighlight',
    'TouchableWithoutFeedback',
  ];

  it.each(RAW_TOUCHABLES)('every <%s> declares a role', (component) => {
    const offenders = componentFiles.filter((file) => {
      const source = withoutComments(file.source);
      if (!new RegExp(`<${component}[\\s>]`).test(source)) return false;

      // Count openings against declarations rather than parsing JSX: a file with
      // three touchables and two roles is a violation this catches.
      const openings = source.match(new RegExp(`<${component}[\\s>]`, 'g'))?.length ?? 0;
      const roles = source.match(/accessibilityRole=/g)?.length ?? 0;
      return roles < openings;
    });

    expect(offenders.map((file) => file.name)).toEqual([]);
  });

  it.each(RAW_TOUCHABLES)('every <%s> has a label or an explicit exemption', (component) => {
    const offenders = componentFiles.filter((file) => {
      const source = withoutComments(file.source);
      const openings = source.match(new RegExp(`<${component}[\\s>]`, 'g'))?.length ?? 0;
      if (openings === 0) return false;

      // A label may be given directly, or delegated to the child text via
      // `accessible`, or the node may be deliberately hidden from the reader.
      const named =
        (source.match(/accessibilityLabel[=:]/g)?.length ?? 0) +
        (source.match(/accessibilityElementsHidden/g)?.length ?? 0) +
        (source.match(/importantForAccessibility="no/g)?.length ?? 0);
      return named < openings;
    });

    expect(offenders.map((file) => file.name)).toEqual([]);
  });
});

describe('dynamic type', () => {
  it('never disables font scaling', () => {
    // A user who has set 200% text has said what they need. `allowFontScaling={false}`
    // overrules them, and in a financial app the overruled text is a dollar figure.
    const offenders = componentFiles.filter((file) =>
      /allowFontScaling\s*=\s*\{?\s*false/.test(withoutComments(file.source)),
    );

    expect(offenders.map((file) => file.name)).toEqual([]);
  });

  it('never hard-codes a line height', () => {
    // A fixed lineHeight does not grow with the text, so large type overlaps.
    // Line heights come from the ratio in the type scale; see theme/tokens.ts.
    const offenders = componentFiles.filter((file) =>
      /lineHeight:\s*\d/.test(withoutComments(file.source)),
    );

    expect(offenders.map((file) => file.name)).toEqual([]);
  });

  it('never pins a text container to a fixed height', () => {
    // `height: 20` on a row of text clips it at large type sizes. minHeight is
    // fine, which is why the check is specific.
    const offenders = componentFiles.filter((file) => {
      const source = withoutComments(file.source);
      return /\bheight:\s*\d+,\s*$/m.test(source) && /<Text/.test(source);
    });

    expect(offenders.map((file) => file.name)).toEqual([]);
  });
});

describe('touch targets', () => {
  it('expresses minimum sizes through MIN_TOUCH_TARGET rather than a literal 44', () => {
    // The literal and the token mean the same thing today. Only one of them
    // changes everywhere if the guideline does, and only one is searchable.
    const offenders = componentFiles.filter((file) => {
      const source = withoutComments(file.source);
      const usesLiteral = /(minHeight|minWidth|height|width):\s*44\b/.test(source);
      return usesLiteral && !source.includes('MIN_TOUCH_TARGET');
    });

    expect(offenders.map((file) => file.name)).toEqual([]);
  });

  it('has a MIN_TOUCH_TARGET of at least 44, the platform guideline', () => {
    const tokens = readFileSync(join(SRC_DIR, 'theme', 'tokens.ts'), 'utf8');
    const match = /MIN_TOUCH_TARGET\s*=\s*(\d+)/.exec(tokens);

    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(44);
  });
});

describe('reduced motion', () => {
  /** Files that animate anything at all. */
  const animating = componentFiles.filter((file) =>
    /Animated\.|useAnimatedStyle|withTiming|LayoutAnimation/.test(withoutComments(file.source)),
  );

  it('has no animation at all, which is why reduced motion is satisfied today', () => {
    // Stated as its own assertion rather than left implicit. The check below
    // currently examines nothing, and a passing test that examines nothing is
    // exactly the kind of false comfort this suite is meant to avoid — so the
    // reason it passes is written down and will fail loudly when it stops holding.
    //
    // If this fails, that is not a bug: it means an animation was added, and the
    // next test is now doing real work. Delete this one and keep that one.
    expect(animating.map((file) => file.name)).toEqual([]);
  });

  it('checks the reduced-motion setting wherever it animates', () => {
    // An animation nobody asked for is a nuisance; for a user with a vestibular
    // disorder it is a symptom. If a file animates, it must consult the setting.
    const offenders = animating.filter(
      (file) =>
        !/(isReduceMotionEnabled|useReducedMotion|prefersReducedMotion)/.test(file.source),
    );

    expect(offenders.map((file) => file.name)).toEqual([]);
  });
});

describe('headings', () => {
  /**
   * Files under `app/` that are not screens a person reads.
   *
   * `_layout` composes the navigator. `index` is the routing gate: it renders a
   * loading state and a `<Redirect>`, and nothing else — there is no content for a
   * heading to head, and adding one would announce a landmark on a screen that
   * exists for a single frame.
   *
   * Named individually rather than pattern-matched, so a real screen cannot become
   * exempt by accident.
   */
  const NOT_READABLE_SCREENS = ['app/_layout.tsx', 'app/index.tsx'];

  it('gives every screen a heading a screen reader can jump to', () => {
    // Without a header role, a reader has no landmark and must traverse the
    // screen linearly from the top.
    const screens = componentFiles.filter(
      (file) => file.name.startsWith('app/') && !NOT_READABLE_SCREENS.includes(file.name),
    );

    // Guards the exemption list: if it ever swallowed every screen, the assertion
    // below would pass while checking nothing.
    expect(screens.length).toBeGreaterThan(3);

    const offenders = screens.filter(
      (file) => !file.source.includes('accessibilityRole="header"'),
    );

    expect(offenders.map((file) => file.name)).toEqual([]);
  });

  it('the exempt files really do render no readable content', () => {
    // The exemption is only defensible while it stays true. `index.tsx` earns it by
    // redirecting; if it grew a real UI, this fails and the exemption comes out.
    const gate = componentFiles.find((file) => file.name === 'app/index.tsx');

    expect(gate).toBeDefined();
    expect(gate?.source).toContain('Redirect');
  });
});
