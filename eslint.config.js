// @ts-check
import js from '@eslint/js';
import globals from 'globals';

// TEMPORARY EXCEPTION (see ADR-0012): typescript-eslint does not support
// typescript@7.0.2 (latest stable typescript-eslint pins `typescript: >=4.8.4
// <6.1.0` as a peer). Rather than shim a second TypeScript install to satisfy
// that peer, TypeScript-aware ESLint integration (@typescript-eslint/parser,
// @typescript-eslint/eslint-plugin) is disabled entirely: `.ts`/`.tsx` files
// are excluded from ESLint's scope below. Type safety on those files is
// enforced by `tsc -b` (mandatory, unaffected) instead. Re-enable by removing
// the `**/*.ts`/`**/*.tsx` ignores and restoring `typescript-eslint` once it
// (or an equivalent) supports TypeScript 7.
export const frameworkImportPatterns = [
  'next',
  'next/*',
  'react',
  'react-dom',
  'react/*',
  '@prisma/client',
  'openid-client',
];

export default [
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.ts',
      '**/*.tsx',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
];
