/**
 * Global Jest setup.
 *
 * Phase 1 keeps this deliberately small: deterministic environment values and
 * mocks for the native modules that would otherwise touch a real device.
 */
import '@testing-library/react-native';

// Deterministic, obviously-fake values. Never place real credentials here.
process.env['EXPO_PUBLIC_SUPABASE_URL'] = 'http://localhost:54321';
process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] = 'test-anon-key-not-a-real-secret';
process.env['EXPO_PUBLIC_ENVIRONMENT'] = 'test';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    isAvailableAsync: jest.fn(() => Promise.resolve(true)),
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

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
