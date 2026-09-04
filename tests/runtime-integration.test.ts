// End-to-end verification of the installed Codex SessionStart hook.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertRecord,
  assertString,
  assertUnknownArray,
  parseJsonObject,
} from './helpers/assertions.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const FEYNMAN = path.join(ROOT, 'bin', 'feynman.ts');

function run(home: string, args: string[]) {
  const result = spawnSync(process.execPath, [FEYNMAN, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, NO_COLOR: '1' },
  });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function readJson(file: string): Record<string, unknown> {
  return parseJsonObject(fs.readFileSync(file, 'utf8'));
}

function runHook(home: string, command: string, input: unknown) {
  const result = spawnSync(command, [], {
    cwd: ROOT,
    shell: true,
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, HOME: home, NO_COLOR: '1' },
    timeout: 10_000,
  });
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function findSessionHook(config: Record<string, unknown>): string {
  const hooks = config['hooks'];
  assertRecord(hooks);
  const groups = hooks['SessionStart'];
  assertUnknownArray(groups);
  for (const group of groups) {
    assertRecord(group);
    const groupHooks = group['hooks'];
    assertUnknownArray(groupHooks);
    for (const hook of groupHooks) {
      assertRecord(hook);
      const command = hook['command'];
      assertString(command);
      if (command.includes('feynman-session-start.ts')) return command;
    }
  }
  assert.fail('Codex SessionStart hook command not found');
}

describe('installed Codex hook integration', () => {
  it('runs the generated SessionStart command end-to-end', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-runtime-int-'));
    try {
      const install = run(home, ['install', '--force']);
      assert.equal(install.status, 0, install.stderr);
      const codexHome = path.join(home, '.codex');
      const config = readJson(path.join(codexHome, 'hooks.json'));
      const command = findSessionHook(config);
      assert.match(command, /FEYNMAN_HOME=['"][^'"]+\/\.codex['"]/);
      const session = runHook(home, command, {
        hook_event_name: 'SessionStart',
        session_id: 'codex-session',
      });
      assert.equal(session.status, 0, session.stderr);
      assert.equal(session.stderr, '');
      assert.match(session.stdout, /<triggers>|<contract>|→|├──/);
      const state = readJson(path.join(codexHome, '.feynman', 'state.json'));
      assert.equal(state['enabled'], true);
      assert.equal(state['intensity'], 'full');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('runs silently when disabled', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-runtime-int-'));
    try {
      assert.equal(run(home, ['install', '--force']).status, 0);
      const codexHome = path.join(home, '.codex');
      fs.writeFileSync(
        path.join(codexHome, '.feynman', 'state.json'),
        JSON.stringify({ enabled: false, intensity: 'full', injections: 7 }),
      );
      fs.rmSync(path.join(codexHome, '.feynman-active'), { force: true });
      const command = findSessionHook(readJson(path.join(codexHome, 'hooks.json')));
      const session = runHook(home, command, {
        hook_event_name: 'SessionStart',
        session_id: 'disabled-session',
      });
      assert.equal(session.status, 0);
      assert.equal(session.stdout, '');
      assert.equal(session.stderr, '');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
