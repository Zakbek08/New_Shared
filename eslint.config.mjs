import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.expo/**',
      'coverage/**',
      'dist/**',
      'android/**',
      'ios/**',
      '**/*.js',
      '**/*.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        __DEV__: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
      },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowBoolean: true },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-implicit-coercion': 'error',
      'prefer-const': 'error',

      // --- WalletWise security guardrails -------------------------------
      // Sensitive financial data must never reach a log sink. See SECURITY.md.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-globals': [
        'error',
        { name: 'alert', message: 'Use an accessible in-app dialog instead.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Identifier[name=/^(cardNumber|card_number|pan|cvv|cvc|securityCode|pin|bankPassword|fullCardNumber)$/]',
          message:
            'WalletWise must never model full card numbers, CVV/CVC, PINs or bank credentials. See SECURITY.md.',
        },
      ],
    },
  },
  {
    // The redaction layer and its tests are the *enforcement* of the
    // no-credentials rule, so they necessarily name the identifiers everywhere
    // else is forbidden from modelling. Scoped narrowly and deliberately: these
    // two files build and verify the deny list, they do not store anything.
    files: ['src/services/redaction.ts', 'src/services/redaction.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Test files get a looser type-safety profile so fixtures stay readable.
    files: ['**/*.test.ts', '**/*.test.tsx', 'jest.setup.ts', '**/__fixtures__/**'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
      // `jest.mock`'s factory is hoisted above the import statements, so it cannot
      // close over an ESM binding — `require` is the only form that works inside one.
      // Scoped to test setup and test files, where that hoisting is the whole point.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
);
