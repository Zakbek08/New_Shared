/**
 * Test files must not be reachable as routes.
 *
 * THE DEFECT THIS PINS
 * Expo Router builds its route table with
 * `require.context(app/, true, /^(?:\.\/)(?!…\+api|\+html|…).*\.[tj]sx?$/)` — every `.tsx`
 * under `app/` is a route, and the only exclusions are the `+`-prefixed special files.
 * Test files are not excluded. So the three screen tests colocated beside their screens
 * became routes and were bundled, which:
 *
 *   - broke `expo start` outright, because `@testing-library/react-native` requires
 *     `react-test-renderer`, which is not a dependency of the app. The first screen
 *     rendered "Missing dev dependency" instead of WalletWise; and
 *   - shipped 342 KB of assertion library in the published web build.
 *
 * `metro.config.js` blocks `*.test.*`. `scripts/check-bundle.mjs` asserts the *outcome*
 * against a built artefact, which is the stronger check but only runs after a two-minute
 * export. This asserts the *mechanism* in a second, so the feedback arrives while someone
 * is still editing.
 *
 * Note that the pattern deliberately covers `src/` as well as `app/`. Nothing under `src/`
 * is reachable from a route today, so it changes no output — but `redaction.test.ts` names
 * every credential identifier the codebase is otherwise forbidden from mentioning, and it
 * has no business being one stray import away from a shipped bundle.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');

/** Every file under `dir`, recursively, as repo-relative paths. */
function filesUnder(dir: string): string[] {
  const found: string[] = [];

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        walk(path);
        continue;
      }
      found.push(path.slice(REPO_ROOT.length + 1));
    }
  };

  walk(join(REPO_ROOT, dir));
  return found;
}

/**
 * The resolver block list, read out of the real resolved config.
 *
 * LOADED IN A SUBPROCESS, DELIBERATELY.
 * `require`-ing `metro.config.js` from inside Jest fails: `expo/metro-config` pulls in
 * `yaml`, which ships ESM that jest-expo's transform will not process. Plain Node has no
 * such problem, so the config is loaded there and its patterns come back as strings.
 *
 * The alternative — asserting against the regex written in this file's own source — would
 * pass on a config that defined the right pattern and then forgot to assign it to
 * `resolver.blockList`, which is exactly the mistake worth catching. This reads what Metro
 * would actually read.
 */
function loadBlockList(): RegExp[] {
  const script = `
    const config = require(${JSON.stringify(join(REPO_ROOT, 'metro.config.js'))});
    const list = config && config.resolver && config.resolver.blockList;
    if (!Array.isArray(list)) throw new Error('resolver.blockList is not an array');
    process.stdout.write(JSON.stringify(list.map((p) => [p.source, p.flags])));
  `;

  const output = execFileSync(process.execPath, ['-e', script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  return (JSON.parse(output) as [string, string][]).map(
    ([source, flags]) => new RegExp(source, flags),
  );
}

// Loaded once: the subprocess costs about a second, and every assertion below wants the
// same answer.
const BLOCK_LIST = loadBlockList();

function isBlocked(path: string): boolean {
  return BLOCK_LIST.some((pattern) => pattern.test(path));
}

describe('the app bundle cannot contain a test file', () => {
  const routeCandidates = filesUnder('app').filter((path) => /\.[tj]sx?$/.test(path));

  it('finds the route files, so a broken glob does not vacuously pass', () => {
    // Seven: the layout, the gate, and five screens. If this ever drops to zero, every
    // assertion below would pass while checking nothing — the failure mode a guard like
    // this is most prone to.
    expect(routeCandidates.length).toBeGreaterThanOrEqual(5);
    expect(routeCandidates).toContain('app/purchase.tsx');
  });

  const testRoutes = routeCandidates.filter((path) => /\.test\.[tj]sx?$/.test(path));
  const screenRoutes = routeCandidates.filter((path) => !/\.test\.[tj]sx?$/.test(path));

  // Colocating a screen test beside its screen is allowed — that is the whole reason the
  // block list exists rather than a rule saying "do not put tests here". Each one that
  // does exist must be blocked.
  it.each(testRoutes)('%s is blocked from the bundle', (path) => {
    expect(isBlocked(path)).toBe(true);
  });

  // Asserted against paths that do not exist, so the guard holds for the next test file
  // someone adds rather than only for today's. The trap is a property of Expo Router —
  // every `.tsx` under `app/` becomes a route — not of one commit.
  it.each(['app/purchase.test.tsx', 'app/nested/deep/screen.test.tsx', 'app/legacy.test.jsx'])(
    '%s would be blocked if someone added it',
    (hypotheticalPath) => {
      expect(isBlocked(hypotheticalPath)).toBe(true);
    },
  );

  it('does not block the real screens', () => {
    // The negative control. A block list of `/./` would satisfy every assertion above
    // and ship an app with no routes at all.
    expect(screenRoutes.length).toBeGreaterThan(3);
    for (const screen of screenRoutes) {
      expect(isBlocked(screen)).toBe(false);
    }
  });

  it('blocks test files under src/ too', () => {
    const sourceTests = filesUnder('src').filter((path) => /\.test\.[tj]sx?$/.test(path));

    expect(sourceTests.length).toBeGreaterThan(10);
    for (const path of sourceTests) {
      expect(isBlocked(path)).toBe(true);
    }
  });

  it('does not block ordinary source files', () => {
    for (const path of [
      'src/domain/rewards/evaluate.ts',
      'src/data/marketCards.ts',
      'src/features/local/storage.ts',
    ]) {
      expect(isBlocked(path)).toBe(false);
    }
  });
});
