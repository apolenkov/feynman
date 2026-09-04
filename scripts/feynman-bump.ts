#!/usr/bin/env node
// Prepare a version bump and optional release git actions. Never publishes to npm.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { atomicWrite } from '../bin/adapters/fs.ts';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..');
const USAGE = 'usage: feynman-bump <version|patch|minor|major> [--dry-run] [--commit --tag --push]';
const FLAG_HELP = '`--tag` requires `--commit`; `--push` requires `--commit --tag`.';
const KNOWN_FLAGS = new Set(['--dry-run', '--commit', '--tag', '--push']);
const VERSION_MANIFESTS = ['package.json', 'plugins/feynman/.codex-plugin/plugin.json'] as const;
const RELEASE_FILES = [...VERSION_MANIFESTS, 'package-lock.json', 'CHANGELOG.md'] as const;
type ReleaseFile = (typeof RELEASE_FILES)[number];

export interface BumpOptions {
  readonly kind: 'run';
  readonly versionRequest: string;
  readonly dryRun: boolean;
  readonly commit: boolean;
  readonly tag: boolean;
  readonly push: boolean;
}

export type BumpArguments =
  BumpOptions | { readonly kind: 'error'; readonly messages: readonly [string, string] };

export interface CommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
  readonly signal: NodeJS.Signals | null;
}

export interface BumpEnvironment {
  readonly readFile: (relativePath: string) => string;
  readonly writeFile: (relativePath: string, contents: string) => void;
  readonly run: (command: string, args: readonly string[]) => CommandResult;
  readonly log: (message: string) => void;
  readonly writeError: (message: string) => void;
}

export type BumpRunner = (command: string, args: readonly string[], root: string) => CommandResult;

export function parseBumpArguments(argv: readonly string[]): BumpArguments {
  const dryRun = argv.includes('--dry-run');
  const commit = argv.includes('--commit');
  const tag = argv.includes('--tag');
  const push = argv.includes('--push');
  const invalidFlag = argv.find((value) => value.startsWith('--') && !KNOWN_FLAGS.has(value));
  const versionRequest = argv.find((value) => !value.startsWith('--'));
  if (
    versionRequest === undefined ||
    invalidFlag !== undefined ||
    (tag && !commit) ||
    (push && (!commit || !tag)) ||
    (dryRun && (commit || tag || push))
  ) {
    return { kind: 'error', messages: [USAGE, FLAG_HELP] };
  }
  return { kind: 'run', versionRequest, dryRun, commit, tag, push };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecord(text: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error(`Invalid ${label}`);
  return value;
}

export function readManifestVersion(text: string, relativePath: string): string {
  const manifest = parseRecord(text, `version manifest: ${relativePath}`);
  if (typeof manifest['version'] !== 'string') {
    throw new Error(`Invalid version manifest: ${relativePath}`);
  }
  return manifest['version'];
}

export function bumpSemver(current: string, kind: 'patch' | 'minor' | 'major'): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`unparseable version: ${current}`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}

export function resolveTarget(versionRequest: string, current: string): string {
  if (/^\d+\.\d+\.\d+$/.test(versionRequest)) return versionRequest;
  if (versionRequest === 'patch' || versionRequest === 'minor' || versionRequest === 'major') {
    return bumpSemver(current, versionRequest);
  }
  throw new Error(`bad version arg: ${versionRequest}`);
}

export function updateManifestVersion(text: string, target: string, relativePath: string): string {
  const updated = text.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${target}"`);
  if (text === updated) throw new Error(`no version field replaced in ${relativePath}`);
  return updated;
}

export function updatePackageLock(text: string, target: string): string {
  const lock = parseRecord(text, 'package-lock.json');
  const packages = lock['packages'];
  if (typeof lock['version'] !== 'string' || !isRecord(packages)) {
    throw new Error('package-lock.json does not have a root package version');
  }
  const rootPackage = packages[''];
  if (!isRecord(rootPackage) || typeof rootPackage['version'] !== 'string') {
    throw new Error('package-lock.json does not have a root package version');
  }
  return (
    JSON.stringify(
      {
        ...lock,
        version: target,
        packages: { ...packages, '': { ...rootPackage, version: target } },
      },
      null,
      2,
    ) + '\n'
  );
}

