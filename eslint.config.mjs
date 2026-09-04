import tsPlugin from '@typescript-eslint/eslint-plugin';

// flat/recommended is an array of 3 config objects:
//   [0] languageOptions (parser + sourceType)
//   [1] files: ['**/*.ts', '**/*.tsx', ...] + rules (turn off conflicting ESLint rules)
//   [2] rules (TS-specific recommended rules)
// We spread it as-is and prepend an ignores block.
const recommended = tsPlugin.configs['flat/recommended'];

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

  // Spread the full flat/recommended array (parser + plugins + rules)
  ...recommended,

  ...tsPlugin.configs['flat/recommended-type-checked'].map((config) => ({
    ...config,
    files: ['**/*.ts'],
  })),

  // Override: restrict linting to project source globs only
  {
    files: ['hooks/**/*.ts', 'lib/**/*.ts', 'bin/**/*.ts', 'tests/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
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
    files: ['bin/**/*.ts', 'hooks/**/*.ts', 'scripts/**/*.ts', 'lib/state/**/*.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'error' },
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
      'no-param-reassign': ['error', { props: true }],
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
