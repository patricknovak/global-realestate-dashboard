/**
 * esbuild configuration for the Global Real Estate Dashboard frontend.
 *
 * Concatenates source modules from src/ into a single bundled file.
 * Uses a concat plugin since the legacy codebase relies on shared
 * function scope rather than ES module imports/exports.
 *
 * Usage:
 *   npm run build       - Production build (minified)
 *   npm run build:dev   - Development build (sourcemaps, no minification)
 *   npm run watch       - Watch mode for development
 */

import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const isWatch = process.argv.includes('--watch');
const isDev = process.argv.includes('--dev') || isWatch;

// Source modules in load order
const MODULE_ORDER = [
  'src/utils.js',
  'src/membership.js',
  'src/state.js',
  'src/filters.js',
  'src/deals.js',
  'src/offers.js',
  'src/presets.js',
  'src/calculators.js',
  'src/tools.js',
  'src/views.js',
  'src/ui.js',
];

// Plugin that concatenates source files into a single virtual entry
const concatPlugin = {
  name: 'concat-modules',
  setup(build) {
    build.onResolve({ filter: /^virtual:entry$/ }, () => ({
      path: 'virtual:entry',
      namespace: 'concat',
    }));

    build.onLoad({ filter: /.*/, namespace: 'concat' }, () => {
      const chunks = MODULE_ORDER.map((file) => {
        const content = fs.readFileSync(file, 'utf-8');
        return `// ---- ${path.basename(file)} ----\n${content}`;
      });
      return {
        contents: chunks.join('\n\n'),
        loader: 'js',
      };
    });
  },
};

const config = {
  entryPoints: ['virtual:entry'],
  bundle: true,
  outfile: 'dist/app.js',
  format: 'iife',
  target: ['es2020'],
  minify: !isDev,
  sourcemap: isDev,
  logLevel: 'info',
  plugins: [concatPlugin],
};

if (isWatch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('[esbuild] Watching for changes...');
} else {
  await esbuild.build(config);
}