function commandOutput(result: CommandResult): string {
  return result.stderr || result.stdout || '';
}

function processFailure(result: CommandResult): string | null {
  if (result.error !== undefined) return result.error.message;
  if (result.signal !== null) return `terminated by signal ${result.signal}`;
  if (result.status !== 0) return `exit ${result.status ?? 'unavailable'}`;
  return null;
}

function runChecked(
  environment: BumpEnvironment,
  command: string,
  args: readonly string[],
  failure: string,
): string {
  const result = environment.run(command, args);
  const detail = processFailure(result);
  if (detail !== null) {
    environment.writeError(commandOutput(result));
    throw new Error(`${failure} (${detail})`);
  }
  return result.stdout.trim();
}

function git(environment: BumpEnvironment, args: readonly string[]): string {
  return runChecked(environment, 'git', args, `git ${args.join(' ')} failed`);
}

function npmRun(environment: BumpEnvironment, script: string): string {
  return runChecked(environment, 'npm', ['run', '--silent', script], `npm run ${script} failed`);
}

function preflight(options: BumpOptions, environment: BumpEnvironment): void {
  const status = git(environment, ['status', '--porcelain']);
  if (status !== '') throw new Error(`working tree dirty:\n${status}\nstash or commit first`);
  if (options.tag || options.push) {
    const branch = git(environment, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch !== 'main') {
      throw new Error(`not on main (current: ${branch}) — tagging and pushing require main`);
    }
  }
}

function runReleaseGate(environment: BumpEnvironment): string {
  const result = environment.run('npm', ['run', '--silent', 'ci']);
  const failure = processFailure(result);
  if (failure !== null) {
    environment.writeError(commandOutput(result));
    throw new Error(`full CI failed — refusing to bump (${failure})`);
  }
  return 'full CI passed';
}

interface ReleaseSnapshot {
  readonly relativePath: ReleaseFile;
  readonly contents: string;
}

interface PlannedWrite {
  readonly relativePath: ReleaseFile;
  readonly contents: string;
}

function snapshotReleaseFiles(environment: BumpEnvironment): readonly ReleaseSnapshot[] {
  return RELEASE_FILES.map((relativePath) => ({
    relativePath,
    contents: environment.readFile(relativePath),
  }));
}

function snapshotContents(
  snapshots: readonly ReleaseSnapshot[],
  relativePath: ReleaseFile,
): string {
  const snapshot = snapshots.find((candidate) => candidate.relativePath === relativePath);
  if (snapshot === undefined) throw new Error(`missing release snapshot: ${relativePath}`);
  return snapshot.contents;
}

function planReleaseWrites(
  snapshots: readonly ReleaseSnapshot[],
  target: string,
): readonly PlannedWrite[] {
  return [
    ...VERSION_MANIFESTS.map((relativePath) => ({
      relativePath,
      contents: updateManifestVersion(
        snapshotContents(snapshots, relativePath),
        target,
        relativePath,
      ),
    })),
    {
      relativePath: 'package-lock.json',
      contents: updatePackageLock(snapshotContents(snapshots, 'package-lock.json'), target),
    },
  ];
}

function restoreReleaseFiles(
  snapshots: readonly ReleaseSnapshot[],
  environment: BumpEnvironment,
): readonly string[] {
  return snapshots.flatMap(({ relativePath, contents }) => {
    try {
      environment.writeFile(relativePath, contents);
      return [];
    } catch (error) {
      return [`${relativePath}: ${errorMessage(error)}`];
    }
  });
}

function prepareRelease(
  plans: readonly PlannedWrite[],
  snapshots: readonly ReleaseSnapshot[],
  environment: BumpEnvironment,
): void {
  try {
    plans.forEach(({ relativePath, contents }) => {
      environment.writeFile(relativePath, contents);
      environment.log(`  updated ${relativePath}`);
    });
    environment.log('regenerating changelog…');
    const changelogOutput = npmRun(environment, 'changelog');
    if (changelogOutput !== '') environment.log(`  ${changelogOutput}`);
    environment.log('running full release gate…');
    environment.log(`  ${runReleaseGate(environment)}`);
  } catch (preparationError) {
    const restoreFailures = restoreReleaseFiles(snapshots, environment);
    if (restoreFailures.length > 0) {
      throw new Error(
        `${errorMessage(preparationError)}; restoration failures: ${restoreFailures.join('; ')}`,
      );
    }
    throw preparationError;
  }
}

