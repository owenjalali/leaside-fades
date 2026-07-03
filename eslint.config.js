// ESLint flat config (Phase 0 of the upgrade plan).
// Scope: src/**/*.ts(x) only. Non-type-checked presets — type-aware linting
// (projectService) is deliberately deferred to a later phase.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    // Global ignores — never lint these paths.
    ignores: [
      'node_modules/**',
      'dist/**',
      'output/**',
      'coverage/**',
      'leaside_fresha_lite_codex_package/**',
    ],
  },
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    extends: [
      ...tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    rules: {
      // -----------------------------------------------------------------
      // TEMPORARY warnings-first baseline.
      // These rules report violations in the existing codebase; they are
      // downgraded to "warn" (never "off") so `npm run lint` exits 0.
      // Tighten back to the preset "error" severity in later phases as
      // the violations are burned down.
      // -----------------------------------------------------------------
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
);
