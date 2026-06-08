// @ts-check
import { defineConfig, globalIgnores } from 'eslint/config';
import eslintPluginAstro from 'eslint-plugin-astro';
// @ts-expect-error -- eslint-plugin-jsx-a11y ships no type declarations
import jsxA11y from 'eslint-plugin-jsx-a11y';
import tseslint from 'typescript-eslint';

// `flat/jsx-a11y-recommended` registers the `jsx-a11y` plugin with no `files`
// filter of its own, which collides with `jsxA11y.flatConfigs.recommended`
// below ("Cannot redefine plugin jsx-a11y"). Scope it to `.astro` files only —
// React islands get their own jsx-a11y config further down.
const astroJsxA11y = eslintPluginAstro.configs['flat/jsx-a11y-recommended'].map(
  (config) => (config.files ? config : { ...config, files: ['**/*.astro'] }),
);

export default defineConfig([
  globalIgnores(['dist/**', '.astro/**', 'node_modules/**']),
  eslintPluginAstro.configs['flat/recommended'],
  astroJsxA11y,
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
  },
  {
    files: ['**/*.{tsx,jsx}'],
    extends: [jsxA11y.flatConfigs.recommended],
  },
]);
