#!/usr/bin/env node
// scripts/verify-published-package.ts — verify a released package from npm registry.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROOT = path.resolve(import.meta.dirname, '..');
const pkg = require(path.join(ROOT, 'package.json')) as { version: string; name: string };

const packageName: string = process.env['PACKAGE_NAME'] || pkg.name;
const packageVersion: string = process.env['PACKAGE_VERSION'] || pkg.version;
let workDir: string | undefined;

interface RunOpts {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

function run(cmd: string, args: string[], opts: RunOpts = {}): string {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_COLOR: '1',
      ...opts.env,
    },
  });

  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    throw new Error(`command failed: ${cmd} ${args.join(' ')}`);
  }

  return result.stdout || '';
}

function npmViewVersion(fullName: string): string {
  const out = run('npm', ['view', fullName, 'version']);
  const version = (out || '').trim();
  if (!version) {
    throw new Error(`empty npm view result for ${fullName}`);
  }
  return version;
}

try {
  const fullName = `${packageName}@${packageVersion}`;
  const publishedVersion = npmViewVersion(fullName);
  if (publishedVersion !== packageVersion) {
    throw new Error(`published version mismatch: expected ${packageVersion}, got ${publishedVersion}`);
  }

  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-release-verify-'));
  const projectDir = path.join(workDir, 'project');
  const homeDir = path.join(workDir, 'home');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });

  run('npm', [
    'install',
    '--prefix',
    projectDir,
    fullName,
    '--no-save',
    '--no-audit',
    '--no-fund',
    '--ignore-scripts',
  ]);

  const bin: string = path.join(projectDir, 'node_modules', '.bin', process.platform === 'win32' ? 'feynman.cmd' : 'feynman');
  if (!fs.existsSync(bin)) {
    throw new Error(`feynman binary not found after install: ${bin}`);
  }

  const version = run(bin, ['version'], { env: { HOME: homeDir } }).trim();
  if (version !== packageVersion) {
    throw new Error(`installed package version mismatch: expected ${packageVersion}, got ${version}`);
  }

  run(bin, ['install', '--target', 'both', '--force'], { env: { HOME: homeDir } });
  const doctorOut = run(bin, ['doctor', '--target', 'both'], { env: { HOME: homeDir } });
  if (!doctorOut.includes('Status: OK')) {
    throw new Error('released package doctor check failed');
  }

  console.log(`release verification OK: ${fullName}`);
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
} finally {
  if (workDir) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
