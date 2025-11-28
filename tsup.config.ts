import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: [
      'better-auth', 
      'better-auth/svelte', 
      'better-auth/client',
      '@authzed/authzed-node', 
      'google-protobuf'       
  ],
});