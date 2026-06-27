import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/events/event-catalog.ts',
    'src/schemas/common.ts',
    'src/schemas/referral.ts',
  ],
  format: ['esm'],
  dts: true,
  sourcemap: false,
  clean: true,
  treeshake: true,
  target: 'node22',
  outDir: 'dist',
  deps: {
    skipNodeModulesBundle: true,
    neverBundle: [/^@classytic\//, /^mongoose$/, /^zod\//, /^zod$/],
  },
});
