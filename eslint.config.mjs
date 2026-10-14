import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import ts from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
export default defineConfig([
  { files: ['**/*.{ts,tsx}'], extends: [js.configs.recommended, ...ts.configs.recommended, reactHooks.configs.flat.recommended], rules: { '@typescript-eslint/no-explicit-any': 'error' } },
  { files: ['**/*.mjs'], extends: [js.configs.recommended], languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', fetch: 'readonly', setTimeout: 'readonly' } } },
  globalIgnores(['.next/**', 'node_modules/**', 'next-env.d.ts'])
]);
