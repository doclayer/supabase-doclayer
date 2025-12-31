import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'lib/index.ts',
    'doclayer-client': 'lib/doclayer-client.ts',
    'use-doclayer-realtime': 'lib/use-doclayer-realtime.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', '@supabase/supabase-js'],
});
