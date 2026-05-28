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

  // Override: restrict linting to project source globs only
  {
    files: [
      'hooks/**/*.ts',
      'lib/**/*.ts',
      'bin/**/*.ts',
      'tests/**/*.ts',
      'scripts/**/*.ts',
    ],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
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
];
