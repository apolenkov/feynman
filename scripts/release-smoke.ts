#!/usr/bin/env node
// scripts/release-smoke.ts — verify the packed npm artifact installs and runs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
interface CommandResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
}
interface CommandOptions {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly shell?: boolean;
  readonly input?: string;
  readonly timeout?: number;
}
export type ReleaseCommandRunner = (
  command: string,
  args: readonly string[],
  options: Readonly<CommandOptions>,
) => CommandResult;
export interface ReleaseSmokeOptions {
  readonly root?: string;
  readonly temporaryRoot?: string;
  readonly runCommand?: ReleaseCommandRunner;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function packageMetadata(root: string): Readonly<{ version: string; files: readonly string[] }> {
  const value: unknown = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!isRecord(value) || typeof value['version'] !== 'string')
    throw new Error('package.json version must be a string');
  const files = value['files'];
  if (
    files !== undefined &&
    (!Array.isArray(files) || !files.every((item) => typeof item === 'string'))
  )
    throw new Error('package.json files must be an array of strings');
  return { version: value['version'], files: files ?? [] };
}
function textOutput(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString();
  return '';
}
export function runReleaseCommand(
  command: string,
  args: readonly string[],
  options: Readonly<CommandOptions>,
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

function isolatedNpmEnv(root: string): NodeJS.ProcessEnv {
  // Isolate both HOME and npm's user config so a developer's global npm policy
  // cannot make this package-level smoke test environment-dependent.
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

interface RunOpts {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

function run(
  runner: ReleaseCommandRunner,
  root: string,
  npmCache: string,
  cmd: string,
  args: readonly string[],
  opts: RunOpts = {},
): string {
  // `npm run` exports this policy into child processes. It is valid for a
  // workspace, but npm 12 rejects it for the isolated --prefix install below.
  // A release smoke test must model a clean consumer environment instead.
  const inheritedEnv = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => name !== 'npm_config_allow_scripts' && name !== 'NPM_CONFIG_ALLOW_SCRIPTS',
    ),
  );
  const result = runner(cmd, args, {
    cwd: opts.cwd ?? root,
    env: {
      ...inheritedEnv,
      NO_COLOR: '1',
      npm_config_cache: npmCache,
      ...opts.env,
    },
  });
  const { stdout, stderr } = result;
  if (result.status !== 0 || result.error !== undefined || result.signal !== null) {
    throw new Error(
      [
        `command failed: ${cmd} ${args.join(' ')}`,
        result.error?.message ?? '',
        result.signal === null ? '' : `terminated by signal: ${result.signal}`,
        stdout,
        stderr,
      ]
        .filter((part) => part.length > 0)
        .join('\n'),
    );
  }
  return stdout;
}

function binPath(projectDir: string, name: string): string {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(projectDir, 'node_modules', '.bin', `${name}${suffix}`);
}

function readJson(filePath: string): Record<string, unknown> {
  const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!isRecord(value)) {
    throw new Error(`Expected JSON object: ${filePath}`);
  }
  return value;
}

function runtimeConfigPath(homeDir: string): string {
  return path.join(homeDir, '.codex', 'hooks.json');
}

function findHookCommand(
  config: Record<string, unknown>,
  eventName: string,
  scriptName: string,
): string {
  const hooks = config['hooks'];
  if (!isRecord(hooks)) throw new Error('hooks config must contain an object');
  const groups = hooks[eventName];
  if (!Array.isArray(groups)) throw new Error(`${eventName} hooks must be an array`);
  for (const group of groups) {
    if (!isRecord(group)) continue;
    const commands = group['hooks'];
    if (!Array.isArray(commands)) continue;
    for (const hook of commands) {
      if (!isRecord(hook)) continue;
      const command = hook['command'];
      if (typeof command === 'string' && command.includes(scriptName)) return command;
    }
  }
  throw new Error(`${scriptName} command missing in ${eventName}`);
}

interface HookStdin {
  hook_event_name?: string;
  session_id: string;
  prompt?: string;
}

