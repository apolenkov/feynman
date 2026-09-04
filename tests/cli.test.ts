// Codex CLI contract tests. Every command runs against an isolated HOME.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertDefined,
  assertRecord,
  assertString,
  assertUnknownArray,
  parseJsonObject,
} from './helpers/assertions.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLI = path.join(ROOT, 'bin', 'feynman.ts');

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-cli-'));
}
function run(home: string, args: string[], entrypoint = CLI) {
  const result = spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, NO_COLOR: '1' },
  });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}
function configPath(home: string): string {
  return path.join(home, '.codex', 'hooks.json');
}
function readConfig(home: string): Record<string, unknown> {
  return parseJsonObject(fs.readFileSync(configPath(home), 'utf8'));
}
function sessionStartGroups(home: string): unknown[] {
  const hooks = readConfig(home)['hooks'];
  assertRecord(hooks);
  const groups = hooks['SessionStart'];
  assertUnknownArray(groups);
  return groups;
}
function commandsInSessionStart(home: string): string[] {
  return sessionStartGroups(home).flatMap((group) => {
    assertRecord(group);
    const hooks = group['hooks'];
    assertUnknownArray(hooks);
    return hooks.map((hook) => {
      assertRecord(hook);
      const command = hook['command'];
      assertString(command);
      return command;
    });
  });
}
function readState(home: string): Record<string, unknown> {
  return parseJsonObject(
    fs.readFileSync(path.join(home, '.codex', '.feynman', 'state.json'), 'utf8'),
  );
}
function cleanup(home: string): void {
  fs.rmSync(home, { recursive: true, force: true });
}

