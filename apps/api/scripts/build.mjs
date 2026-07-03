import { rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist', { recursive: true, force: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  // Native (.node) modules and pg's optional native client cannot be bundled.
  external: ['better-sqlite3', 'pg-native'],
  // ESM output needs a `require` shim for transitive CJS deps that call require() internally.
  banner: {
    js: "import { createRequire as __cR } from 'module'; const require = __cR(import.meta.url);",
  },
};

await Promise.all([
  build({ ...common, entryPoints: ['src/index.ts'], outfile: 'dist/index.js' }),
  build({ ...common, entryPoints: ['src/db/migrate.ts'], outfile: 'dist/migrate.js' }),
  build({ ...common, entryPoints: ['src/jobs/cli.ts'], outfile: 'dist/jobs-cli.js' }),
]);
