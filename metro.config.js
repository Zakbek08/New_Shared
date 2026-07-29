// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * Keep test files out of the app bundle.
 *
 * WHY THIS IS NEEDED
 * Expo Router builds its route table with `require.context(app/, /\.[tj]sx?$/)` — every
 * `.tsx` under `app/` becomes a route, and the matcher excludes only `+api`, `+html`,
 * `+middleware` and `+native-intent`. It does not exclude test files. So the three screen
 * tests colocated beside their screens (`app/admin/catalog.test.tsx` and the two under
 * `app/recommendations/`) were being registered as routes and pulled into the bundle,
 * dragging `@testing-library/react-native` and `react-test-renderer` in behind them.
 *
 * On the dev server that is fatal at boot: `react-test-renderer` is not a dependency of
 * this app, so the first screen renders "Missing dev dependency" instead of WalletWise.
 *
 * WHY EXTEND THE LIST RATHER THAN MOVE THE FILES
 * Metro's own default already blocks `__tests__/` directories for exactly this reason, so
 * the mechanism is the intended one — the default just assumes the directory convention
 * rather than the `.test.` suffix convention. Extending it keeps each screen test beside
 * the screen it tests, which is where a reviewer looks for it.
 *
 * This applies to `src/` too. Nothing there is reachable from a route today, so it changes
 * no output — but a shipped bundle should not be one stray import away from carrying test
 * fixtures, and `redaction.test.ts` in particular names every credential identifier the
 * rest of the codebase is forbidden from mentioning.
 *
 * Jest does not read this file, so the tests themselves are unaffected. `bundle.test.ts`
 * asserts this pattern still covers every test file under `app/`, because a regression here
 * presents as a broken app rather than as a configuration mistake.
 */
const existingBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : [config.resolver.blockList].filter(Boolean);

config.resolver.blockList = [...existingBlockList, /\.test\.[tj]sx?$/];

module.exports = config;
