#!/usr/bin/env node
// scripts/feynman-bump.ts — prepare a version bump and optional release git actions.
// It never publishes to npm; commit, tag, and push each require an explicit flag.
//
// Usage:
//   node scripts/feynman-bump.ts <version>     e.g. "1.5.0"
//   node scripts/feynman-bump.ts patch         (bumps last segment)
//   node scripts/feynman-bump.ts minor         (bumps middle, zeroes last)
//   node scripts/feynman-bump.ts major         (bumps first, zeroes rest)
//   node scripts/feynman-bump.ts patch --commit --tag --push
//   node scripts/feynman-bump.ts --dry-run …   (no writes, prints what would happen)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const args: string[] = process.argv.slice(2);
const dryRun: boolean = args.includes('--dry-run');
const shouldCommit: boolean = args.includes('--commit');
const shouldTag: boolean = args.includes('--tag');
const shouldPush: boolean = args.includes('--push');
const knownFlags = new Set(['--dry-run', '--commit', '--tag', '--push']);
const invalidFlag = args.find((value) => value.startsWith('--') && !knownFlags.has(value));
const arg: string | undefined = args.find((value: string) => !value.startsWith('--'));

if (!arg || invalidFlag || (shouldTag && !shouldCommit) || (shouldPush && (!shouldCommit || !shouldTag)) || (dryRun && (shouldCommit || shouldTag || shouldPush))) {
  console.error('usage: feynman-bump <version|patch|minor|major> [--dry-run] [--commit --tag --push]');
  console.error('`--tag` requires `--commit`; `--push` requires `--commit --tag`.');
  process.exit(2);
}

const VERSION_MANIFESTS: string[] = [
  'package.json',
  '.claude-plugin/plugin.json',
  'plugins/feynman/.codex-plugin/plugin.json',
];
const RELEASE_FILES: string[] = [...VERSION_MANIFESTS, 'package-lock.json', 'CHANGELOG.md'];

function readManifest(rel: string): { version: string; [key: string]: unknown } {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function bumpSemver(current: string, kind: string): string {
  const m = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`unparseable version: ${current}`);
  const x = m[1];
  let y = Number(m[2]);
  let z = Number(m[3]);
  if (kind === 'patch') z += 1;
  else if (kind === 'minor') { y += 1; z = 0; }
  else if (kind === 'major') { const xn = Number(x) + 1; return `${xn}.0.0`; }
  else throw new Error(`unknown bump kind: ${kind}`);
  return `${x}.${y}.${z}`;
}

function resolveTarget(argVal: string, current: string): string {
  if (/^\d+\.\d+\.\d+$/.test(argVal)) return argVal;
  if (['patch', 'minor', 'major'].includes(argVal)) return bumpSemver(current, argVal);
  throw new Error(`bad version arg: ${argVal}`);
}

function git(gitArgs: string[]): string {
  const r = spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || '');
    throw new Error(`git ${gitArgs.join(' ')} failed (exit ${r.status})`);
  }
  return (r.stdout || '').trim();
}

function npmRun(script: string): string {
  const r = spawnSync('npm', ['run', '--silent', script], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || '');
    throw new Error(`npm run ${script} failed (exit ${r.status})`);
  }
  return r.stdout || '';
}

function runTests(): string {
  const r = spawnSync('npm', ['test', '--silent'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) {
    process.stderr.write(r.stderr || r.stdout || '');
    throw new Error('npm test failed — refusing to bump');
  }
  const m = (r.stdout || '').match(/tests (\d+)/);
  return m ? `${m[1]}/${m[1]} pass` : 'pass';
}

function preflight(): void {
  const status = git(['status', '--porcelain']);
  if (status) {
    throw new Error(`working tree dirty:\n${status}\nstash or commit first`);
  }
  if (shouldTag || shouldPush) {
    const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch !== 'main') {
      throw new Error(`not on main (current: ${branch}) — tagging and pushing require main`);
    }
  }
}

function updatePackageLock(target: string): void {
  const rel = 'package-lock.json';
  const abs = path.join(ROOT, rel);
  const lock = JSON.parse(fs.readFileSync(abs, 'utf8')) as {
    version?: unknown;
    packages?: Record<string, { version?: unknown }>;
  };
  if (typeof lock.version !== 'string' || !lock.packages?.[''] || typeof lock.packages[''].version !== 'string') {
    throw new Error('package-lock.json does not have a root package version');
  }
  lock.version = target;
  lock.packages[''].version = target;
  fs.writeFileSync(abs, JSON.stringify(lock, null, 2) + '\n');
  console.log(`  updated ${rel}`);
}

function main(): void {
  preflight();

  const pkg = readManifest('package.json');
  const current = pkg.version;
  const target = resolveTarget(arg!, current);

  if (target === current) throw new Error(`already at ${current}`);
  console.log(`bumping ${current} → ${target}${dryRun ? ' (dry-run)' : ''}`);

  if (dryRun) {
    for (const rel of VERSION_MANIFESTS) console.log(`  would update ${rel}`);
    console.log('  would update package-lock.json');
    console.log('  would run tests and regenerate CHANGELOG.md');
    return;
  }

  for (const rel of VERSION_MANIFESTS) {
    const abs = path.join(ROOT, rel);
    const text = fs.readFileSync(abs, 'utf8');
    const updated = text.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${target}"`);
    if (text === updated) throw new Error(`no version field replaced in ${rel}`);
    fs.writeFileSync(abs, updated);
    console.log(`  updated ${rel}`);
  }
  updatePackageLock(target);

  console.log('running tests…');
  const testResult = runTests();
  console.log(`  ${testResult}`);

  console.log('regenerating changelog…');
  const changelogOut = npmRun('changelog').trim();
  if (changelogOut) console.log(`  ${changelogOut}`);

  if (shouldCommit) {
    console.log('committing…');
    git(['add', ...RELEASE_FILES]);
    const commitMsg = `chore(release): v${target}`;
    git(['commit', '-m', commitMsg]);
    const sha = git(['rev-parse', '--short', 'HEAD']);
    console.log(`  ${sha} ${commitMsg}`);
  }

  if (shouldTag) {
    console.log('tagging…');
    git(['tag', '-a', `v${target}`, '-m', `v${target}`]);
  }

  if (shouldPush) {
    console.log('pushing…');
    git(['push', 'origin', 'main']);
    git(['push', 'origin', `v${target}`]);
  }

  console.log('\ndone. next:');
  if (!shouldCommit) console.log('  review and commit the updated release files (or rerun with --commit)');
  else if (!shouldTag) console.log(`  create tag v${target} explicitly (or rerun with --tag --push)`);
  else if (!shouldPush) console.log(`  push main and v${target} explicitly (or rerun with --push)`);
  console.log('  publish only through the reviewed release workflow or an explicitly authorized npm command');
  console.log(`  https://github.com/apolenkov/feynman/releases/tag/v${target}`);
}

try { main(); }
catch (e) { console.error('error:', (e as Error).message); process.exit(1); }
