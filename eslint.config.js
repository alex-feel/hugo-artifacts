// ESLint v9 flat config. Covers TypeScript and JavaScript files in this monorepo.
//
// Layout decision: TOP-LEVEL repo-root config so the PostToolUse Edit hook finds
// a config when editing any TS / JS file under modules/, examples/, or shortcodes/.
// Per-module configs are NOT used; flat-config search walks upward to the first
// eslint.config.* and stops, so this single config covers everything.
//
// IMPORTANT: this repo has NO tsconfig.json. Hugo's js.Build (esbuild) handles
// type erasure without invoking tsc. Therefore the typescript-eslint type-aware
// presets (strictTypeChecked, stylisticTypeChecked) -- which require
// parserOptions.projectService and a tsconfig -- are NOT used.
// Use tseslint.configs.recommended (non-type-aware) instead.
//
// Module system split:
//   - .ts files (modules/pwa/assets/pwa/**/*.ts) are ESM; bundled by Hugo's js.Build
//     (esbuild) at build time.
//   - .js files in examples/backend-* and modules/pwa/test/ are CommonJS (Node.js
//     scripts, Playwright test specs, Cloudflare Worker reference). They use
//     require() / module.exports. The @typescript-eslint/no-require-imports rule
//     is DISABLED for .js files because CommonJS is the correct module system
//     for these contexts.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // Global ignores. Equivalent to a top-level .eslintignore.
  {
    ignores: [
      '**/node_modules/**',
      '**/public/**',
      '**/resources/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/.code-review-graph/**',
      '**/.playwright-cli/**',
      '**/.git/**',
      'modules/pwa/test/fixture/public/**',
    ],
  },

  // Base recommended rules for plain JavaScript (.js, .cjs, .mjs).
  js.configs.recommended,

  // Non-type-aware TypeScript rules (no tsconfig required).
  ...tseslint.configs.recommended,

  // Service-worker source: browser + ServiceWorkerGlobalScope globals.
  {
    files: ['modules/pwa/assets/pwa/service-worker/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
  },

  // Page-side TypeScript bundles: browser globals.
  {
    files: ['modules/pwa/assets/pwa/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },

  // Playwright test specs and the Playwright config: Node + browser globals.
  // CommonJS (require/module.exports); disable typescript-eslint's
  // no-require-imports rule because CommonJS is correct here.
  {
    files: [
      'modules/pwa/test/tests/**/*.spec.js',
      'modules/pwa/test/scripts/**/*.js',
      'modules/pwa/test/playwright.config.js',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.commonjs,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Cloudflare Worker reference backend: Worker + browser-ish globals
  // (FetchEvent, Response, crypto.subtle).
  {
    files: ['examples/backend-cloudflare-worker/worker.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
  },

  // Express + Firebase Functions reference backends: CommonJS Node modules.
  // require() / module.exports is the correct pattern for these reference
  // implementations (matches the npm package install/run lifecycle that
  // operators reproduce when copy-pasting these as starting points).
  {
    files: [
      'examples/backend-express/server.js',
      'examples/backend-firebase-functions/functions/index.js',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Permit unused parameters / vars / catch bindings with leading underscore
  // (developer convention). caughtErrorsIgnorePattern is required because the
  // rule's caughtErrors option does not consult argsIgnorePattern by default.
  {
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Locked Phase 7 test artifacts (modules/pwa/test/tests/**) ship with
  // intentionally-unused capture variables (origReady, offlineResp) used as
  // documentation/assertion targets in test code. Per the Phase 8 plan
  // boundary, these files MUST NOT be modified. Relax no-unused-vars for the
  // test directory to avoid false-positives that would force locked-file edits.
  {
    files: ['modules/pwa/test/tests/**/*.spec.js'],
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
);
