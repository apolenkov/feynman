#!/usr/bin/env node
// scripts/release-smoke.ts — verify the packed npm artifact installs and runs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = require(path.join(ROOT, 'package.json')) as {
  version: string;
  name: string;
  files?: string[];
};
const NPM_CACHE: string =
  process.env['FEYNMAN_NPM_CACHE'] || path.join(os.tmpdir(), 'npm-cache-feynman');

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
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

function run(cmd: string, args: string[], opts: RunOpts = {}): string {
  const inheritedEnv = { ...process.env };
  // `npm run` exports this policy into child processes. It is valid for a
  // workspace, but npm 12 rejects it for the isolated --prefix install below.
  // A release smoke test must model a clean consumer environment instead.
  delete inheritedEnv['npm_config_allow_scripts'];
  delete inheritedEnv['NPM_CONFIG_ALLOW_SCRIPTS'];
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    env: {
      ...inheritedEnv,
      NO_COLOR: '1',
      npm_config_cache: NPM_CACHE,
      ...opts.env,
    },
  });
  if (result.status !== 0) {
    process.stderr.write(`command failed: ${cmd} ${args.join(' ')}\n`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
  return result.stdout || '';
}

function binPath(projectDir: string, name: string): string {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(projectDir, 'node_modules', '.bin', `${name}${suffix}`);
}

function readJson(filePath: string): Record<string, unknown> {
  const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`Expected JSON object: ${filePath}`);
  }
  return value as Record<string, unknown>;
}

function runtimeConfigPath(homeDir: string): string {
  return path.join(homeDir, '.codex', 'hooks.json');
}

function findHookCommand(
  config: Record<string, unknown>,
  eventName: string,
  scriptName: string,
): string {
  const hooks = config['hooks'] as Record<string, unknown[]> | undefined;
  const groups = (hooks && hooks[eventName]) || [];
  for (const group of groups as Array<{ hooks?: Array<{ command?: string }> }>) {
    for (const hook of group.hooks || []) {
      if (hook.command && hook.command.includes(scriptName)) {
        return hook.command;
      }
    }
  }
  throw new Error(`${scriptName} command missing in ${eventName}`);
}

interface HookStdin {
  hook_event_name?: string;
  session_id: string;
  prompt?: string;
}

function runHookCommand(command: string, homeDir: string, stdin: HookStdin): string {
  const result = spawnSync(command, [], {
    cwd: ROOT,
    shell: true,
    input: JSON.stringify(stdin),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homeDir,
      NO_COLOR: '1',
    },
    timeout: 10000,
  });
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`hook command failed: ${command}`);
  }
  return result.stdout || '';
}

function verifyInstalledHooks(homeDir: string): void {
  const cfg = readJson(runtimeConfigPath(homeDir));

  const sessionCommand = findHookCommand(cfg, 'SessionStart', 'feynman-session-start.js');
  const expectedHome = path.join(homeDir, '.codex');
  if (!sessionCommand.includes(expectedHome)) {
    throw new Error('Codex SessionStart command missing expected FEYNMAN_HOME');
  }

  const sessionOut = runHookCommand(sessionCommand, homeDir, {
    hook_event_name: 'SessionStart',
    session_id: 'codex-release-smoke',
  });
  if (!/<triggers>|<contract>|→|├──/.test(sessionOut)) {
    throw new Error('Codex SessionStart did not emit rule-file diagram tokens');
  }
}

function verifyTarballManifest(tarball: string, filesField: string[]): void {
  const result = spawnSync('tar', ['-tzf', tarball], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('failed to list tarball contents');
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

function readTarballEntry(tarball: string, entry: string): string {
  const result = spawnSync('tar', ['-xOf', tarball, `package/${entry}`], { encoding: 'utf8' });
  if (result.status !== 0 || !result.stdout) {
    throw new Error(`tarball entry missing or unreadable: ${entry}`);
  }
  return result.stdout;
}

/** Verify the installable artifact, not merely the source-tree plugin files. */
function verifyNativePlugin(tarball: string): void {
  const manifest = JSON.parse(
    readTarballEntry(tarball, 'plugins/feynman/.codex-plugin/plugin.json'),
  ) as Record<string, unknown>;
  const interfaceMeta = manifest['interface'];
  if (
    manifest['name'] !== 'feynman' ||
    manifest['version'] !== pkg.version ||
    manifest['skills'] !== './skills/' ||
    typeof interfaceMeta !== 'object' ||
    interfaceMeta === null ||
    Array.isArray(interfaceMeta) ||
    (interfaceMeta as Record<string, unknown>)['brandColor'] !== '#2563EB'
  ) {
    throw new Error('packed native Codex plugin manifest is incomplete or out of sync');
  }

  const skill = readTarballEntry(tarball, 'plugins/feynman/skills/feynman/SKILL.md');
  const settings = readTarballEntry(
    tarball,
    'plugins/feynman/skills/feynman/references/settings.md',
  );
  if (
    !/\]\(references\/settings\.md\)/.test(skill) ||
    !/npx -y @albinocrabs\/feynman@latest state/.test(settings)
  ) {
    throw new Error('packed native Codex skill lacks its linked CLI settings reference');
  }
  if (/disable-model-invocation/i.test(skill)) {
    throw new Error('packed native Codex skill contains non-discoverable metadata');
  }
}

// Expect a pre-built tarball in dist/ (produced by `npm run build`).
// Running npm pack here would pack raw .ts sources, which fail in node_modules.
const DIST = path.join(ROOT, 'dist');
const tarballTxt = path.join(DIST, 'TARBALL.txt');
if (!fs.existsSync(tarballTxt)) {
  process.stderr.write(`TARBALL.txt not found in dist/ — run 'npm run build' first.\n`);
  process.exit(1);
}
const expectedTarball = path.join(ROOT, fs.readFileSync(tarballTxt, 'utf8').trim());
if (!fs.existsSync(expectedTarball)) {
  process.stderr.write(
    `pre-built tarball not found: ${expectedTarball}\nRun 'npm run build' first.\n`,
  );
  process.exit(1);
}

verifyTarballManifest(expectedTarball, pkg.files ?? []);
verifyNativePlugin(expectedTarball);
console.log(`tarball manifest OK (${(pkg.files ?? []).length} files[] entries present)`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-release-smoke-'));

try {
  const tarball = expectedTarball;

  const projectDir = path.join(tmp, 'project');
  const homeDir = path.join(tmp, 'home');
  const npmEnv = isolatedNpmEnv(tmp);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });

  run('npm', ['install', '--prefix', projectDir, tarball], { env: npmEnv });

  const feynman = binPath(projectDir, 'feynman');
  const lint = binPath(projectDir, 'feynman-lint');

  const version = run(feynman, ['version'], { env: { HOME: homeDir } }).trim();
  if (version !== pkg.version) {
    throw new Error(`version mismatch: expected ${pkg.version}, got ${version}`);
  }

  run(feynman, ['install', '--force'], { env: { HOME: homeDir } });

  const codexDoctor = run(feynman, ['doctor'], { env: { HOME: homeDir } });
  if (!codexDoctor.includes('Status: OK'))
    throw new Error('Codex doctor smoke failed for packed install');
  verifyInstalledHooks(homeDir);

  const lintOut = run(lint, ['--json', path.join(ROOT, 'tests', 'fixtures', 'valid-flow.md')]);
  const parsed = JSON.parse(lintOut) as { issues: unknown[] };
  if (!Array.isArray(parsed.issues) || parsed.issues.length !== 0) {
    throw new Error('feynman-lint smoke expected zero issues');
  }

  console.log(`release smoke OK (${path.basename(tarball)})`);
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