function runHookCommand(
  runner: ReleaseCommandRunner,
  root: string,
  command: string,
  homeDir: string,
  stdin: HookStdin,
): string {
  const result = runner(command, [], {
    cwd: root,
    shell: true,
    input: JSON.stringify(stdin),
    env: {
      ...process.env,
      HOME: homeDir,
      NO_COLOR: '1',
    },
    timeout: 10000,
  });
  const { stdout, stderr } = result;
  if (result.status !== 0 || result.error !== undefined || result.signal !== null) {
    throw new Error(
      [
        `hook command failed: ${command}`,
        result.error?.message ?? '',
        result.signal === null ? '' : `terminated by signal: ${result.signal}`,
        stdout,
        stderr,
      ]
        .filter((part) => part.length > 0)
        .join('\n'),
    );
  }
  return stdout;
}

function verifyInstalledHooks(runner: ReleaseCommandRunner, root: string, homeDir: string): void {
  const cfg = readJson(runtimeConfigPath(homeDir));

  const sessionCommand = findHookCommand(cfg, 'SessionStart', 'feynman-session-start.js');
  const expectedHome = path.join(homeDir, '.codex');
  if (!sessionCommand.includes(expectedHome)) {
    throw new Error('Codex SessionStart command missing expected FEYNMAN_HOME');
  }

  const sessionOut = runHookCommand(runner, root, sessionCommand, homeDir, {
    hook_event_name: 'SessionStart',
    session_id: 'codex-release-smoke',
  });
  if (!/<triggers>|<contract>|→|├──/.test(sessionOut)) {
    throw new Error('Codex SessionStart did not emit rule-file diagram tokens');
  }
}

