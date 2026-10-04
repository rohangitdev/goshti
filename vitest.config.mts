import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./story-engine', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['story-engine/**/*.test.ts', 'backend/**/*.test.ts', 'src/services/**/*.test.ts'],
    environment: 'node',
  },
});
