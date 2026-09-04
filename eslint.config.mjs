import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  // Ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.build/**',
      'feynman-rules-workspace/**',
      'eval/**',
      'evals/**',
    ],
  },

  // These opinionated presets are part of the recorded project contract.
  // Lockfile updates must review changes to the effective rule set.
  ...['flat/strict-type-checked', 'flat/stylistic-type-checked'].flatMap((name) =>
    tsPlugin.configs[name].map((config) => ({ ...config, files: ['**/*.ts'] })),
  ),

  // Override: restrict linting to project source globs only
  {
    files: ['hooks/**/*.ts', 'lib/**/*.ts', 'bin/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      'no-param-reassign': ['error', { props: true }],
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowAny: false,
          allowString: true,
          allowNumber: true,
          allowNullableObject: true,
          allowNullableBoolean: false,
          allowNullableString: false,
          allowNullableNumber: false,
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: false },
      ],
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/no-confusing-void-expression': 'error',
      '@typescript-eslint/no-misused-spread': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowRegExp: false,
          allowNever: false,
        },
      ],
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      // Underscore-prefixed identifiers are intentional "unused" markers;
      // unused catch bindings (`catch (e) {}`) are an accepted pattern.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
    },
  },
  {
    files: ['bin/**/*.ts', 'hooks/**/*.ts', 'scripts/**/*.ts', 'lib/**/*.ts'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'error' },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      // node:test owns test registration and reports rejected test callbacks.
      // Other promises, including asynchronous test helpers, must be handled.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it', 'test'] },
          ],
        },
      ],
    },
  },
  {
    files: ['lib/**/*.ts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/prefer-readonly-parameter-types': [
        'error',
        { ignoreInferredTypes: true },
      ],
      // Core modules can depend only on statically visible sibling core modules.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(?!\\./[\\w-]+\\.ts$|\\.\\./(?:lint|state)/[\\w-]+\\.ts$)',
              message: 'Core imports must stay within lib; put I/O in an adapter.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'process',
        'console',
        'fetch',
        'require',
        'globalThis',
        'global',
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportExpression',
          message: 'Core dependencies must be static so architecture checks can inspect them.',
        },
      ],
    },
  },
];