function verifyTarballManifest(
  runner: ReleaseCommandRunner,
  root: string,
  tarball: string,
  filesField: readonly string[],
): void {
  const result = runner('tar', ['-tzf', tarball], { cwd: root, env: { ...process.env } });
  if (result.status !== 0 || result.error !== undefined || result.signal !== null)
    throw new Error(
      [
        'failed to list tarball contents',
        result.error?.message ?? '',
        result.signal === null ? '' : `terminated by signal: ${result.signal}`,
        result.stderr,
      ]
        .filter((part) => part.length > 0)
        .join('\n'),
    );
  const entries = new Set(
    result.stdout.split('\n').map((e) => e.replace(/^package\//, '').replace(/\/$/, '')),
  );
  for (const entry of filesField) {
    const name = entry.replace(/\/$/, '');
    if (entry.endsWith('/')) {
      if (![...entries].some((e) => e === name || e.startsWith(name + '/'))) {
        throw new Error(`tarball missing files[] directory: ${entry}`);
      }
    } else {
      if (!entries.has(name)) {
        throw new Error(`tarball missing files[] entry: ${entry}`);
      }
    }
  }
}

function readTarballEntry(
  runner: ReleaseCommandRunner,
  root: string,
  tarball: string,
  entry: string,
): string {
  const result = runner('tar', ['-xOf', tarball, `package/${entry}`], {
    cwd: root,
    env: { ...process.env },
  });
  const { stdout } = result;
  if (
    result.status !== 0 ||
    result.error !== undefined ||
    result.signal !== null ||
    stdout.length === 0
  ) {
    throw new Error(
      [
        `tarball entry missing or unreadable: ${entry}`,
        result.error?.message ?? '',
        result.signal === null ? '' : `terminated by signal: ${result.signal}`,
        result.stderr,
      ]
        .filter((part) => part.length > 0)
        .join('\n'),
    );
  }
  return stdout;
}

/** Verify the installable artifact, not merely the source-tree plugin files. */
function verifyNativePlugin(
  runner: ReleaseCommandRunner,
  root: string,
  tarball: string,
  packageVersion: string,
): void {
  const manifestValue: unknown = JSON.parse(
    readTarballEntry(runner, root, tarball, 'plugins/feynman/.codex-plugin/plugin.json'),
  );
  if (!isRecord(manifestValue))
    throw new Error('packed native Codex plugin manifest must contain an object');
  const manifest = manifestValue;
  const interfaceMeta = manifest['interface'];
  if (
    manifest['name'] !== 'feynman' ||
    manifest['version'] !== packageVersion ||
    manifest['skills'] !== './skills/' ||
    !isRecord(interfaceMeta) ||
    interfaceMeta['brandColor'] !== '#2563EB'
  ) {
    throw new Error('packed native Codex plugin manifest is incomplete or out of sync');
  }

  const skill = readTarballEntry(runner, root, tarball, 'plugins/feynman/skills/feynman/SKILL.md');
  const settings = readTarballEntry(
    runner,
    root,
    tarball,
    'plugins/feynman/skills/feynman/references/settings.md',
  );
  if (
    !skill.includes('](references/settings.md)') ||
    !settings.includes('feynman state [status|on|off')
  ) {
    throw new Error('packed native Codex skill lacks its linked CLI settings reference');
  }
  if (/^(?:npx\s+(?:-y\s+)?@albinocrabs\/feynman|npm exec\b)/im.test(settings)) {
    throw new Error('packed native Codex skill settings contain an automatic remote runner');
  }
  if (/disable-model-invocation/i.test(skill)) {
    throw new Error('packed native Codex skill contains non-discoverable metadata');
  }
}

export function releaseSmoke(options: Readonly<ReleaseSmokeOptions> = {}): void {
  const root = options.root ?? ROOT;
  const runner = options.runCommand ?? runReleaseCommand;
  const npmCache = process.env['FEYNMAN_NPM_CACHE'] ?? path.join(os.tmpdir(), 'npm-cache-feynman');
  const pkg = packageMetadata(root);
  // Expect a pre-built tarball in dist/ (produced by `npm run build`).
  // Running npm pack here would pack raw .ts sources, which fail in node_modules.
  const DIST = path.join(root, 'dist');
  const tarballTxt = path.join(DIST, 'TARBALL.txt');
  if (!fs.existsSync(tarballTxt)) {
    throw new Error(`TARBALL.txt not found in dist/ — run 'npm run build' first.`);
  }
  const expectedTarball = path.join(root, fs.readFileSync(tarballTxt, 'utf8').trim());
  if (!fs.existsSync(expectedTarball)) {
    throw new Error(`pre-built tarball not found: ${expectedTarball}\nRun 'npm run build' first.`);
  }

  verifyTarballManifest(runner, root, expectedTarball, pkg.files);
  verifyNativePlugin(runner, root, expectedTarball, pkg.version);
  console.log(`tarball manifest OK (${pkg.files.length} files[] entries present)`);

  const tmp = fs.mkdtempSync(
    path.join(options.temporaryRoot ?? os.tmpdir(), 'feynman-release-smoke-'),
  );

  let primaryError: unknown;
  try {
    const tarball = expectedTarball;

    const projectDir = path.join(tmp, 'project');
    const homeDir = path.join(tmp, 'home');
    const npmEnv = isolatedNpmEnv(tmp);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });

    run(runner, root, npmCache, 'npm', ['install', '--prefix', projectDir, tarball], {
      env: npmEnv,
    });

    const feynman = binPath(projectDir, 'feynman');
    const lint = binPath(projectDir, 'feynman-lint');

    const version = run(runner, root, npmCache, feynman, ['version'], {
      env: { HOME: homeDir },
    }).trim();
    if (version !== pkg.version) {
      throw new Error(`version mismatch: expected ${pkg.version}, got ${version}`);
    }

    run(runner, root, npmCache, feynman, ['install', '--force'], { env: { HOME: homeDir } });

    const codexDoctor = run(runner, root, npmCache, feynman, ['doctor'], {
      env: { HOME: homeDir },
    });
    if (!codexDoctor.includes('Status: OK'))
      throw new Error('Codex doctor smoke failed for packed install');
    verifyInstalledHooks(runner, root, homeDir);

    const lintOut = run(runner, root, npmCache, lint, [
      '--json',
      path.join(root, 'tests', 'fixtures', 'valid-flow.md'),
    ]);
    const parsed: unknown = JSON.parse(lintOut);
    if (!isRecord(parsed) || !Array.isArray(parsed['issues']) || parsed['issues'].length !== 0) {
      throw new Error('feynman-lint smoke expected zero issues');
    }

    console.log(`release smoke OK (${path.basename(tarball)})`);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch (cleanupError) {
      if (primaryError === undefined) throw cleanupError;
      throw new AggregateError(
        [primaryError, cleanupError],
        `${errorMessage(primaryError)}; cleanup also failed`,
        { cause: primaryError },
      );
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function releaseSmokeMain(options: Readonly<ReleaseSmokeOptions> = {}): void {
  try {
    releaseSmoke(options);
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  releaseSmokeMain();
}
