module.exports = {
  root: true,
  env: {
    browser: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {},
  },
  extends: [
    'eslint:recommended',
    'airbnb-base',
    'plugin:compat/recommended',
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
  overrides: [
    {
      files: ['**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2022,
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
    },
  ],
};
