#!/usr/bin/env node
import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ReproducibilityCommandResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}
export type ReproducibilityRunner = (
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env?: Readonly<NodeJS.ProcessEnv> }>,
) => ReproducibilityCommandResult;
export interface ReproducibilityOptions {
  readonly root?: string;
  readonly runCommand?: ReproducibilityRunner;
}
interface BuiltTarball {
  readonly bytes: Buffer;
  readonly filename: string;
  readonly sha256: string;
}

const hashBytes = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

function textOutput(value: string | Buffer | null): string {
  return typeof value === 'string' ? value : (value?.toString() ?? '');
}

export function runReproducibilityCommand(
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env?: Readonly<NodeJS.ProcessEnv> }>,
): ReproducibilityCommandResult {
  const spawnOptions: SpawnSyncOptionsWithStringEncoding =
    options.env === undefined
      ? { cwd: options.cwd, encoding: 'utf8' }
      : { cwd: options.cwd, env: { ...options.env }, encoding: 'utf8' };
  const result: SpawnSyncReturns<string | Buffer> = spawnSync(command, args, spawnOptions);
  return {
    status: result.status,
    signal: result.signal,
    stdout: textOutput(result.stdout),
    stderr: textOutput(result.stderr),
    ...(result.error === undefined ? {} : { error: result.error }),
  };
}

function sourceSnapshot(root: string, runner: ReproducibilityRunner): string {
  const result = runner('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    env: process.env,
  });
  if (result.status !== 0 || result.error !== undefined || result.signal !== null) {
    const diagnostic = [
      result.error?.message ?? '',
      result.signal === null ? '' : `terminated by signal: ${result.signal}`,
      result.stderr,
      result.stdout,
    ]
      .filter((part) => part.length > 0)
      .join('\n');
    throw new Error(
      `Cannot enumerate repository source inputs${diagnostic.length > 0 ? `:\n${diagnostic}` : ''}`,
    );
  }
  const sourceHash = createHash('sha256');
  const relativeFiles = [
    ...new Set(result.stdout.split('\0').filter((entry) => entry.length > 0)),
  ].toSorted();
  for (const relative of relativeFiles) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) {
      sourceHash.update(`deleted\0${relative}\0`);
      continue;
    }
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile()) throw new Error(`unsupported source entry: ${relative}`);
    sourceHash.update(`file\0${relative}\0${stat.mode}\0`);
    sourceHash.update(fs.readFileSync(absolute));
    sourceHash.update('\0');
  }
  return sourceHash.digest('hex');
}

function assertUnchanged(expected: string, actual: string, phase: string): void {
  if (actual !== expected)
    throw new Error(
      `source or lockfile changed ${phase}; run without concurrent workspace changes`,
    );
}

function build(root: string, runner: ReproducibilityRunner, label: string): void {
  const result = runner(process.execPath, [path.join(root, 'scripts', 'build-package.ts')], {
    cwd: root,
    env: process.env,
  });
  if (result.error !== undefined)
    throw new Error(`${label} build could not start: ${result.error.message}`);
  if (result.status === 0) return;
  const output = [result.stdout, result.stderr].filter((value) => value.length > 0).join('\n');
  const outcome =
    result.status === null ? `signal ${result.signal ?? 'unknown'}` : `exit ${result.status}`;
  throw new Error(`${label} build failed (${outcome})${output.length > 0 ? `:\n${output}` : ''}`);
}

function readBuiltTarball(root: string): BuiltTarball {
  const dist = path.join(root, 'dist');
  const pointerFile = path.join(dist, 'TARBALL.txt');
  if (!fs.existsSync(pointerFile)) throw new Error('build did not retain dist/TARBALL.txt');
  const pointer = fs.readFileSync(pointerFile, 'utf8').trim();
  if (pointer.length === 0) throw new Error('dist/TARBALL.txt is empty');
  const filename = path.resolve(root, pointer);
  const relativeToDist = path.relative(dist, filename);
  if (
    relativeToDist.length === 0 ||
    relativeToDist === '..' ||
    relativeToDist.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativeToDist)
  )
    throw new Error(`dist/TARBALL.txt points outside dist: ${pointer}`);
  if (!fs.existsSync(filename)) throw new Error(`built tarball is missing: ${pointer}`);
  const bytes = fs.readFileSync(filename);
  return { bytes, filename, sha256: hashBytes(bytes) };
}

export function checkReproducibility(options: Readonly<ReproducibilityOptions> = {}): string {
  const root = options.root ?? path.resolve(import.meta.dirname, '..');
  const runner = options.runCommand ?? runReproducibilityCommand;
  const initialSnapshot = sourceSnapshot(root, runner);
  build(root, runner, 'first');
  assertUnchanged(initialSnapshot, sourceSnapshot(root, runner), 'during the first build');
  const first = readBuiltTarball(root);
  build(root, runner, 'second');
  assertUnchanged(initialSnapshot, sourceSnapshot(root, runner), 'during the second build');
  const second = readBuiltTarball(root);
  if (!first.bytes.equals(second.bytes) || first.sha256 !== second.sha256)
    throw new Error(`package bytes differ: first ${first.sha256}, second ${second.sha256}`);
  const retainedBytes = fs.readFileSync(second.filename);
  if (!retainedBytes.equals(second.bytes) || hashBytes(retainedBytes) !== second.sha256)
    throw new Error(`tested package was not retained: ${path.relative(root, second.filename)}`);
  return `reproducible ${path.relative(root, second.filename)} SHA256 ${second.sha256}`;
}

export function reproducibilityMain(): void {
  try {
    process.stdout.write(`${checkReproducibility()}\n`);
  } catch (error) {
    process.stderr.write(
      `reproducibility check failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href)
  reproducibilityMain();
