import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.integration.test.ts'],
    testTimeout: 60000, // Longer timeout for integration tests
    hookTimeout: 30000,
  },
});
