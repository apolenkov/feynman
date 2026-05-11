#!/usr/bin/env node
// scripts/build-package.ts — create the npm tarball artifact in dist/.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const NPM_CACHE: string = process.env.FEYNMAN_NPM_CACHE || path.join(os.tmpdir(), 'npm-cache-feynman');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const result = spawnSync('npm', ['pack', '--pack-destination', DIST, '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, NO_COLOR: '1', npm_config_cache: NPM_CACHE },
});

if (result.status !== 0) {
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status || 1);
}

let packed: { filename: string; size: number; entryCount: number };
try {
  packed = JSON.parse(result.stdout)[0];
} catch (error) {
  process.stderr.write(`failed to parse npm pack output: ${(error as Error).message}\n${result.stdout}\n`);
  process.exit(1);
}

const tarball: string = path.join(DIST, packed.filename);
if (!fs.existsSync(tarball)) {
  process.stderr.write(`expected tarball missing: ${tarball}\n`);
  process.exit(1);
}

console.log(`built ${path.relative(ROOT, tarball)} (${packed.size} bytes, ${packed.entryCount} files)`);
