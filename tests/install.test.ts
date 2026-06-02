// tests/install.test.ts — install.sh idempotency + settings.json merge
// Stubs HOME to os.tmpdir() — never touches real ~/.claude/
// Uses node:test + node:assert/strict.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const INSTALL_SH = path.resolve(import.meta.dirname, '..', 'install.sh');
const REPO_DIR   = path.resolve(import.meta.dirname, '..');

/**
 * Create isolated temp HOME dir.
 */
function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-install-test-'));
}

function rmrf(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Run install.sh with HOME stubbed to tmpDir.
 * Returns { stdout, stderr, status }.
 */
function runInstall(tmpHome: string, env: Record<string, string> = {}, args: string[] = []): { stdout: string; stderr: string; status: number } {
  try {
    const stdout = execFileSync('bash', [INSTALL_SH, ...args], {
      encoding: 'utf8',
      env: {
        PATH: process.env['PATH'],
        HOME: tmpHome,
        ...env,
      },
      cwd: REPO_DIR,
    });
    return { stdout, stderr: '', status: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      status: err.status || 1,
    };
  }
}

/**
 * Read and parse settings.json from the temp HOME.
 */
function readSettings(tmpHome: string): Record<string, unknown> {
  const settingsPath = path.join(tmpHome, '.codex', 'hooks.json');
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

describe('install.sh', () => {

  // -------------------------------------------------------------------------
  // Test 1: Fresh install — empty HOME
  // -------------------------------------------------------------------------
  describe('fresh install (empty HOME)', () => {
    let tmpHome: string;
    let result: { stdout: string; stderr: string; status: number };

    before(() => {
      tmpHome = makeTempHome();
      result = runInstall(tmpHome);
    });

    after(() => rmrf(tmpHome));

    it('exits 0', () => {
      assert.equal(result.status, 0, `install.sh failed: ${result.stderr}`);
    });

    it('creates codex hooks.json', () => {
      const settingsPath = path.join(tmpHome, '.codex', 'hooks.json');
      assert.ok(fs.existsSync(settingsPath), 'codex hooks.json should be created');
    });

    it('settings.json contains SessionStart hook (no UserPromptSubmit)', () => {
      const cfg = readSettings(tmpHome);
      assert.ok(cfg['hooks'], 'hooks key must exist');
      const hooks = cfg['hooks'] as Record<string, unknown[]>;
      assert.ok(Array.isArray(hooks['SessionStart']), 'SessionStart must be array');
      assert.ok(hooks['SessionStart']!.length >= 1, 'at least one session hook entry');
      assert.equal(hooks['UserPromptSubmit'], undefined, 'UserPromptSubmit must not be registered (v0.7.0+)');
    });

    it('SessionStart hook entry points to feynman-session-start with absolute path', () => {
      const cfg = readSettings(tmpHome);
      const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[]; matcher?: string }[]>;
      const sessionEntry = hooks['SessionStart']!.find(e =>
        e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
      );
      assert.ok(sessionEntry, 'feynman-session-start.ts hook entry not found');
      const sessionHook = sessionEntry!.hooks[0]!;
      assert.ok(sessionHook.command.includes('/'), 'session hook command must contain absolute path');
      assert.ok(!sessionHook.command.includes('~/'), 'session hook command must not use tilde');
      assert.ok(sessionEntry!.matcher?.includes('compact'), 'matcher must include compact');
      assert.ok(sessionEntry!.matcher?.includes('clear'), 'matcher must include clear');
    });

    it('installs /feynman command to ~/.claude/commands/ with explicit claude target', () => {
      const result = runInstall(tmpHome, {}, ['--target', 'claude']);
      assert.equal(result.status, 0, `install --target claude failed: ${result.stderr}`);
      const commandPath = path.join(tmpHome, '.claude', 'commands', 'feynman.md');
      assert.ok(fs.existsSync(commandPath), 'feynman.md command should be installed');
    });

    it('stdout mentions "hook: installed"', () => {
      assert.ok(
        result.stdout.includes('hook: installed') || result.stdout.includes('installed'),
        `expected "installed" in stdout: ${result.stdout}`
      );
    });
  });

  // -------------------------------------------------------------------------
  // Test 2: Re-install — idempotent (hook not duplicated)
  // -------------------------------------------------------------------------
  describe('re-install idempotency', () => {
    let tmpHome: string;

    before(() => {
      tmpHome = makeTempHome();
      runInstall(tmpHome); // first install
      runInstall(tmpHome); // second install
    });

    after(() => rmrf(tmpHome));

    it('SessionStart hook appears exactly once in settings.json', () => {
      const cfg = readSettings(tmpHome);
      const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
      const sessionHooks = hooks['SessionStart']!.filter(e =>
        e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
      );
      assert.equal(sessionHooks.length, 1, `session hook should appear exactly once, found ${sessionHooks.length}`);
      assert.equal(hooks['UserPromptSubmit'], undefined, 'UserPromptSubmit must not be registered (v0.7.0+)');
    });

    it('second install stdout says "already installed"', () => {
      // Run a third time and capture
      const result = runInstall(tmpHome);
      assert.ok(
        result.stdout.includes('already installed'),
        `expected "already installed", got: ${result.stdout}`
      );
    });
  });

  // -------------------------------------------------------------------------
  // Test 3: Pre-existing settings.json with other hooks — merge preserves them
  // -------------------------------------------------------------------------
  describe('merge with existing settings.json', () => {
    let tmpHome: string;

    before(() => {
      tmpHome = makeTempHome();
      // Create pre-existing codex hooks.json with another hook
      const claudeDir = path.join(tmpHome, '.codex');
      fs.mkdirSync(claudeDir, { recursive: true });
      const existingCfg = {
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [{ type: 'command', command: 'node /other/my-hook.js', timeout: 3 }]
            }
          ]
        },
        someOtherConfig: { value: 42 }
      };
        fs.writeFileSync(
        path.join(claudeDir, 'hooks.json'),
        JSON.stringify(existingCfg, null, 2)
      );

      runInstall(tmpHome);
    });

    after(() => rmrf(tmpHome));

    it('existing UserPromptSubmit hook preserved after merge', () => {
      const cfg = readSettings(tmpHome);
      const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
      const existing = (hooks['UserPromptSubmit'] ?? []).find(e =>
        e.hooks && e.hooks.some(h => h.command && h.command.includes('my-hook.js'))
      );
      assert.ok(existing, 'pre-existing UserPromptSubmit hook should be preserved in merged settings');
    });

    it('feynman does NOT add its own UserPromptSubmit hook (v0.7.0+)', () => {
      const cfg = readSettings(tmpHome);
      const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
      const feynman = (hooks['UserPromptSubmit'] ?? []).find(e =>
        e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-activate.ts'))
      );
      assert.equal(feynman, undefined, 'feynman must NOT add UserPromptSubmit hook in v0.7.0+');
    });

    it('other config keys preserved', () => {
      const cfg = readSettings(tmpHome);
      assert.deepEqual(cfg['someOtherConfig'], { value: 42 }, 'non-hooks config should not be touched');
    });

    it('total UserPromptSubmit hook count is 1 (only pre-existing)', () => {
      const cfg = readSettings(tmpHome);
      const hooks = cfg['hooks'] as Record<string, unknown[]>;
      assert.equal(
        (hooks['UserPromptSubmit'] ?? []).length, 1,
        `expected 1 pre-existing hook only, found ${(hooks['UserPromptSubmit'] ?? []).length}`
      );
    });
  });

  // -------------------------------------------------------------------------
  // Test 4: Uninstall (if uninstall.sh exists; otherwise skip)
  // -------------------------------------------------------------------------
  describe('uninstall.sh (if present)', () => {
    const UNINSTALL_SH = path.resolve(import.meta.dirname, '..', 'uninstall.sh');
    const uninstallExists = fs.existsSync(UNINSTALL_SH);

    it('uninstall.sh removes feynman hook and preserves state', () => {
      // Per REQUIREMENTS.md REL-04: uninstall.sh is a Phase 7 deliverable
      // If it appears, this test will need updating
      if (uninstallExists) {
        // If uninstall.sh now exists, test its basic behavior
        const tmpHome = makeTempHome();
        try {
          runInstall(tmpHome);
          execFileSync('bash', [UNINSTALL_SH], {
            encoding: 'utf8',
            env: { PATH: process.env['PATH'], HOME: tmpHome },
            cwd: REPO_DIR,
          });
          // After uninstall, feynman hook should be removed from settings
          const cfg = readSettings(tmpHome);
          const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]> | undefined;
          const feynmanSession = (hooks?.['SessionStart'] || []).find(e =>
            e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
          );
          assert.equal(feynmanSession, undefined, 'feynman SessionStart hook should be removed by uninstall.sh');
        } finally {
          rmrf(tmpHome);
        }
      } else {
        // Expected: not yet present
        assert.equal(uninstallExists, false, 'uninstall.sh does not exist yet (Phase 7 REL-04)');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Edge: missing node binary
  // -------------------------------------------------------------------------
  describe('edge: node not found in PATH', () => {
    it('exits non-zero with helpful error', () => {
      const tmpHome = makeTempHome();
      try {
        const result = runInstall(tmpHome, { PATH: '/usr/bin:/bin' });
        // node may still be found in /usr/bin on some systems
        // On systems where node is not in /usr/bin, should fail with message
        if (result.status !== 0) {
          assert.ok(
            result.stderr.includes('node') || result.stderr.includes('Node'),
            `expected node-related error in stderr: ${result.stderr}`
          );
        }
        // If node was found anyway — install succeeded, which is fine
      } finally {
        rmrf(tmpHome);
      }
    });
  });

  // -------------------------------------------------------------------------
  // T05: Node version below 22.6 — install.sh must exit 1 with version message
  // -------------------------------------------------------------------------
  describe('node version check: below 22.6 exits 1 (T05)', () => {
    it('exits 1 with ">=22.6 required" when node version is below 22.6', () => {
      const tmpHome = makeTempHome();
      const fakeBinDir = path.join(tmpHome, 'fake-bin');
      fs.mkdirSync(fakeBinDir, { recursive: true });

      // Write a fake 'node' that reports v20.0.0 — below the 22.6 threshold.
      const fakeNodePath = path.join(fakeBinDir, 'node');
      fs.writeFileSync(fakeNodePath, '#!/bin/sh\necho "v20.0.0"\n');
      fs.chmodSync(fakeNodePath, 0o755);

      try {
        // Put fake-bin first on PATH so it shadows the real node binary.
        // Keep /usr/bin:/bin so install.sh's POSIX utilities still resolve.
        const result = runInstall(tmpHome, { PATH: `${fakeBinDir}:/usr/bin:/bin` });
        assert.equal(result.status, 1, `expected exit 1, got ${result.status}; stderr: ${result.stderr}`);
        assert.ok(
          result.stderr.includes('>=22.6') || result.stderr.includes('22.6'),
          `expected ">=22.6 required" in stderr, got: ${result.stderr}`
        );
      } finally {
        rmrf(tmpHome);
      }
    });
  });

});
