// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: [
            '**/dist/**',
            '**/build/**',
            '**/.turbo/**',
            '**/coverage/**',
            '**/node_modules/**',
            '**/*.config.js',
            '**/dev-dist/**',
            'apps/desktop/src-tauri/target/**',
            'apps/mobile/.expo/**',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/consistent-type-imports': 'error',
            'no-console': ['warn', { allow: ['warn', 'error'] }],
        },
    },
    {
        // `apps/web` is the only React codebase in this monorepo - scoped here instead of
        // repo-wide so `apps/api`'s NestJS code (no hooks, no React) never sees these rules.
        files: ['apps/web/**/*.{ts,tsx}'],
        plugins: { 'react-hooks': reactHooks },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
        },
    },
    {
        // Plain Node scripts (dev tooling, smoke tests, generators).
        files: ['**/*.mjs'],
        languageOptions: {
            globals: {
                console: 'readonly',
                process: 'readonly',
                fetch: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                URL: 'readonly',
            },
        },
        rules: { 'no-console': 'off' },
    },
);
