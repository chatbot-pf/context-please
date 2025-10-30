import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    typescript: true,
    formatters: true,
    markdown: false, // Disable markdown linting to avoid parsing errors
    stylistic: {
      indent: 2,
      quotes: 'single',
    },
  },
  {
    rules: {
      // TypeScript rules
      'ts/no-explicit-any': 'warn',
      'ts/consistent-type-definitions': ['error', 'interface'],
      'ts/explicit-function-return-type': 'off',
      'ts/no-require-imports': 'warn',
      'ts/consistent-type-imports': 'off', // Disabled - requires type-aware linting

      // Code complexity (aligned with STANDARDS.md - but relaxed for existing code)
      'complexity': ['warn', 15], // Relaxed from 10
      'max-depth': ['warn', 5], // Relaxed from 4
      'max-nested-callbacks': ['warn', 4], // Relaxed from 3
      'max-params': ['warn', 5],
      'max-lines-per-function': 'off', // Disabled - too many violations

      // Console statements - allow for now
      'no-console': 'off',

      // Unused variables
      'unused-imports/no-unused-vars': 'warn',
      'ts/no-unused-vars': 'warn',

      // Import rules - relaxed
      'import/first': 'warn',
      'import/newline-after-import': 'warn',

      // Node.js rules - relaxed
      'node/prefer-global/process': 'warn',

      // Style preferences - relaxed
      'style/brace-style': 'warn',
      'style/arrow-parens': ['error', 'always'],

      // Unicorn rules - relaxed
      'unicorn/no-new-array': 'warn',

      // Switch case rules
      'no-case-declarations': 'warn',
    },
  },
  {
    ignores: [
      '**/*.md', // Ignore markdown files completely
      '**/dist',
      '**/node_modules',
      '**/*.d.ts',
      '**/coverage',
      '**/build',
      '**/out',
      '**/.vscode-test',
      '**/evaluation/repos/**',
      '**/python/**',
    ],
  },
)