export function executeBump(options: BumpOptions, environment: BumpEnvironment): void {
  preflight(options, environment);
  const snapshots = options.dryRun ? null : snapshotReleaseFiles(environment);
  const packageJson =
    snapshots === null
      ? environment.readFile('package.json')
      : snapshotContents(snapshots, 'package.json');
  const current = readManifestVersion(packageJson, 'package.json');
  const target = resolveTarget(options.versionRequest, current);
  if (target === current) throw new Error(`already at ${current}`);
  environment.log(`bumping ${current} → ${target}${options.dryRun ? ' (dry-run)' : ''}`);

  if (options.dryRun) {
    VERSION_MANIFESTS.forEach((relativePath) => {
      environment.log(`  would update ${relativePath}`);
    });
    environment.log('  would update package-lock.json');
    environment.log('  would regenerate CHANGELOG.md and run full CI');
    return;
  }

  if (snapshots === null) throw new Error('release snapshots unavailable');
  const plans = planReleaseWrites(snapshots, target);
  prepareRelease(plans, snapshots, environment);

  if (options.commit) {
    environment.log('committing…');
    git(environment, ['add', ...RELEASE_FILES]);
    const commitMessage = `chore(release): v${target}`;
    git(environment, ['commit', '-m', commitMessage]);
    const sha = git(environment, ['rev-parse', '--short', 'HEAD']);
    environment.log(`  ${sha} ${commitMessage}`);
  }
  if (options.tag) {
    environment.log('tagging…');
    git(environment, ['tag', '-a', `v${target}`, '-m', `v${target}`]);
  }
  if (options.push) {
    environment.log('pushing…');
    git(environment, ['push', 'origin', 'main']);
    git(environment, ['push', 'origin', `v${target}`]);
  }

  environment.log('\ndone. next:');
  if (!options.commit) {
    environment.log('  review and commit the updated release files (or rerun with --commit)');
  } else if (!options.tag) {
    environment.log(`  create tag v${target} explicitly (or rerun with --tag --push)`);
  } else if (!options.push) {
    environment.log(`  push main and v${target} explicitly (or rerun with --push)`);
  }
  environment.log(
    '  publish only through the reviewed release workflow or an explicitly authorized npm command',
  );
  environment.log(`  https://github.com/apolenkov/feynman/releases/tag/v${target}`);
}

export function runSystemCommand(
  command: string,
  args: readonly string[],
  root: string,
): CommandResult {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
    signal: result.signal,
  };
}

export function createBumpEnvironment(
  root: string,
  runner: BumpRunner = runSystemCommand,
): BumpEnvironment {
  return {
    readFile: (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8'),
    writeFile: (relativePath, contents) => {
      atomicWrite(path.join(root, relativePath), contents);
    },
    run: (command, args) => runner(command, args, root),
    log: (message) => {
      console.log(message);
    },
    writeError: (message) => {
      process.stderr.write(message);
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function bumpExitCode(
  argv: readonly string[] = process.argv.slice(2),
  environment: BumpEnvironment = createBumpEnvironment(DEFAULT_ROOT),
): number {
  const parsed = parseBumpArguments(argv);
  if (parsed.kind === 'error') {
    parsed.messages.forEach((message) => {
      console.error(message);
    });
    return 2;
  }
  try {
    executeBump(parsed, environment);
    return 0;
  } catch (error) {
    console.error('error:', errorMessage(error));
    return 1;
  }
}

export function bumpMain(
  argv: readonly string[] = process.argv.slice(2),
  environment: BumpEnvironment = createBumpEnvironment(DEFAULT_ROOT),
): void {
  process.exitCode = bumpExitCode(argv, environment);
}

if (import.meta.main) bumpMain();
