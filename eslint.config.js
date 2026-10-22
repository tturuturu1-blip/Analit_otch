export default [
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                window: 'readonly',
                document: 'readonly',
                localStorage: 'readonly',
                console: 'readonly',
                XLSX: 'readonly',
                Chart: 'readonly',
                FileReader: 'readonly',
                Blob: 'readonly',
                URL: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                confirm: 'readonly',
                alert: 'readonly',
                Uint8Array: 'readonly',
                Promise: 'readonly',
                JSON: 'readonly',
                Date: 'readonly',
                Math: 'readonly',
                Object: 'readonly',
                Array: 'readonly',
                Set: 'readonly',
                Map: 'readonly',
                String: 'readonly',
                Number: 'readonly',
                Boolean: 'readonly',
                Error: 'readonly',
                isNaN: 'readonly',
                parseInt: 'readonly',
                parseFloat: 'readonly',
                CustomEvent: 'readonly',
                CSS: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'no-undef': 'error',
            'prefer-const': 'warn',
            'eqeqeq': ['warn', 'smart'],
            'no-var': 'error',
            'no-redeclare': 'error',
            'no-unreachable': 'error'
        }
    }
];