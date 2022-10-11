module.exports = {
  root: true,
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],

      env: {
        browser: true,
        es6: true,
      },
      globals: {
        CindyJS: 'readonly',
      },
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module',
        ecmaFeatures: {},
        project: 'tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      plugins: ['@typescript-eslint/eslint-plugin'],
      extends: [
        'eslint:recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'plugin:compat/recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:@typescript-eslint/recommended-requiring-type-checking',
        'prettier',
      ],
      rules: {
        'no-underscore-dangle': [
          'error',
          {
            allowAfterThis: true,
          },
        ],

        'import/prefer-default-export': 'off',
      },
    },
  ],
};
