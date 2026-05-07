#!/usr/bin/env node
// scripts/release-smoke.js — verify the packed npm artifact installs and runs.
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));

function run(cmd, args, opts = {}) {
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
    process.stderr.write(`command failed: ${cmd} ${args.join(' ')}\n`);
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }
  return result.stdout || '';
}

function binPath(projectDir, name) {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(projectDir, 'node_modules', '.bin', `${name}${suffix}`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-release-smoke-'));

try {
  const packOut = run('npm', ['pack', '--pack-destination', tmp, '--json']);
  const packed = JSON.parse(packOut)[0];
  const tarball = path.join(tmp, packed.filename);
  if (!fs.existsSync(tarball)) {
    throw new Error(`tarball missing after npm pack: ${tarball}`);
  }

  const projectDir = path.join(tmp, 'project');
  const homeDir = path.join(tmp, 'home');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });

  run('npm', ['install', '--prefix', projectDir, tarball]);

  const feynman = binPath(projectDir, 'feynman');
  const lint = binPath(projectDir, 'feynman-lint');

  const version = run(feynman, ['version'], { env: { HOME: homeDir } }).trim();
  if (version !== pkg.version) {
    throw new Error(`version mismatch: expected ${pkg.version}, got ${version}`);
  }

  run(feynman, ['install', '--target', 'both', '--force'], { env: { HOME: homeDir } });

  const claudeDoctor = run(feynman, ['doctor', '--target', 'claude'], { env: { HOME: homeDir } });
  const codexDoctor = run(feynman, ['doctor', '--target', 'codex'], { env: { HOME: homeDir } });
  if (!claudeDoctor.includes('Status: OK') || !codexDoctor.includes('Status: OK')) {
    throw new Error('doctor smoke failed for packed install');
  }

  const lintOut = run(lint, ['--json', path.join(ROOT, 'tests', 'fixtures', 'valid-flow.md')]);
  const parsed = JSON.parse(lintOut);
  if (!Array.isArray(parsed.issues) || parsed.issues.length !== 0) {
    throw new Error('feynman-lint smoke expected zero issues');
  }

  console.log(`release smoke OK (${packed.filename})`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
