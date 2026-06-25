/**
 * Root ESLint config (TypeScript strict). Type-aware rules (e.g. no-floating-promises)
 * are intentionally left off for MVP velocity — they require a project service across
 * all three workspaces. Re-enable once the build is stable.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { es2022: true, node: true, browser: true },
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  ignorePatterns: ['dist', 'build', 'node_modules', '*.cjs', '*.config.ts', '*.config.js'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
