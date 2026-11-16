import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import architecture from './tooling/eslint/architecture-plugin.js';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      'tooling/fixtures/**',
      'apps/ai-service/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/src/modules/**/*.{ts,tsx,js}'],
    plugins: { architecture },
    rules: {
      'architecture/module-boundaries': 'error',
      'architecture/models-only-in-repositories': 'error',
    },
  },
  prettier,
);
