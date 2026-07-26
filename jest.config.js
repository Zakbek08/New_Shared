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
  coverageThreshold: {
    global: {
      statements: 40,
      branches: 30,
      functions: 35,
      lines: 40,
    },
  },
};
