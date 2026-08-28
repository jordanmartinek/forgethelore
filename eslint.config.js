// ESLint flat config (v9+). Dependency-free so it runs with just eslint
// installed (no @eslint/js or globals packages required). The app itself ships
// zero runtime deps; this is dev-only tooling. Run with: npx eslint .

const browserGlobals = {
  window: 'readonly', document: 'readonly', localStorage: 'readonly',
  indexedDB: 'readonly', navigator: 'readonly', console: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
  clearInterval: 'readonly', fetch: 'readonly', requestAnimationFrame: 'readonly',
  AbortController: 'readonly', Blob: 'readonly', URL: 'readonly', FileReader: 'readonly',
  CSS: 'readonly', Node: 'readonly', Element: 'readonly', Response: 'readonly',
  alert: 'readonly', confirm: 'readonly', prompt: 'readonly', getComputedStyle: 'readonly',
};

const commonRules = {
  'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
  'no-undef': 'error',
  'no-empty': ['warn', { allowEmptyCatch: true }],
};

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: browserGlobals },
    rules: commonRules,
  },
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { self: 'readonly', caches: 'readonly', fetch: 'readonly', Response: 'readonly', URL: 'readonly', console: 'readonly', clients: 'readonly' },
    },
    rules: commonRules,
  },
  {
    files: ['scripts/**/*.mjs', 'server.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', globalThis: 'writable', setTimeout: 'readonly', Buffer: 'readonly' },
    },
    rules: commonRules,
  },
  {
    ignores: ['node_modules/**', 'public/**', 'types/**'],
  },
];
