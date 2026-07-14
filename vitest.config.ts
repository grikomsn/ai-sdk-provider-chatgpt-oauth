import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    exclude: [...configDefaults.exclude, 'oauth-web-example/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/**', 'dist/**', '**/*.config.ts', 'examples/**'],
      thresholds: {
        statements: 75,
        branches: 60,
        functions: 80,
        lines: 75,
      },
    },
  },
});
