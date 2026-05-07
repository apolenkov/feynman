#!/usr/bin/env node
// scripts/build-package.js — create the npm tarball artifact in dist/.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const result = spawnSync('npm', ['pack', '--pack-destination', DIST, '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, NO_COLOR: '1' },
});

if (result.status !== 0) {
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status || 1);
}

let packed;
try {
  packed = JSON.parse(result.stdout)[0];
} catch (error) {
  process.stderr.write(`failed to parse npm pack output: ${error.message}\n${result.stdout}\n`);
  process.exit(1);
}

const tarball = path.join(DIST, packed.filename);
if (!fs.existsSync(tarball)) {
  process.stderr.write(`expected tarball missing: ${tarball}\n`);
  process.exit(1);
}

console.log(`built ${path.relative(ROOT, tarball)} (${packed.size} bytes, ${packed.entryCount} files)`);
