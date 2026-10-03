import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/out/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/node_modules/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // NestJS nutzt Decorator-Metadaten: Klassen-Imports dürfen keine Type-Imports werden.
      '@typescript-eslint/consistent-type-imports': 'off',
      'preserve-caught-error': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  prettier,
);