describe('feynman CLI', () => {
  it('installs and executes hooks literally from paths containing quotes and dollar signs', () => {
    const temporary = tempHome();
    const home = path.join(temporary, "O'Brien $FEYNMAN_TEST_LABEL");
    const exported = path.join(temporary, "plugin's $FEYNMAN_TEST_LABEL");
    fs.mkdirSync(home);
    try {
      assert.equal(run(home, ['bootstrap', '--out', exported]).status, 0);
      const entrypoint = path.join(exported, 'bin', 'feynman.ts');
      assert.equal(run(home, ['install'], entrypoint).status, 0);
      assert.equal(run(home, ['install'], entrypoint).status, 0);
      const handlers = commandsInSessionStart(home);
      assert.equal(
        handlers.length,
        1,
        'literal command must remain recognizable on repeat install',
      );
      const command = handlers[0];
      assertDefined(command);
      const result = spawnSync('sh', ['-c', command], {
        cwd: temporary,
        input: '{"session_id":"quoted-path"}',
        encoding: 'utf8',
        env: { PATH: process.env['PATH'], HOME: home },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /<triggers>/);
      assert.deepEqual(
        fs.readdirSync(temporary).sort(),
        [path.basename(home), path.basename(exported)].sort(),
      );
      assert.equal(run(home, ['uninstall'], entrypoint).status, 0);
      assert.equal(readConfig(home)['hooks'], undefined);
    } finally {
      cleanup(temporary);
    }
  });

  it('rejects wrong configuration shapes without rewriting user bytes', () => {
    const home = tempHome();
    try {
      fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
      for (const value of [
        [],
        null,
        12,
        { hooks: [] },
        { hooks: { SessionStart: {} } },
        { hooks: { SessionStart: [null] } },
      ]) {
        const bytes = JSON.stringify(value);
        fs.writeFileSync(configPath(home), bytes);
        assert.equal(run(home, ['install', '--force']).status, 2);
        assert.equal(fs.readFileSync(configPath(home), 'utf8'), bytes);
      }
    } finally {
      cleanup(home);
    }
  });

  it('install preserves corrupt state in the recovery backup', () => {
    const home = tempHome();
    const state = path.join(home, '.codex', '.feynman', 'state.json');
    try {
      fs.mkdirSync(path.dirname(state), { recursive: true });
      fs.writeFileSync(state, '{ broken user bytes');
      assert.equal(run(home, ['install']).status, 0);
      assert.equal(fs.readFileSync(state + '.bak', 'utf8'), '{ broken user bytes');
    } finally {
      cleanup(home);
    }
  });

  it('preserves similarly named unrelated hooks through install and uninstall', () => {
    const home = tempHome();
    const unrelated = {
      hooks: [
        { command: 'node /tmp/not-feynman-session-start.js' },
        { command: 'echo "feynman-session-start.ts"' },
      ],
    };
    try {
      fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
      fs.writeFileSync(configPath(home), JSON.stringify({ hooks: { SessionStart: [unrelated] } }));
      const installed = run(home, ['install']);
      assert.equal(installed.status, 0);
      assert.doesNotMatch(installed.stdout, /already installed/);
      assert.equal(run(home, ['uninstall']).status, 0);
      assert.deepEqual(readConfig(home), { hooks: { SessionStart: [unrelated] } });
    } finally {
      cleanup(home);
    }
  });

  it('rejects invalid state commands without creating or repairing state', () => {
    for (const args of [['unknown'], ['on', 'extra'], ['style', 'wide']]) {
      const home = tempHome();
      try {
        assert.equal(run(home, ['state', ...args]).status, 2);
        assert.deepEqual(fs.readdirSync(home), []);
        const statePath = path.join(home, '.codex', '.feynman', 'state.json');
        fs.mkdirSync(path.dirname(statePath), { recursive: true });
        fs.writeFileSync(statePath, '{ broken');
        assert.equal(run(home, ['state', ...args]).status, 2);
        assert.equal(fs.readFileSync(statePath, 'utf8'), '{ broken');
        assert.deepEqual(fs.readdirSync(path.dirname(statePath)), ['state.json']);
        assert.equal(fs.existsSync(path.join(home, '.codex', '.feynman-active')), false);
      } finally {
        cleanup(home);
      }
    }
  });

  it('prints help and version', () => {
    const home = tempHome();
    try {
      const help = run(home, ['help']);
      assert.equal(help.status, 0);
      assert.match(help.stdout, /Codex/);
      const version = run(home, ['version']);
      assert.equal(version.status, 0);
      assert.match(version.stdout, /^\d+\.\d+\.\d+\n?$/);
    } finally {
      cleanup(home);
    }
  });

  it('installs one Codex SessionStart hook and is idempotent', () => {
    const home = tempHome();
    try {
      assert.equal(run(home, ['install']).status, 0);
      assert.equal(sessionStartGroups(home).length, 1);
      assert.equal(run(home, ['install']).status, 0);
      assert.equal(sessionStartGroups(home).length, 1);
    } finally {
      cleanup(home);
    }
  });

  it('preserves unrelated Codex settings while installing', () => {
    const home = tempHome();
    try {
      fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
      fs.writeFileSync(
        configPath(home),
        JSON.stringify({
          profile: 'work',
          hooks: { SessionStart: [{ hooks: [{ command: 'node other.js' }] }] },
        }),
      );
      assert.equal(run(home, ['install', '--force']).status, 0);
      const config = readConfig(home);
      assert.equal(config['profile'], 'work');
      assert.equal(sessionStartGroups(home).length, 2);
    } finally {
      cleanup(home);
    }
  });

  it('doctor reports a healthy installed Codex setup', () => {
    const home = tempHome();
    try {
      assert.equal(run(home, ['install']).status, 0);
      const doctor = run(home, ['doctor']);
      assert.equal(doctor.status, 0);
      assert.match(doctor.stdout, /Status: OK/);
      assert.match(doctor.stdout, /Codex/);
    } finally {
      cleanup(home);
    }
  });

  it('doctor reports malformed hook configuration without writing or failing', () => {
    const home = tempHome();
    try {
      fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
      fs.writeFileSync(configPath(home), '{broken');
      const doctor = run(home, ['doctor']);
      assert.equal(doctor.status, 0);
      assert.match(doctor.stdout, /hook config invalid/);
      assert.match(doctor.stdout, /not valid JSON/);
      assert.match(doctor.stdout, /Status: ISSUES/);
      assert.equal(doctor.stderr, '');
      assert.equal(fs.readFileSync(configPath(home), 'utf8'), '{broken');
    } finally {
      cleanup(home);
    }
  });

  it('uninstall removes Feynman hooks and preserves state', () => {
    const home = tempHome();
    try {
      assert.equal(run(home, ['install']).status, 0);
      const statePath = path.join(home, '.codex', '.feynman', 'state.json');
      assert.equal(run(home, ['uninstall']).status, 0);
      const hooks = readConfig(home)['hooks'];
      assert.equal(hooks, undefined);
      assert.ok(fs.existsSync(statePath));
    } finally {
      cleanup(home);
    }
  });

  it('rejects removed target flags instead of silently selecting an adapter', () => {
    const home = tempHome();
    try {
      const install = run(home, ['install', '--target', 'codex']);
      assert.equal(install.status, 2);
      assert.match(install.stderr, /unexpected arguments/);
      const doctor = run(home, ['doctor', '--target', 'codex']);
      assert.equal(doctor.status, 2);
      assert.match(doctor.stderr, /unexpected arguments/);
    } finally {
      cleanup(home);
    }
  });

  it('refuses to overwrite malformed Codex configuration', () => {
    const home = tempHome();
    try {
      fs.mkdirSync(path.dirname(configPath(home)), { recursive: true });
      fs.writeFileSync(configPath(home), '{ invalid');
      const result = run(home, ['install', '--force']);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /not valid JSON|refusing/i);
      assert.equal(fs.readFileSync(configPath(home), 'utf8'), '{ invalid');
    } finally {
      cleanup(home);
    }
  });

  it('bootstraps native Codex files without hook manifests', () => {
    const home = tempHome();
    const cwd = process.cwd();
    try {
      const out = path.join(home, 'bootstrap');
      const result = spawnSync(process.execPath, [CLI, 'bootstrap', '--out', out], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, HOME: home, NO_COLOR: '1' },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(fs.existsSync(path.join(out, '.agents', 'plugins', 'marketplace.json')));
      assert.ok(
        fs.existsSync(path.join(out, 'plugins', 'feynman', '.codex-plugin', 'plugin.json')),
      );
      assert.equal(fs.existsSync(path.join(out, 'hooks', 'hooks.json')), false);
      assert.equal(fs.existsSync(path.join(out, 'skills')), false);
    } finally {
      process.chdir(cwd);
      cleanup(home);
    }
  });

  it('manages Codex state and keeps the active flag invariant', () => {
    const home = tempHome();
    const statePath = path.join(home, '.codex', '.feynman', 'state.json');
    const flagPath = path.join(home, '.codex', '.feynman-active');
    try {
      const initial = run(home, ['state']);
      assert.equal(initial.status, 0);
      assert.match(initial.stdout, /feynman: on · intensity full · style full · injections 0/);
      assert.equal(fs.existsSync(statePath), false, 'status must not create state');
      assert.equal(fs.existsSync(flagPath), false, 'status must not create the active flag');

      assert.equal(run(home, ['state', 'lite']).status, 0);
      assert.equal(readState(home)['intensity'], 'lite');
      assert.equal(fs.readFileSync(flagPath, 'utf8'), 'lite');
      assert.equal(run(home, ['state', 'style', 'short']).status, 0);
      assert.equal(readState(home)['output_style'], 'short');

      assert.equal(run(home, ['state', 'off']).status, 0);
      assert.equal(readState(home)['enabled'], false);
      assert.equal(fs.existsSync(flagPath), false);
      assert.equal(run(home, ['status']).status, 0);
      assert.equal(run(home, ['state', 'start']).status, 0);
      assert.ok(fs.existsSync(flagPath));
    } finally {
      cleanup(home);
    }
  });

  it('rejects target flags and invalid state values', () => {
    const home = tempHome();
    try {
      const target = run(home, ['state', '--target', 'codex']);
      assert.equal(target.status, 2);
      assert.match(target.stderr, /unknown state command|unexpected arguments/i);
      const style = run(home, ['state', 'style', 'wide']);
      assert.equal(style.status, 2);
      assert.match(style.stderr, /usage: feynman state style/);
    } finally {
      cleanup(home);
    }
  });
});
