import { defineConfig } from 'tsdown';

export default defineConfig({
  // Validate the PUBLISHED package shape (exports/main/types resolution against
  // the real dist) on every build. `true`, not 'ci-only': publishing happens from
  // a laptop via `prepublishOnly` -> `npm run build`, so a CI-only gate would never
  // run for the person actually publishing. publint errors set process.exitCode=1,
  // which fails the build.
  publint: true,
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
