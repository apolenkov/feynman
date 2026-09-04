#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

interface PackedTarball {
  readonly filename: string;
  readonly size: number;
  readonly entryCount: number;
}
export interface CommandResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}
export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv }>,
) => CommandResult;
export interface BuildPackageOptions {
  readonly root?: string;
  readonly temporaryRoot?: string;
  readonly runCommand?: CommandRunner;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isStringEntry(entry: readonly [string, unknown]): entry is [string, string] {
  return typeof entry[1] === 'string';
}

function parsePackedTarball(output: string): PackedTarball {
  const parsed: unknown = JSON.parse(output);
  const candidates: readonly unknown[] = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed)
      ? Object.values(parsed)
      : [];
  const packed = candidates.find(isRecord);
  if (packed === undefined) throw new Error('npm pack output contains no package metadata');
  const filename = packed['filename'];
  const size = packed['size'];
  const entryCount = packed['entryCount'];
  if (typeof filename !== 'string' || typeof size !== 'number' || typeof entryCount !== 'number') {
    throw new Error('npm pack output has incomplete package metadata');
  }
  return { filename, size, entryCount };
}

function textOutput(value: string | Buffer | null): string {
  return typeof value === 'string' ? value : (value?.toString() ?? '');
}

export function runCommand(
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv }>,
): CommandResult {
  const result = spawnSync(command, args, { ...options, encoding: 'utf8' });
  return {
    status: result.status,
    signal: result.signal,
    stdout: textOutput(result.stdout),
    stderr: textOutput(result.stderr),
    error: result.error,
  };
}

function checkedCommand(
  runner: CommandRunner,
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv }>,
): string {
  const result = runner(command, args, options);
  if (result.status !== 0 || result.error !== undefined || result.signal !== null) {
    throw new Error(
      [
        `command failed: ${command} ${args.join(' ')}`,
        result.error?.message ?? '',
        result.signal === null ? '' : `terminated by signal: ${result.signal}`,
        result.stdout,
        result.stderr,
      ]
        .filter((part) => part.length > 0)
        .join('\n'),
    );
  }
  return result.stdout;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const source = path.join(src, entry.name);
    const destination = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(source, destination);
    else fs.copyFileSync(source, destination);
  }
}

function packageManifest(root: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!isRecord(parsed)) throw new Error('package.json must contain an object');
  const rawBin = parsed['bin'];
  if (!isRecord(rawBin)) throw new Error('package.json bin must contain an object');
  const entries = Object.entries(rawBin);
  if (!entries.every(isStringEntry)) throw new Error('package.json bin values must be strings');
  const bin = Object.fromEntries(
    entries.map(([name, value]) => [name, value.replace(/\.ts$/, '.js')]),
  );
  const main = parsed['main'];
  return {
    ...parsed,
    bin,
    ...(typeof main === 'string' ? { main: main.replace(/\.ts$/, '.js') } : {}),
  };
}

function rewriteTs(src: string, dest: string): void {
  const content = fs
    .readFileSync(src, 'utf8')
    .replace(/feynman-session-start\.ts/g, 'feynman-session-start.js')
    .replace(/feynman-lint\.ts/g, 'feynman-lint.js')
    .replace(/bin\/feynman\.ts/g, 'bin/feynman.js');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

export function buildPackage(options: Readonly<BuildPackageOptions> = {}): string {
  const root = options.root ?? path.resolve(import.meta.dirname, '..');
  const temporaryRoot = options.temporaryRoot ?? os.tmpdir();
  const runner = options.runCommand ?? runCommand;
  const dist = path.join(root, 'dist');
  const buildDir = path.join(root, '.build');
  const npmCache = process.env['FEYNMAN_NPM_CACHE'] ?? path.join(os.tmpdir(), 'npm-cache-feynman');
  fs.rmSync(buildDir, { recursive: true, force: true });
  const staging = fs.mkdtempSync(path.join(temporaryRoot, 'feynman-staging-'));
  let primaryError: unknown;
  try {
    checkedCommand(runner, 'npx', ['tsc', '--project', path.join(root, 'tsconfig.build.json')], {
      cwd: root,
      env: { ...process.env },
    });
    for (const dir of ['hooks', 'bin', 'lib']) {
      const source = path.join(buildDir, dir);
      if (fs.existsSync(source)) copyDir(source, path.join(staging, dir));
    }
    for (const item of [
      'rules',
      'docs',
      'examples',
      '.agents',
      'plugins',
      'LICENSE',
      'README.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'SECURITY.md',
      'PRIVACY.md',
    ]) {
      const source = path.join(root, item);
      if (!fs.existsSync(source)) continue;
      const destination = path.join(staging, item);
      if (fs.statSync(source).isDirectory()) copyDir(source, destination);
      else fs.copyFileSync(source, destination);
    }
    fs.writeFileSync(
      path.join(staging, 'package.json'),
      `${JSON.stringify(packageManifest(root), null, 2)}\n`,
    );
    for (const script of ['install.sh', 'uninstall.sh']) {
      const source = path.join(root, script);
      if (!fs.existsSync(source)) continue;
      const destination = path.join(staging, script);
      rewriteTs(source, destination);
      fs.chmodSync(destination, 0o755);
    }
    fs.rmSync(dist, { recursive: true, force: true });
    fs.mkdirSync(dist, { recursive: true });
    const output = checkedCommand(runner, 'npm', ['pack', '--pack-destination', dist, '--json'], {
      cwd: staging,
      env: { ...process.env, NO_COLOR: '1', npm_config_cache: npmCache },
    });
    const packed = parsePackedTarball(output);
    const tarball = path.join(dist, packed.filename);
    if (!fs.existsSync(tarball)) throw new Error(`expected tarball missing: ${tarball}`);
    fs.writeFileSync(path.join(dist, 'TARBALL.txt'), `${path.relative(root, tarball)}\n`);
    console.log(
      `built ${path.relative(root, tarball)} (${packed.size} bytes, ${packed.entryCount} files)`,
    );
    return tarball;
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [staging, buildDir].flatMap((target) => {
      try {
        fs.rmSync(target, { recursive: true, force: true });
        return [];
      } catch (error) {
        return [error];
      }
    });
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        primaryError === undefined ? cleanupErrors : [primaryError, ...cleanupErrors],
        primaryError === undefined
          ? 'failed to clean packaging temporary directories'
          : `${errorMessage(primaryError)}; cleanup also failed`,
        { cause: primaryError },
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function buildPackageMain(options: Readonly<BuildPackageOptions> = {}): void {
  try {
    buildPackage(options);
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href)
  buildPackageMain();
