#!/usr/bin/env node
// scripts/feynman-bump.js — release dance: version bump + changelog + commit + tag + push.
// Stops short of `npm publish` (2FA gate).
//
// Usage:
//   node scripts/feynman-bump.js <version>     e.g. "0.3.2"
//   node scripts/feynman-bump.js patch         (bumps last segment)
//   node scripts/feynman-bump.js minor         (bumps middle, zeroes last)
//   node scripts/feynman-bump.js major         (bumps first, zeroes rest)
//   node scripts/feynman-bump.js --dry-run …   (no writes, prints what would happen)
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const arg = args.find(a => a !== '--dry-run');

if (!arg) {
  console.error('usage: feynman-bump <version|patch|minor|major> [--dry-run]');
  process.exit(2);
}

const MANIFESTS = [
  'package.json',
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
];

function readManifest(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function bumpSemver(current, kind) {
  const m = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`unparseable version: ${current}`);
  let [, x, y, z] = m.map((s, i) => i === 0 ? s : Number(s));
  if (kind === 'patch') z += 1;
  else if (kind === 'minor') { y += 1; z = 0; }
  else if (kind === 'major') { x += 1; y = 0; z = 0; }
  else throw new Error(`unknown bump kind: ${kind}`);
  return `${x}.${y}.${z}`;
}

function resolveTarget(arg, current) {
  if (/^\d+\.\d+\.\d+$/.test(arg)) return arg;
  if (['patch', 'minor', 'major'].includes(arg)) return bumpSemver(current, arg);
  throw new Error(`bad version arg: ${arg}`);
}

function git(args) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || '');
    throw new Error(`git ${args.join(' ')} failed (exit ${r.status})`);
  }
  return (r.stdout || '').trim();
}

function npmRun(script) {
  const r = spawnSync('npm', ['run', '--silent', script], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || '');
    throw new Error(`npm run ${script} failed (exit ${r.status})`);
  }
  return r.stdout || '';
}

function runTests() {
  const r = spawnSync('npm', ['test', '--silent'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || '');
    throw new Error('npm test failed — refusing to bump');
  }
  const m = (r.stdout || '').match(/tests (\d+)/);
  return m ? `${m[1]}/${m[1]} pass` : 'pass';
}

function preflight() {
  const status = git(['status', '--porcelain']);
  if (status) {
    throw new Error(`working tree dirty:\n${status}\nstash or commit first`);
  }
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main') {
    throw new Error(`not on main (current: ${branch}) — refusing to bump`);
  }
}

function main() {
  preflight();

  const pkg = readManifest('package.json');
  const current = pkg.version;
  const target = resolveTarget(arg, current);

  if (target === current) throw new Error(`already at ${current}`);
  console.log(`bumping ${current} → ${target}${dryRun ? ' (dry-run)' : ''}`);

  if (!dryRun) {
    for (const rel of MANIFESTS) {
      const abs = path.join(ROOT, rel);
      const text = fs.readFileSync(abs, 'utf8');
      const updated = text.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${target}"`);
      if (text === updated) throw new Error(`no version field replaced in ${rel}`);
      fs.writeFileSync(abs, updated);
      console.log(`  updated ${rel}`);
    }

    console.log('running tests…');
    const testResult = runTests();
    console.log(`  ${testResult}`);

    console.log('regenerating changelog…');
    const changelogOut = npmRun('changelog').trim();
    if (changelogOut) console.log(`  ${changelogOut}`);

    console.log('committing…');
    git(['add', ...MANIFESTS, 'CHANGELOG.md']);
    const commitMsg = `chore(release): v${target}`;
    git(['commit', '-m', commitMsg]);
    const sha = git(['rev-parse', '--short', 'HEAD']);
    console.log(`  ${sha} ${commitMsg}`);

    console.log('tagging…');
    git(['tag', '-a', `v${target}`, '-m', `v${target}`]);

    console.log('pushing…');
    git(['push', 'origin', 'main']);
    git(['push', 'origin', `v${target}`]);
  }

  console.log('');
  console.log('done. next:');
  console.log(`  npm publish --access public --ignore-scripts   # needs npm 2FA OTP`);
  console.log(`  https://github.com/apolenkov/feynman/releases/tag/v${target}`);
}

try { main(); }
catch (e) { console.error('error:', e.message); process.exit(1); }
