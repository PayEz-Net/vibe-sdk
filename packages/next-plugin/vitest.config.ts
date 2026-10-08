import { defineConfig } from 'vitest/config';

// Inline (empty) PostCSS so Vite does not walk parent directories for a
// postcss config - this package has no CSS, and an unrelated config elsewhere
// on disk must not break the test run.
export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
