/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/coverage/'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@app/(.*)$': '<rootDir>/app/$1',
  },
  // `@noble/ciphers` is ESM-only (`"type": "module"`), so Babel has to transform
  // it for Jest's CommonJS runtime. Metro handles it natively at build time.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|@supabase/.*|@noble/.*)',
  ],
  clearMocks: true,
  resetMocks: false,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__fixtures__/**',
    '!src/test-support/**',
    '!src/types/database.ts',
  ],
  // Thresholds are a floor, not a target. The engine's are high because it is
  // pure, total and has no excuse; the global figure is dragged down by UI
  // scaffolding whose behaviour arrives in later phases.
  //
  // Note: a path-specific threshold *removes* those files from the global
  // calculation, so the global numbers below describe everything outside
  // `src/domain/`.
  coverageThreshold: {
    './src/domain/rewards/': {
      statements: 95,
      branches: 92,
      functions: 98,
      lines: 95,
    },
    './src/domain/': {
      statements: 95,
      branches: 92,
      functions: 95,
      lines: 95,
    },
    global: {
      statements: 55,
      branches: 55,
      functions: 40,
      lines: 55,
    },
  },
};
