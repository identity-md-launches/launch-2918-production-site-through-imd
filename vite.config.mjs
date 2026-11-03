import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

// Optional external install keeps this contributor's repository free of dependencies.
// A normal `npm ci` needs no environment variable.
const dependencyRoot = process.env.BLOCKLIGHT_DEPENDENCIES;
const req = createRequire(dependencyRoot ? resolve(dependencyRoot, 'package.json') : import.meta.url);
const aliases = dependencyRoot ? {
  'react/jsx-runtime': req.resolve('react/jsx-runtime'),
  'react/jsx-dev-runtime': req.resolve('react/jsx-dev-runtime'),
  'react-dom/client': req.resolve('react-dom/client'),
  'react-dom': req.resolve('react-dom'),
  'react': req.resolve('react'),
  'vitest': resolve(dirname(req.resolve('vitest/package.json')), 'dist/index.js'),
} : {};

export default {
  base: './',
  resolve: { alias: aliases },
  esbuild: { jsx: 'automatic' },
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
  cacheDir: process.env.BLOCKLIGHT_CACHE || '/tmp/blocklight-vite-cache',
  test: { include: ['tests/**/*.test.ts'], reporters: ['verbose'], environment: 'node' },
};
