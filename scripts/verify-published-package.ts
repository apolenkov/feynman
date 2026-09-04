#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

interface CommandResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}
export type PublishedCommandRunner = (
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv }>,
) => CommandResult;
export interface VerifyPublishedOptions {
  readonly root?: string;
  readonly temporaryRoot?: string;
  readonly packageName?: string;
  readonly packageVersion?: string;
  readonly runCommand?: PublishedCommandRunner;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function packageIdentity(root: string): Readonly<{ name: string; version: string }> {
  const value: unknown = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!isRecord(value) || typeof value['name'] !== 'string' || typeof value['version'] !== 'string')
    throw new Error('package.json name and version must be strings');
  return { name: value['name'], version: value['version'] };
}
function textOutput(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString();
  return '';
}
export function runPublishedCommand(
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv }>,
): CommandResult {
  const result = spawnSync(command, args, options);
  return {
    status: result.status,
    signal: result.signal,
    stdout: textOutput(result.stdout),
    stderr: textOutput(result.stderr),
    error: result.error,
  };
}
function run(
  runner: PublishedCommandRunner,
  command: string,
  args: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv }>,
): string {
  const result = runner(command, args, options);
  if (result.status !== 0 || result.error !== undefined || result.signal !== null)
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
  return result.stdout;
}
function isolatedNpmEnv(root: string): NodeJS.ProcessEnv {
  const home = path.join(root, 'npm-home');
  fs.mkdirSync(home, { recursive: true });
  const userConfig = path.join(home, '.npmrc');
  fs.writeFileSync(userConfig, '');
  return {
    HOME: home,
    npm_config_cache: path.join(root, 'npm-cache'),
    npm_config_ignore_scripts: 'true',
    npm_config_userconfig: userConfig,
  };
}
function consumerEnv(extra: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => name !== 'npm_config_allow_scripts' && name !== 'NPM_CONFIG_ALLOW_SCRIPTS',
    ),
  );
  return { ...inherited, NO_COLOR: '1', ...extra };
}

export function verifyPublishedPackage(options: Readonly<VerifyPublishedOptions> = {}): void {
  const root = options.root ?? path.resolve(import.meta.dirname, '..');
  const identity = packageIdentity(root);
  const packageName = options.packageName ?? process.env['PACKAGE_NAME'] ?? identity.name;
  const packageVersion =
    options.packageVersion ?? process.env['PACKAGE_VERSION'] ?? identity.version;
  const runner = options.runCommand ?? runPublishedCommand;
  const workDir = fs.mkdtempSync(
    path.join(options.temporaryRoot ?? os.tmpdir(), 'feynman-release-verify-'),
  );
  let primaryError: unknown;
  try {
    const npmEnv = isolatedNpmEnv(workDir);
    const fullName = `${packageName}@${packageVersion}`;
    const publishedVersion = run(runner, 'npm', ['view', fullName, 'version'], {
      cwd: root,
      env: consumerEnv(npmEnv),
    }).trim();
    if (publishedVersion.length === 0) throw new Error(`empty npm view result for ${fullName}`);
    if (publishedVersion !== packageVersion)
      throw new Error(
        `published version mismatch: expected ${packageVersion}, got ${publishedVersion}`,
      );
    const projectDir = path.join(workDir, 'project');
    const homeDir = path.join(workDir, 'home');
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });
    run(
      runner,
      'npm',
      [
        'install',
        '--prefix',
        projectDir,
        fullName,
        '--no-save',
        '--no-audit',
        '--no-fund',
        '--ignore-scripts',
      ],
      { cwd: root, env: consumerEnv(npmEnv) },
    );
    const bin = path.join(
      projectDir,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'feynman.cmd' : 'feynman',
    );
    if (!fs.existsSync(bin)) throw new Error(`feynman binary not found after install: ${bin}`);
    const homeEnv = consumerEnv({ HOME: homeDir });
    const version = run(runner, bin, ['version'], { cwd: root, env: homeEnv }).trim();
    if (version !== packageVersion)
      throw new Error(
        `installed package version mismatch: expected ${packageVersion}, got ${version}`,
      );
    run(runner, bin, ['install', '--force'], { cwd: root, env: homeEnv });
    if (!run(runner, bin, ['doctor'], { cwd: root, env: homeEnv }).includes('Status: OK'))
      throw new Error('released package doctor check failed');
    console.log(`release verification OK: ${fullName}`);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (cleanupError) {
      if (primaryError === undefined) throw cleanupError;
      throw new AggregateError(
        [primaryError, cleanupError],
        `${message(primaryError)}; cleanup also failed`,
        { cause: primaryError },
      );
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function verifyPublishedPackageMain(options: Readonly<VerifyPublishedOptions> = {}): void {
  try {
    verifyPublishedPackage(options);
  } catch (error) {
    process.stderr.write(`${message(error)}\n`);
    process.exitCode = 1;
  }
}
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href)
  verifyPublishedPackageMain();
