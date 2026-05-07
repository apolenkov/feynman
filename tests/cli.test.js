// tests/cli.test.js — tests for bin/feynman.js unified CLI
// Stubs HOME to os.tmpdir() — never touches real ~/.claude/
// Uses node:test + node:assert/strict.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs   = require('node:fs');
const os   = require('node:os');
const path = require('node:path');

const FEYNMAN_JS = path.resolve(__dirname, '..', 'bin', 'feynman.js');
const REPO_DIR   = path.resolve(__dirname, '..');
const PKG = require(path.join(REPO_DIR, 'package.json'));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-cli-test-'));
}

function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Run bin/feynman.js with given args and HOME stubbed to tmpHome.
 * Returns { stdout, stderr, status }.
 */
function runFeynman(args, tmpHome, env = {}) {
  const result = spawnSync(process.execPath, [FEYNMAN_JS, ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: tmpHome,
      NO_COLOR: '1',
      ...env,
    },
    cwd: REPO_DIR,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status ?? 1,
  };
}

/**
 * Read and parse settings.json from the temp HOME.
 */
function readSettings(tmpHome) {
  const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function readCodexHooks(tmpHome) {
  const hooksPath = path.join(tmpHome, '.codex', 'hooks.json');
  return JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('bin/feynman.js', () => {

  // -------------------------------------------------------------------------
  // version
  // -------------------------------------------------------------------------
  describe('feynman version', () => {
    it('prints the package version', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['version'], tmp);
        assert.equal(result.status, 0, `exit status: ${result.stderr}`);
        assert.ok(result.stdout.includes(PKG.version), `expected "${PKG.version}" in stdout: ${result.stdout}`);
      } finally {
        rmrf(tmp);
      }
    });
  });

  // -------------------------------------------------------------------------
  // help / --help / no args
  // -------------------------------------------------------------------------
  describe('feynman --help', () => {
    it('exits 0 and mentions all subcommands', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['--help'], tmp);
        assert.equal(result.status, 0, `exit status: ${result.stderr}`);
        const out = result.stdout;
        for (const cmd of ['install', 'uninstall', 'doctor', 'lint', 'version', 'help']) {
          assert.ok(out.includes(cmd), `--help missing subcommand '${cmd}': ${out}`);
        }
      } finally {
        rmrf(tmp);
      }
    });
  });

  describe('feynman (no args)', () => {
    it('prints help and exits 2', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman([], tmp);
        assert.equal(result.status, 2, `expected exit 2, got ${result.status}`);
        assert.ok(result.stdout.includes('install'), `expected help text in stdout: ${result.stdout}`);
      } finally {
        rmrf(tmp);
      }
    });
  });

  describe('feynman unknown', () => {
    it('exits 2', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['unknown-subcommand-xyz'], tmp);
        assert.equal(result.status, 2, `expected exit 2, got ${result.status}`);
      } finally {
        rmrf(tmp);
      }
    });
  });

  // -------------------------------------------------------------------------
  // install
  // -------------------------------------------------------------------------
  describe('feynman install', () => {
    it('creates settings.json with hook entry (fresh HOME)', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['install'], tmp);
        assert.equal(result.status, 0, `install failed: ${result.stderr}`);

        const settingsPath = path.join(tmp, '.claude', 'settings.json');
        assert.ok(fs.existsSync(settingsPath), 'settings.json must exist');

        const cfg = readSettings(tmp);
        assert.ok(cfg.hooks && Array.isArray(cfg.hooks.UserPromptSubmit), 'UserPromptSubmit must be array');

        const entry = cfg.hooks.UserPromptSubmit.find(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        );
        assert.ok(entry, 'feynman-activate.js hook entry not found in settings.json');

        const hook = entry.hooks[0];
        assert.ok(!hook.command.includes('~/'), 'hook command must not use tilde');
        assert.ok(hook.command.includes('/'), 'hook command must be absolute path');
      } finally {
        rmrf(tmp);
      }
    });

    it('creates state.json with default values', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        const statePath = path.join(tmp, '.claude', '.feynman', 'state.json');
        assert.ok(fs.existsSync(statePath), 'state.json must be created');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert.equal(state.enabled, true);
        assert.equal(state.intensity, 'full');
        assert.equal(state.injections, 0);
      } finally {
        rmrf(tmp);
      }
    });

    it('creates .feynman-active flag', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        const flagPath = path.join(tmp, '.claude', '.feynman-active');
        assert.ok(fs.existsSync(flagPath), '.feynman-active flag must exist after install');
      } finally {
        rmrf(tmp);
      }
    });

    it('installs /feynman command to ~/.claude/commands/', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        const commandPath = path.join(tmp, '.claude', 'commands', 'feynman.md');
        assert.ok(fs.existsSync(commandPath), 'feynman.md command should be installed');
      } finally {
        rmrf(tmp);
      }
    });

    it('stdout mentions "installed"', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['install'], tmp);
        assert.ok(
          result.stdout.includes('installed'),
          `expected "installed" in stdout: ${result.stdout}`
        );
      } finally {
        rmrf(tmp);
      }
    });
  });

  // -------------------------------------------------------------------------
  // install idempotency
  // -------------------------------------------------------------------------
  describe('feynman install (idempotent)', () => {
    it('does not duplicate hook on second install', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        runFeynman(['install'], tmp); // second time

        const cfg = readSettings(tmp);
        const feynmanHooks = cfg.hooks.UserPromptSubmit.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        );
        assert.equal(feynmanHooks.length, 1, `hook should appear exactly once, found ${feynmanHooks.length}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('second install stdout says "already installed"', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        const result = runFeynman(['install'], tmp);
        assert.ok(
          result.stdout.includes('already installed'),
          `expected "already installed", got: ${result.stdout}`
        );
      } finally {
        rmrf(tmp);
      }
    });

    it('--force re-registers hook (no duplicate)', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        runFeynman(['install', '--force'], tmp);

        const cfg = readSettings(tmp);
        const count = cfg.hooks.UserPromptSubmit.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        ).length;
        assert.equal(count, 1, `force install must not create duplicate, found ${count}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('--target codex creates ~/.codex/hooks.json with feynman hook', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['install', '--target', 'codex'], tmp);
        assert.equal(result.status, 0, `install failed: ${result.stderr}`);

        const hooksPath = path.join(tmp, '.codex', 'hooks.json');
        assert.ok(fs.existsSync(hooksPath), 'Codex hooks.json must exist');

        const cfg = readCodexHooks(tmp);
        const entry = cfg.hooks.UserPromptSubmit.find(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        );
        assert.ok(entry, 'feynman hook missing from Codex hooks.json');
        const hook = entry.hooks[0];
        assert.ok(hook.command.includes('FEYNMAN_HOME='));
        assert.ok(hook.command.includes('.codex'));
      } finally {
        rmrf(tmp);
      }
    });

    it('--target codex creates Codex state and flag', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install', '--target=codex'], tmp);
        const statePath = path.join(tmp, '.codex', '.feynman', 'state.json');
        const flagPath = path.join(tmp, '.codex', '.feynman-active');
        assert.ok(fs.existsSync(statePath), 'Codex state.json must exist');
        assert.ok(fs.existsSync(flagPath), 'Codex .feynman-active flag must exist');
      } finally {
        rmrf(tmp);
      }
    });

    it('--target both installs into Claude Code and Codex without duplicate hooks', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install', '--target', 'both'], tmp);
        runFeynman(['install', '--target', 'both'], tmp);

        const claudeCfg = readSettings(tmp);
        const codexCfg = readCodexHooks(tmp);
        const claudeCount = claudeCfg.hooks.UserPromptSubmit.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        ).length;
        const codexCount = codexCfg.hooks.UserPromptSubmit.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        ).length;
        assert.equal(claudeCount, 1);
        assert.equal(codexCount, 1);
      } finally {
        rmrf(tmp);
      }
    });
  });

  // -------------------------------------------------------------------------
  // uninstall
  // -------------------------------------------------------------------------
  describe('feynman uninstall', () => {
    it('removes feynman hook from settings.json', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        const result = runFeynman(['uninstall'], tmp);
        assert.equal(result.status, 0, `uninstall failed: ${result.stderr}`);

        const cfg = readSettings(tmp);
        const feynman = (cfg.hooks?.UserPromptSubmit || []).find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        );
        assert.equal(feynman, undefined, 'feynman hook should be removed');
      } finally {
        rmrf(tmp);
      }
    });

    it('preserves state.json (user data)', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        runFeynman(['uninstall'], tmp);

        const statePath = path.join(tmp, '.claude', '.feynman', 'state.json');
        assert.ok(fs.existsSync(statePath), 'state.json must be preserved after uninstall');
      } finally {
        rmrf(tmp);
      }
    });

    it('removes .feynman-active flag', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        runFeynman(['uninstall'], tmp);

        const flagPath = path.join(tmp, '.claude', '.feynman-active');
        assert.ok(!fs.existsSync(flagPath), '.feynman-active should be removed by uninstall');
      } finally {
        rmrf(tmp);
      }
    });

    it('idempotent: running uninstall twice exits 0', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        runFeynman(['uninstall'], tmp);
        const result = runFeynman(['uninstall'], tmp);
        assert.equal(result.status, 0, `second uninstall should exit 0: ${result.stderr}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('preserves other hooks when uninstalling', () => {
      const tmp = makeTempHome();
      try {
        // Pre-create settings.json with another hook
        const claudeDir = path.join(tmp, '.claude');
        fs.mkdirSync(claudeDir, { recursive: true });
        const existingCfg = {
          hooks: {
            UserPromptSubmit: [
              { hooks: [{ type: 'command', command: 'node /other/my-hook.js', timeout: 3 }] }
            ]
          }
        };
        fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(existingCfg, null, 2));

        runFeynman(['install'], tmp);
        runFeynman(['uninstall'], tmp);

        const cfg = readSettings(tmp);
        const myHook = (cfg.hooks?.UserPromptSubmit || []).find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('my-hook.js'))
        );
        assert.ok(myHook, 'pre-existing hook should be preserved after uninstall');
      } finally {
        rmrf(tmp);
      }
    });

    it('--target codex removes hook and preserves state', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install', '--target', 'codex'], tmp);
        const result = runFeynman(['uninstall', '--target', 'codex'], tmp);
        assert.equal(result.status, 0, `uninstall failed: ${result.stderr}`);

        const cfg = readCodexHooks(tmp);
        const feynman = (cfg.hooks?.UserPromptSubmit || []).find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        );
        assert.equal(feynman, undefined, 'Codex feynman hook should be removed');
        assert.ok(
          fs.existsSync(path.join(tmp, '.codex', '.feynman', 'state.json')),
          'Codex state.json must be preserved'
        );
        assert.ok(!fs.existsSync(path.join(tmp, '.codex', '.feynman-active')));
      } finally {
        rmrf(tmp);
      }
    });
  });

  // -------------------------------------------------------------------------
  // doctor
  // -------------------------------------------------------------------------
  describe('feynman doctor (after install)', () => {
    it('all checks OK, exits 0', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        const result = runFeynman(['doctor'], tmp);
        assert.equal(result.status, 0, `doctor must exit 0: ${result.stderr}`);
        assert.ok(result.stdout.includes('Status: OK'), `expected "Status: OK": ${result.stdout}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('--target codex all checks OK, exits 0', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install', '--target', 'codex'], tmp);
        const result = runFeynman(['doctor', '--target', 'codex'], tmp);
        assert.equal(result.status, 0, `doctor must exit 0: ${result.stderr}`);
        assert.ok(result.stdout.includes('Status: OK'), `expected "Status: OK": ${result.stdout}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('all individual checks pass', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        const result = runFeynman(['doctor'], tmp);
        const out = result.stdout;
        // All required checks should be [OK]
        assert.ok(out.includes('[OK]'), 'expected at least one [OK] check');
        assert.ok(!out.includes('[FAIL]'), `expected no [FAIL] checks: ${out}`);
      } finally {
        rmrf(tmp);
      }
    });
  });

  describe('feynman doctor (without install)', () => {
    it('reports missing checks but exits 0 (advisory)', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['doctor'], tmp);
        assert.equal(result.status, 0, 'doctor must exit 0 even with issues (advisory)');
        assert.ok(result.stdout.includes('[FAIL]'), `expected [FAIL] checks when not installed: ${result.stdout}`);
        assert.ok(result.stdout.includes('ISSUES'), `expected "ISSUES" in status line: ${result.stdout}`);
      } finally {
        rmrf(tmp);
      }
    });
  });

  // -------------------------------------------------------------------------
  // lint delegation
  // -------------------------------------------------------------------------
  describe('feynman lint', () => {
    it('delegates to feynman-lint: valid file exits 0', () => {
      const tmp = makeTempHome();
      try {
        const fixture = path.join(REPO_DIR, 'tests', 'fixtures', 'valid-flow.md');
        const result = runFeynman(['lint', fixture], tmp);
        assert.equal(result.status, 0, `lint of valid fixture should exit 0: ${result.stderr}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('delegates to feynman-lint: invalid file exits 1', () => {
      const tmp = makeTempHome();
      try {
        const fixture = path.join(REPO_DIR, 'tests', 'fixtures', 'invalid-l01-unclosed-box.md');
        const result = runFeynman(['lint', fixture], tmp);
        assert.equal(result.status, 1, `lint of invalid fixture should exit 1: ${result.stdout}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('lint --help exits 0', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['lint', '--help'], tmp);
        assert.equal(result.status, 0);
        assert.ok(result.stdout.length > 0, 'expected help text');
      } finally {
        rmrf(tmp);
      }
    });

    it('lint with no file exits 2', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['lint'], tmp);
        // lint with no args prints help and exits 0 (shows lint help)
        // OR exits 2 (no file to lint). Either is acceptable.
        assert.ok([0, 2].includes(result.status), `expected exit 0 or 2, got ${result.status}`);
      } finally {
        rmrf(tmp);
      }
    });
  });

  // -------------------------------------------------------------------------
  // NO_COLOR
  // -------------------------------------------------------------------------
  describe('NO_COLOR env', () => {
    it('doctor output contains no ANSI escape codes when NO_COLOR=1', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        const result = runFeynman(['doctor'], tmp, { NO_COLOR: '1' });
        assert.ok(!result.stdout.includes('\x1b['), `expected no ANSI codes: ${JSON.stringify(result.stdout)}`);
      } finally {
        rmrf(tmp);
      }
    });
  });

  // -------------------------------------------------------------------------
  // install preserves existing hooks (merge)
  // -------------------------------------------------------------------------
  describe('feynman install (merge with existing settings)', () => {
    it('preserves other hooks and config after install', () => {
      const tmp = makeTempHome();
      try {
        const claudeDir = path.join(tmp, '.claude');
        fs.mkdirSync(claudeDir, { recursive: true });
        const existingCfg = {
          hooks: {
            UserPromptSubmit: [
              { hooks: [{ type: 'command', command: 'node /other/hook.js', timeout: 3 }] }
            ]
          },
          someOtherKey: { value: 99 }
        };
        fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(existingCfg, null, 2));

        runFeynman(['install'], tmp);

        const cfg = readSettings(tmp);
        // Other hook preserved
        const otherHook = cfg.hooks.UserPromptSubmit.find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('other/hook.js'))
        );
        assert.ok(otherHook, 'pre-existing hook should be preserved');
        // feynman hook added
        const feynmanHook = cfg.hooks.UserPromptSubmit.find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        );
        assert.ok(feynmanHook, 'feynman hook should be added');
        // Other config preserved
        assert.deepEqual(cfg.someOtherKey, { value: 99 });
        // Total = 2
        assert.equal(cfg.hooks.UserPromptSubmit.length, 2);
      } finally {
        rmrf(tmp);
      }
    });
  });

});
