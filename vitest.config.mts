import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['story-engine/**/*.test.ts', 'backend/**/*.test.ts'],
    environment: 'node',
  },
});
