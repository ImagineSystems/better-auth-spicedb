// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'], // Your entry point
  format: ['cjs', 'esm'],  // Output both CommonJS (.js) and ESM (.mjs)
  dts: true,               // Generate .d.ts type definitions (Crucial!)
  splitting: false,
  sourcemap: true,
  clean: true,             // Clean the dist folder before building
});