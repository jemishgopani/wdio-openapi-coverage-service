module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    tsconfigRootDir: __dirname,
    project: false // Disable strict project checking
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier', // Make sure this is last to override other configs
  ],
  env: {
    node: true,
    es6: true,
    jest: true,
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'coverage/',
    '.temp/',
    'build/',
    '*.json',
    '*.yml',
    '*.yaml',
    '*.md',
    '*.log'
  ],
  rules: {
    // Possible errors
    'no-console': 'warn',
    'no-return-await': 'error',
    
    // Best practices
    'curly': ['error', 'all'],
    'eqeqeq': ['error', 'always', { 'null': 'ignore' }],
    'no-unused-expressions': 'error',
    
    // TypeScript specific - relaxed for your project
    '@typescript-eslint/explicit-function-return-type': 'warn', // Downgraded from error
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_?e$'
    }],
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/ban-ts-comment': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'off', // Turn off unsafe argument checks
    '@typescript-eslint/no-unsafe-assignment': 'off', // Turn off unsafe assignment checks
    '@typescript-eslint/no-unsafe-member-access': 'off', // Turn off unsafe member access checks
    '@typescript-eslint/no-unsafe-return': 'off', // Turn off unsafe return checks
    '@typescript-eslint/no-unsafe-call': 'off', // Turn off unsafe call checks
    '@typescript-eslint/naming-convention': [
      'warn', // Downgraded from error
      {
        selector: 'interface',
        format: ['PascalCase'],
        prefix: ['I']
      },
      {
        selector: 'typeAlias',
        format: ['PascalCase'],
        prefix: ['T']
      },
      {
        selector: 'enum',
        format: ['PascalCase'],
        prefix: ['E']
      }
    ],
  },
  overrides: [
    {
      files: ['tests/**/*.ts'],
      rules: {
        // Relaxed rules for test files
        '@typescript-eslint/no-explicit-any': 'off',
        'no-console': 'off',
      }
    }
  ]
}; 