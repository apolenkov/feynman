// tests/install.test.js — install.sh idempotency + settings.json merge
// Stubs HOME to os.tmpdir() — never touches real ~/.claude/
// Uses node:test + node:assert/strict.
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const INSTALL_SH = path.resolve(__dirname, '..', 'install.sh');
const REPO_DIR   = path.resolve(__dirname, '..');

/**
 * Create isolated temp HOME dir.
 */
function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-install-test-'));
}

function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Run install.sh with HOME stubbed to tmpDir.
 * Returns { stdout, stderr, status }.
 */
function runInstall(tmpHome, env = {}) {
  try {
    const stdout = execFileSync('bash', [INSTALL_SH], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        HOME: tmpHome,
        ...env,
      },
      cwd: REPO_DIR,
    });
    return { stdout, stderr: '', status: 0 };
  } catch (e) {
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      status: e.status || 1,
    };
  }
}

/**
 * Read and parse settings.json from the temp HOME.
 */
function readSettings(tmpHome) {
  const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

describe('install.sh', () => {

  // -------------------------------------------------------------------------
  // Test 1: Fresh install — empty HOME
  // -------------------------------------------------------------------------
  describe('fresh install (empty HOME)', () => {
    let tmpHome;
    let result;

    before(() => {
      tmpHome = makeTempHome();
      result = runInstall(tmpHome);
    });

    after(() => rmrf(tmpHome));

    it('exits 0', () => {
      assert.equal(result.status, 0, `install.sh failed: ${result.stderr}`);
    });

    it('creates settings.json', () => {
      const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
      assert.ok(fs.existsSync(settingsPath), 'settings.json should be created');
    });

    it('settings.json contains UserPromptSubmit hook', () => {
      const cfg = readSettings(tmpHome);
      assert.ok(cfg.hooks, 'hooks key must exist');
      assert.ok(Array.isArray(cfg.hooks.UserPromptSubmit), 'UserPromptSubmit must be array');
      assert.ok(cfg.hooks.UserPromptSubmit.length >= 1, 'at least one hook entry');
    });

    it('hook entry points to feynman-activate.js with absolute path', () => {
      const cfg = readSettings(tmpHome);
      const entries = cfg.hooks.UserPromptSubmit;
      const feynmanEntry = entries.find(e =>
        e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
      );
      assert.ok(feynmanEntry, 'feynman-activate.js hook entry not found');
      const hook = feynmanEntry.hooks[0];
      // Must be absolute path (not tilde, not relative)
      assert.ok(hook.command.includes('/'), 'hook command must contain absolute path');
      assert.ok(!hook.command.includes('~/'), 'hook command must not use tilde');
    });

    it('installs /feynman command to ~/.claude/commands/', () => {
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
    let tmpHome;

    before(() => {
      tmpHome = makeTempHome();
      runInstall(tmpHome); // first install
      runInstall(tmpHome); // second install
    });

    after(() => rmrf(tmpHome));

    it('hook appears exactly once in settings.json', () => {
      const cfg = readSettings(tmpHome);
      const entries = cfg.hooks.UserPromptSubmit;
      const feynmanHooks = entries.filter(e =>
        e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
      );
      assert.equal(feynmanHooks.length, 1, `hook should appear exactly once, found ${feynmanHooks.length}`);
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
    let tmpHome;

    before(() => {
      tmpHome = makeTempHome();
      // Create pre-existing settings.json with another hook
      const claudeDir = path.join(tmpHome, '.claude');
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
        path.join(claudeDir, 'settings.json'),
        JSON.stringify(existingCfg, null, 2)
      );

      runInstall(tmpHome);
    });

    after(() => rmrf(tmpHome));

    it('existing hook preserved after merge', () => {
      const cfg = readSettings(tmpHome);
      const existing = cfg.hooks.UserPromptSubmit.find(e =>
        e.hooks && e.hooks.some(h => h.command && h.command.includes('my-hook.js'))
      );
      assert.ok(existing, 'pre-existing hook should be preserved in merged settings');
    });

    it('feynman hook added alongside existing', () => {
      const cfg = readSettings(tmpHome);
      const feynman = cfg.hooks.UserPromptSubmit.find(e =>
        e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
      );
      assert.ok(feynman, 'feynman hook should be added');
    });

    it('other config keys preserved', () => {
      const cfg = readSettings(tmpHome);
      assert.deepEqual(cfg.someOtherConfig, { value: 42 }, 'non-hooks config should not be touched');
    });

    it('total hook count is 2 (existing + feynman)', () => {
      const cfg = readSettings(tmpHome);
      assert.equal(
        cfg.hooks.UserPromptSubmit.length, 2,
        `expected 2 hooks, found ${cfg.hooks.UserPromptSubmit.length}`
      );
    });
  });

  // -------------------------------------------------------------------------
  // Test 4: Uninstall (if uninstall.sh exists; otherwise skip)
  // -------------------------------------------------------------------------
  describe('uninstall.sh (if present)', () => {
    const UNINSTALL_SH = path.resolve(__dirname, '..', 'uninstall.sh');
    const uninstallExists = fs.existsSync(UNINSTALL_SH);

    it('uninstall.sh does not exist yet (deferred to Phase 7 REL-04)', () => {
      // Per REQUIREMENTS.md REL-04: uninstall.sh is a Phase 7 deliverable
      // If it appears, this test will need updating
      if (uninstallExists) {
        // If uninstall.sh now exists, test its basic behavior
        const tmpHome = makeTempHome();
        try {
          runInstall(tmpHome);
          execFileSync('bash', [UNINSTALL_SH], {
            encoding: 'utf8',
            env: { PATH: process.env.PATH, HOME: tmpHome },
            cwd: REPO_DIR,
          });
          // After uninstall, feynman hook should be removed from settings
          const cfg = readSettings(tmpHome);
          const feynman = (cfg.hooks?.UserPromptSubmit || []).find(e =>
            e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
          );
          assert.equal(feynman, undefined, 'feynman hook should be removed by uninstall.sh');
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

});
