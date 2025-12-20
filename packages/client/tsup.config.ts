import { defineConfig } from 'tsup';

export default defineConfig([
  // Main entry (core client - no React dependencies)
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['react', '@tanstack/react-query'],
  },
  // React hooks entry
  {
    entry: ['src/react.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    external: ['react', '@tanstack/react-query'],
  },
]);
