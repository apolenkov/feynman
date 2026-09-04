#!/usr/bin/env node
// scripts/check-reproducibility.ts — prove two packaging builds produce the same tarball.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUILD_SCRIPT = path.join(ROOT, 'scripts', 'build-package.ts');
const DIST = path.join(ROOT, 'dist');
const TARBALL_POINTER = path.join(DIST, 'TARBALL.txt');

interface BuiltTarball {
  bytes: Buffer;
  filename: string;
  sha256: string;
}

function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// Include tracked and new source files; git-ignored build/evaluation outputs are not inputs.
// No source edits or dependency installs may run concurrently with this check.
function sourceSnapshot(): string {
  const result = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: ROOT,
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) throw new Error('Cannot enumerate repository source inputs');
  const hash = createHash('sha256');
  for (const relative of [...new Set(result.stdout.split('\0').filter(Boolean))].sort()) {
    const absolute = path.join(ROOT, relative);
    if (!fs.existsSync(absolute)) {
      hash.update(`deleted\0${relative}\0`);
      continue;
    }
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile()) throw new Error(`unsupported source entry: ${relative}`);
    hash.update(`file\0${relative}\0${stat.mode}\0`);
    hash.update(fs.readFileSync(absolute));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function assertUnchanged(expected: string, actual: string, phase: string): void {
  if (actual !== expected) {
    throw new Error(
      `source or lockfile changed ${phase}; run without concurrent workspace changes`,
    );
  }
}

function build(label: string): void {
  const result = spawnSync(process.execPath, [BUILD_SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) throw new Error(`${label} build could not start: ${result.error.message}`);
  if (result.status === 0) return;

  const output = [result.stdout, result.stderr].filter((value) => value.length > 0).join('\n');
  const outcome =
    result.status === null ? `signal ${result.signal ?? 'unknown'}` : `exit ${result.status}`;
  throw new Error(`${label} build failed (${outcome})${output.length > 0 ? `:\n${output}` : ''}`);
}

function readBuiltTarball(): BuiltTarball {
  if (!fs.existsSync(TARBALL_POINTER)) {
    throw new Error(`build did not retain ${path.relative(ROOT, TARBALL_POINTER)}`);
  }

  const pointer = fs.readFileSync(TARBALL_POINTER, 'utf8').trim();
  if (pointer.length === 0) throw new Error('dist/TARBALL.txt is empty');

  const filename = path.resolve(ROOT, pointer);
  const relativeToDist = path.relative(DIST, filename);
  if (
    relativeToDist.length === 0 ||
    relativeToDist === '..' ||
    relativeToDist.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToDist)
  ) {
    throw new Error(`dist/TARBALL.txt points outside dist: ${pointer}`);
  }
  if (!fs.existsSync(filename)) throw new Error(`built tarball is missing: ${pointer}`);

  const bytes = fs.readFileSync(filename);
  return { bytes, filename, sha256: hashBytes(bytes) };
}

function main(): void {
  const initialSnapshot = sourceSnapshot();

  build('first');
  assertUnchanged(initialSnapshot, sourceSnapshot(), 'during the first build');
  const first = readBuiltTarball();

  build('second');
  assertUnchanged(initialSnapshot, sourceSnapshot(), 'during the second build');
  const second = readBuiltTarball();

  if (!first.bytes.equals(second.bytes) || first.sha256 !== second.sha256) {
    throw new Error(`package bytes differ: first ${first.sha256}, second ${second.sha256}`);
  }

  const retainedBytes = fs.readFileSync(second.filename);
  if (!retainedBytes.equals(second.bytes) || hashBytes(retainedBytes) !== second.sha256) {
    throw new Error(`tested package was not retained: ${path.relative(ROOT, second.filename)}`);
  }

  console.log(`reproducible ${path.relative(ROOT, second.filename)} SHA256 ${second.sha256}`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`reproducibility check failed: ${(error as Error).message}\n`);
  process.exitCode = 1;
}
