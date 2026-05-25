#!/usr/bin/env node
// scripts/build-package.ts — compile + stage + pack the npm tarball into dist/.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT      = path.resolve(import.meta.dirname, '..');
const DIST      = path.join(ROOT, 'dist');
const BUILD_DIR = path.join(ROOT, '.build');
const NPM_CACHE: string = process.env['FEYNMAN_NPM_CACHE'] || path.join(os.tmpdir(), 'npm-cache-feynman');

// --- Step 1: compile .ts → .js ---
fs.rmSync(BUILD_DIR, { recursive: true, force: true });
const tscResult = spawnSync('npx', ['tsc', '--project', path.join(ROOT, 'tsconfig.build.json')], {
  cwd: ROOT, encoding: 'utf8', env: { ...process.env },
});
if (tscResult.status !== 0) {
  if (tscResult.stdout) process.stderr.write(tscResult.stdout);
  if (tscResult.stderr) process.stderr.write(tscResult.stderr);
  process.exit(tscResult.status || 1);
}

// --- Step 2: create staging directory ---
const STAGING = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-staging-'));

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// --- Step 3: copy compiled .js to staging ---
for (const dir of ['hooks', 'bin', 'lib']) {
  const src = path.join(BUILD_DIR, dir);
  if (fs.existsSync(src)) copyDir(src, path.join(STAGING, dir));
}

// --- Step 4: copy static package files ---
const staticItems = [
  'rules', 'skills', 'docs', 'examples', '.claude-plugin', '.codex-plugin',
  'LICENSE', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md',
];
for (const item of staticItems) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) continue;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) copyDir(src, path.join(STAGING, item));
  else fs.copyFileSync(src, path.join(STAGING, item));
}

// --- Step 5: write modified package.json (.ts → .js in bin) ---
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;
const bin = pkg['bin'] as Record<string, string>;
pkg['bin'] = Object.fromEntries(Object.entries(bin).map(([k, v]) => [k, v.replace(/\.ts$/, '.js')]));
if (typeof pkg['main'] === 'string') pkg['main'] = pkg['main'].replace(/\.ts$/, '.js');
fs.writeFileSync(path.join(STAGING, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

// --- Step 6: rewrite hook command paths (.ts → .js) in JSON and sh files ---
function rewriteTs(src: string, dest: string): void {
  const content = fs.readFileSync(src, 'utf8')
    .replace(/feynman-activate\.ts/g,     'feynman-activate.js')
    .replace(/feynman-session-start\.ts/g, 'feynman-session-start.js')
    .replace(/feynman-lint\.ts/g,         'feynman-lint.js')
    .replace(/bin\/feynman\.ts/g,         'bin/feynman.js');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

// root hooks.json (Codex plugin format)
if (fs.existsSync(path.join(ROOT, 'hooks.json'))) {
  rewriteTs(path.join(ROOT, 'hooks.json'), path.join(STAGING, 'hooks.json'));
}
// hooks/hooks.json (Claude plugin format) — was already copied; rewrite in place
const hooksHooksJson = path.join(STAGING, 'hooks', 'hooks.json');
if (fs.existsSync(path.join(ROOT, 'hooks', 'hooks.json'))) {
  rewriteTs(path.join(ROOT, 'hooks', 'hooks.json'), hooksHooksJson);
}

for (const sh of ['install.sh', 'uninstall.sh']) {
  const src = path.join(ROOT, sh);
  if (!fs.existsSync(src)) continue;
  rewriteTs(src, path.join(STAGING, sh));
  fs.chmodSync(path.join(STAGING, sh), 0o755);
}

// --- Step 7: npm pack from staging ---
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

const result = spawnSync('npm', ['pack', '--pack-destination', DIST, '--json'], {
  cwd: STAGING,
  encoding: 'utf8',
  env: { ...process.env, NO_COLOR: '1', npm_config_cache: NPM_CACHE },
});

fs.rmSync(BUILD_DIR, { recursive: true, force: true });
fs.rmSync(STAGING,   { recursive: true, force: true });

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

const tarball = path.join(DIST, packed.filename);
if (!fs.existsSync(tarball)) {
  process.stderr.write(`expected tarball missing: ${tarball}\n`);
  process.exit(1);
}

fs.writeFileSync(path.join(DIST, 'TARBALL.txt'), path.relative(ROOT, tarball) + '\n');
console.log(`built ${path.relative(ROOT, tarball)} (${packed.size} bytes, ${packed.entryCount} files)`);
