/**
 * Global Jest setup: a deterministic environment, and mocks for the two native modules
 * that would otherwise reach for a bridge that does not exist under Jest.
 */
import '@testing-library/react-native';

process.env['EXPO_PUBLIC_ENVIRONMENT'] = 'test';

/**
 * AsyncStorage's own in-memory mock.
 *
 * Used rather than hand-rolled, because the library ships a mock that matches its own
 * semantics — including the ones easy to get wrong by hand, like `multiGet` returning
 * key/value pairs and a missing key resolving to `null` rather than throwing.
 *
 * `require` rather than an import, because `jest.mock`'s factory is hoisted above the
 * import statements and so cannot close over an ESM binding. The lint rule is disabled
 * for this file in `eslint.config.mjs` for exactly that reason.
 *
 * It is genuinely in-memory, so `storage.test.ts` clears it between tests.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    dismiss: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  Link: 'Link',
  Stack: { Screen: 'Stack.Screen' },
  Tabs: { Screen: 'Tabs.Screen' },
  Redirect: 'Redirect',
  SplashScreen: {
    preventAutoHideAsync: jest.fn(),
    hideAsync: jest.fn(),
  },
}));
