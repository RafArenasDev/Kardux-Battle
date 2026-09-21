// @ts-check
import js from '@eslint/js';
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
);
