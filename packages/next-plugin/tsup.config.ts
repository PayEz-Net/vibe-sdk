import { defineConfig } from 'tsup';

export default defineConfig([
  // Main entry (withVibe wrapper)
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['next', 'chokidar'],
  },
  // CLI entry
  {
    entry: ['src/cli.ts'],
    format: ['cjs'],
    sourcemap: true,
    external: ['chokidar'],
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
