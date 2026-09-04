// tests/hook.test.ts — end-to-end coverage for the single SessionStart hook.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readState } from '../bin/adapters/state-store.ts';

import { assertTagPairs, readRulesForIntensity } from '../lib/state/index.ts';

const SESSION_HOOK_PATH = path.resolve(
  import.meta.dirname,
  '..',
  'hooks',
  'feynman-session-start.ts',
);

interface HookResult {
  status: number;
  stdout: string;
  stderr: string;
}

function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-session-hook-test-'));
}

function removeTempHome(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function writeState(root: string, state: Record<string, unknown>, active = true): void {
  const feynmanDir = path.join(root, '.feynman');
  fs.mkdirSync(feynmanDir, { recursive: true });
  fs.writeFileSync(path.join(feynmanDir, 'state.json'), JSON.stringify(state));
  if (active) fs.writeFileSync(path.join(root, '.feynman-active'), 'full');
}

function runSessionHook(
  home: string,
  input: unknown = { session_id: 'test-session' },
  env: NodeJS.ProcessEnv = {},
): HookResult {
  const result = spawnSync(process.execPath, [SESSION_HOOK_PATH], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, HOME: home, ...env },
    timeout: 10_000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('SessionStart rule injection', () => {
  it('rejects malformed event shapes before creating state', () => {
    for (const input of [
      null,
      [],
      42,
      'session',
      { session_id: null },
      { session_id: 42 },
      { session_id: {} },
    ]) {
      const home = makeTempHome();
      try {
        const result = runSessionHook(home, input);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
        assert.equal(fs.existsSync(path.join(home, '.codex', '.feynman')), false);
      } finally {
        removeTempHome(home);
      }
    }
  });

  it('bootstraps active default state and writes raw rules', () => {
    const home = makeTempHome();
    try {
      const result = runSessionHook(home);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /<triggers>|<contract>|→|├──/);
      assert.equal(
        result.stdout.endsWith('\n'),
        false,
        'hook output must not add a trailing newline',
      );

      const root = path.join(home, '.codex');
      const state = readState(root);
      assert.deepEqual(state, {
        enabled: true,
        intensity: 'full',
        output_style: 'full',
        injections: 1,
      });
      assert.ok(fs.existsSync(path.join(root, '.feynman-active')));
    } finally {
      removeTempHome(home);
    }
  });

  it('uses FEYNMAN_HOME for Codex state without changing the configured Codex home', () => {
    const home = makeTempHome();
    const codexHome = path.join(home, '.codex');
    try {
      writeState(codexHome, {
        enabled: true,
        intensity: 'lite',
        output_style: 'full',
        injections: 3,
      });
      const preferences = fs.readFileSync(path.join(codexHome, '.feynman', 'state.json'), 'utf8');
      const result = runSessionHook(
        home,
        { session_id: 'codex-session' },
        { FEYNMAN_HOME: codexHome },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /<triggers>|<contract>|→|├──/);
      assert.equal(
        fs.readFileSync(path.join(codexHome, '.feynman', 'state.json'), 'utf8'),
        preferences,
      );
      const state = readState(codexHome);
      assert.ok(state);
      assert.equal(
        state['injections'],
        4,
        'each successful SessionStart injection increments the local counter',
      );
    } finally {
      removeTempHome(home);
    }
  });

  it('is silent and removes a stale active flag when state is disabled', () => {
    const home = makeTempHome();
    const root = path.join(home, '.codex');
    try {
      writeState(root, { enabled: false, intensity: 'full', output_style: 'full', injections: 0 });
      const result = runSessionHook(home);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      assert.equal(fs.existsSync(path.join(root, '.feynman-active')), false);
    } finally {
      removeTempHome(home);
    }
  });

  it('is silent for unsafe session identifiers', () => {
    const home = makeTempHome();
    try {
      const result = runSessionHook(home, { session_id: '../../outside' });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, '');
      assert.equal(fs.existsSync(path.join(home, '.codex', '.feynman', 'state.json')), false);
    } finally {
      removeTempHome(home);
    }
  });

  it('rejects malformed XML and legacy HTML-comment rule files', () => {
    const home = makeTempHome();
    const root = path.join(home, '.codex');
    const malformedRules = path.join(home, 'malformed.md');
    const legacyRules = path.join(home, 'legacy.md');
    try {
      writeState(root, { enabled: true, intensity: 'full', output_style: 'full', injections: 0 });
      fs.writeFileSync(malformedRules, '<intensity name="full">broken');
      fs.writeFileSync(legacyRules, '<!-- full -->legacy rules<!-- /full -->');

      const malformed = runSessionHook(home, undefined, { FEYNMAN_RULES_PATH: malformedRules });
      const legacy = runSessionHook(home, undefined, { FEYNMAN_RULES_PATH: legacyRules });
      assert.equal(malformed.status, 0, malformed.stderr);
      assert.equal(malformed.stdout, '');
      assert.equal(legacy.status, 0, legacy.stderr);
      assert.equal(legacy.stdout, '');
    } finally {
      removeTempHome(home);
    }
  });

  it('appends the configured output-style suffix to SessionStart output', () => {
    const home = makeTempHome();
    const root = path.join(home, '.codex');
    try {
      writeState(root, { enabled: true, intensity: 'full', output_style: 'short', injections: 0 });
      const result = runSessionHook(home);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Output style: short/);
    } finally {
      removeTempHome(home);
    }
  });

  it('normalizes a malformed injection counter before incrementing it', () => {
    const home = makeTempHome();
    const root = path.join(home, '.codex');
    try {
      writeState(root, {
        enabled: true,
        intensity: 'full',
        output_style: 'full',
        injections: 'broken',
      });
      const result = runSessionHook(home);
      assert.equal(result.status, 0, result.stderr);
      const state = readState(root);
      assert.ok(state);
      assert.equal(state['injections'], 1);
    } finally {
      removeTempHome(home);
    }
  });
});

describe('rules-file format contract', () => {
  it('uses only balanced XML intensity blocks', () => {
    assert.equal(assertTagPairs('<intensity name="full">rules</intensity>'), true);
    assert.equal(assertTagPairs('<intensity name="full">rules'), false);
    assert.equal(
      readRulesForIntensity('<intensity name="full">rules</intensity>', 'full'),
      'rules',
    );
    assert.equal(readRulesForIntensity('<!-- full -->legacy<!-- /full -->', 'full'), '');
  });
});
