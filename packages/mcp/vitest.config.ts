import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**/*.test.ts', 'node_modules/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
