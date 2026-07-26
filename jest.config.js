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
  // pure, total and has no excuse; the global figure is lower because it includes
  // presentational code whose correctness is asserted through the screens that
  // compose it rather than file by file.
  //
  // Note: a path-specific threshold *removes* those files from the global
  // calculation, so the global numbers below describe everything outside
  // `src/domain/`.
  //
  // RAISED IN PHASE 7 TO SIT JUST UNDER WHAT IS MEASURED.
  // Phase 1–6 used placeholder floors that were far below reality, which meant
  // coverage could fall by twenty points without the build noticing — a floor
  // nothing can touch is not a floor. These are set a point or two under the
  // measured figures at the end of Phase 7 (domain 98.6/94.3/100, everything else
  // 63.5/65.1/47.9), close enough that deleting a test suite fails the build and
  // loose enough that an ordinary refactor does not.
  coverageThreshold: {
    './src/domain/rewards/': {
      statements: 98,
      branches: 93,
      functions: 100,
      lines: 98,
    },
    './src/domain/': {
      statements: 98,
      branches: 94,
      functions: 100,
      lines: 98,
    },
    global: {
      statements: 62,
      branches: 63,
      functions: 46,
      lines: 62,
    },
  },
};
