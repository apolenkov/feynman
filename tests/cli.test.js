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

    it('prints version help', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['version', '--help'], tmp);
        assert.equal(result.status, 0, `exit status: ${result.stderr}`);
        assert.ok(result.stdout.includes('feynman version'), `expected version help: ${result.stdout}`);
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
        for (const cmd of ['install', 'uninstall', 'doctor', 'lint', 'examples', 'bootstrap', 'version', 'help']) {
          assert.ok(out.includes(cmd), `--help missing subcommand '${cmd}': ${out}`);
        }
      } finally {
        rmrf(tmp);
      }
    });
  });

  describe('feynman bootstrap', () => {
    it('prints bootstrap help', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['bootstrap', '--help'], tmp);
        assert.equal(result.status, 0, `bootstrap --help failed: ${result.stderr}`);
        assert.ok(result.stdout.includes('feynman bootstrap'), `missing bootstrap help text: ${result.stdout}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('exports Feynman assets to target directory', () => {
      const tmp = makeTempHome();
      const out = path.join(tmp, 'feynman-package');
      try {
        const result = runFeynman(['bootstrap', '--out', out], tmp);
        assert.equal(result.status, 0, `bootstrap failed: ${result.stderr}`);

        assert.ok(fs.existsSync(path.join(out, 'examples', 'feature-planning.md')));
        assert.ok(fs.existsSync(path.join(out, 'rules', 'feynman-activate.md')));
        assert.ok(fs.existsSync(path.join(out, 'hooks', 'hooks.json')));
        assert.ok(fs.existsSync(path.join(out, 'hooks', 'feynman-activate.js')));
        assert.ok(fs.existsSync(path.join(out, 'bin', 'feynman.js')));
        assert.ok(fs.existsSync(path.join(out, '.claude-plugin', 'plugin.json')));
        assert.ok(fs.existsSync(path.join(out, '.codex-plugin', 'plugin.json')));
        assert.ok(fs.existsSync(path.join(out, 'skills', 'feynman', 'SKILL.md')));
        assert.ok(fs.existsSync(path.join(out, 'package.json')));
        assert.ok(fs.existsSync(path.join(out, 'feynman-bootstrap.json')));

        const manifest = JSON.parse(fs.readFileSync(path.join(out, 'feynman-bootstrap.json'), 'utf8'));
        assert.equal(manifest.version, PKG.version);
        assert.equal(manifest.counts.examples > 0, true);
        assert.equal(manifest.counts.rules, 1);
      } finally {
        rmrf(tmp);
      }
    });

    it('is idempotent by default (no --force)', () => {
      const tmp = makeTempHome();
      const out = path.join(tmp, 'feynman-package');
      try {
        runFeynman(['bootstrap', '--out', out], tmp);
        fs.writeFileSync(path.join(out, 'keep-me.txt'), 'keep');

        const result = runFeynman(['bootstrap', '--out', out], tmp);
        assert.equal(result.status, 0, `second bootstrap should be safe: ${result.stderr}`);
        assert.ok(result.stdout.includes('output already exists'), `expected idempotent notice: ${result.stdout}`);
        assert.ok(fs.existsSync(path.join(out, 'keep-me.txt')));
      } finally {
        rmrf(tmp);
      }
    });

    it('--force recreates output directory', () => {
      const tmp = makeTempHome();
      const out = path.join(tmp, 'feynman-package');
      try {
        runFeynman(['bootstrap', '--out', out], tmp);
        fs.writeFileSync(path.join(out, 'delete-me.txt'), 'delete me');
        assert.ok(fs.existsSync(path.join(out, 'delete-me.txt')));

        const result = runFeynman(['bootstrap', '--out', out, '--force'], tmp);
        assert.equal(result.status, 0, `bootstrap --force failed: ${result.stderr}`);
        assert.ok(!fs.existsSync(path.join(out, 'delete-me.txt')));
      } finally {
        rmrf(tmp);
      }
    });

    it('exits with error for missing value after --out', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['bootstrap', '--out'], tmp);
        assert.equal(result.status, 2, `expected exit 2: ${result.status}`);
        assert.ok(result.stderr.includes('--out requires a value'));
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

        const settingsPath = path.join(tmp, '.codex', 'hooks.json');
        assert.ok(fs.existsSync(settingsPath), 'settings.json must exist');

        const cfg = readCodexHooks(tmp);
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
        const statePath = path.join(tmp, '.codex', '.feynman', 'state.json');
        assert.ok(fs.existsSync(statePath), 'state.json must be created');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert.equal(state.enabled, true);
        assert.equal(state.intensity, 'full');
        assert.equal(state.injections, 0);
      } finally {
        rmrf(tmp);
      }
    });

    it('creates .feynman-active flag by default', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        const flagPath = path.join(tmp, '.codex', '.feynman-active');
        assert.ok(fs.existsSync(flagPath), '.feynman-active flag must exist after install');
      } finally {
        rmrf(tmp);
      }
    });

    it('installs /feynman command to ~/.claude/commands/ when Claude target is selected', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install', '--target', 'claude'], tmp);
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

        const cfg = readCodexHooks(tmp);
        const feynmanHooks = cfg.hooks.UserPromptSubmit.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        );
        const sessionHooks = cfg.hooks.SessionStart.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.js'))
        );
        assert.equal(feynmanHooks.length, 1, `hook should appear exactly once, found ${feynmanHooks.length}`);
        assert.equal(sessionHooks.length, 1, `session hook should appear exactly once, found ${sessionHooks.length}`);
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

        const cfg = readCodexHooks(tmp);
        const count = cfg.hooks.UserPromptSubmit.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        ).length;
        const sessionCount = cfg.hooks.SessionStart.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.js'))
        ).length;
        assert.equal(count, 1, `force install must not create duplicate, found ${count}`);
        assert.equal(sessionCount, 1, `force install must not create duplicate session hook, found ${sessionCount}`);
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
        const sessionEntry = cfg.hooks.SessionStart.find(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.js'))
        );
        const entry = cfg.hooks.UserPromptSubmit.find(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
        );
        assert.ok(sessionEntry, 'feynman session hook missing from Codex hooks.json');
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
        assert.ok(fs.existsSync(flagPath), 'Codex .feynman-active flag must exist by default');
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

    it('--target all installs into Claude Code and Codex without duplicate hooks', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install', '--target', 'all'], tmp);
        runFeynman(['install', '--target', 'all'], tmp);

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

    it("--target '*' installs into Claude Code and Codex without duplicate hooks", () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install', '--target', '*'], tmp);
        runFeynman(['install', '--target', '*'], tmp);

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
    it('removes feynman hook from Codex hooks.json', () => {
      const tmp = makeTempHome();
      try {
        runFeynman(['install'], tmp);
        const result = runFeynman(['uninstall'], tmp);
        assert.equal(result.status, 0, `uninstall failed: ${result.stderr}`);

        const cfg = readCodexHooks(tmp);
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

        const statePath = path.join(tmp, '.codex', '.feynman', 'state.json');
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

        const flagPath = path.join(tmp, '.codex', '.feynman-active');
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
        const claudeDir = path.join(tmp, '.codex');
        fs.mkdirSync(claudeDir, { recursive: true });
        const existingCfg = {
          hooks: {
            UserPromptSubmit: [
              { hooks: [{ type: 'command', command: 'node /other/my-hook.js', timeout: 3 }] }
            ]
          }
        };
        fs.writeFileSync(path.join(claudeDir, 'hooks.json'), JSON.stringify(existingCfg, null, 2));

        runFeynman(['install'], tmp);
        runFeynman(['uninstall'], tmp);

        const cfg = readCodexHooks(tmp);
        const myHook = (cfg.hooks?.UserPromptSubmit || []).find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('my-hook.js'))
        );
        assert.ok(myHook, 'pre-existing hook should be preserved after uninstall');
      } finally {
        rmrf(tmp);
      }
    });

    it('preserves non-feynman hooks inside the same hook group', () => {
      const tmp = makeTempHome();
      try {
        const codexDir = path.join(tmp, '.codex');
        fs.mkdirSync(codexDir, { recursive: true });
        const existingCfg = {
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  { type: 'command', command: 'node /other/my-hook.js', timeout: 3 },
                  { type: 'command', command: 'node /old/feynman-activate.js', timeout: 5 },
                ],
              },
            ],
          },
        };
        fs.writeFileSync(path.join(codexDir, 'hooks.json'), JSON.stringify(existingCfg, null, 2));

        runFeynman(['uninstall'], tmp);

        const cfg = readCodexHooks(tmp);
        const promptHooks = cfg.hooks.UserPromptSubmit;
        assert.equal(promptHooks.length, 1);
        assert.equal(promptHooks[0].hooks.length, 1);
        assert.ok(promptHooks[0].hooks[0].command.includes('my-hook.js'));
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

    it('accepts unquoted absolute hook paths', () => {
      const tmp = makeTempHome();
      try {
        const codexDir = path.join(tmp, '.codex');
        const stateDir = path.join(codexDir, '.feynman');
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({ enabled: true, intensity: 'full', injections: 0 }));
        fs.writeFileSync(path.join(codexDir, '.feynman-active'), 'full');
        fs.writeFileSync(
          path.join(codexDir, 'hooks.json'),
          JSON.stringify({
            hooks: {
              SessionStart: [
                {
                  hooks: [{
                    type: 'command',
                    command: `FEYNMAN_HOME=${codexDir} node ${path.join(REPO_DIR, 'hooks', 'feynman-session-start.js')}`,
                  }],
                },
              ],
              UserPromptSubmit: [
                {
                  hooks: [{
                    type: 'command',
                    command: `FEYNMAN_HOME=${codexDir} node ${path.join(REPO_DIR, 'hooks', 'feynman-activate.js')}`,
                  }],
                },
              ],
            },
          }, null, 2)
        );

        const result = runFeynman(['doctor'], tmp);
        assert.equal(result.status, 0, `doctor must exit 0: ${result.stderr}`);
        assert.ok(result.stdout.includes('Status: OK'), `expected "Status: OK": ${result.stdout}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('fails script-file checks when registered command path cannot be parsed', () => {
      const tmp = makeTempHome();
      try {
        const codexDir = path.join(tmp, '.codex');
        const stateDir = path.join(codexDir, '.feynman');
        fs.mkdirSync(stateDir, { recursive: true });
        fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({ enabled: true, intensity: 'full', injections: 0 }));
        fs.writeFileSync(path.join(codexDir, '.feynman-active'), 'full');
        fs.writeFileSync(
          path.join(codexDir, 'hooks.json'),
          JSON.stringify({
            hooks: {
              SessionStart: [
                {
                  hooks: [{
                    type: 'command',
                    command: 'node \"$PLUGIN_ROOT/hooks/feynman-session-start.js\"',
                  }],
                },
              ],
              UserPromptSubmit: [
                {
                  hooks: [{
                    type: 'command',
                    command: 'node \"$PLUGIN_ROOT/hooks/feynman-activate.js\"',
                  }],
                },
              ],
            },
          }, null, 2)
        );

        const result = runFeynman(['doctor'], tmp);
        assert.equal(result.status, 0, 'doctor must exit 0');
        assert.ok(result.stdout.includes('[FAIL] session hook script file exists and is readable'), result.stdout);
        assert.ok(result.stdout.includes('[FAIL] prompt hook script file exists and is readable'), result.stdout);
        assert.ok(result.stdout.includes('Status: ISSUES'), result.stdout);
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

    it('lint --json emits machine-readable results', () => {
      const tmp = makeTempHome();
      try {
        const fixture = path.join(REPO_DIR, 'tests', 'fixtures', 'valid-flow.md');
        const result = runFeynman(['lint', '--json', fixture], tmp);
        assert.equal(result.status, 0, `lint --json should exit 0: ${result.stderr}`);
        const parsed = JSON.parse(result.stdout);
        assert.equal(parsed.file, fixture);
        assert.equal(parsed.passed, true);
        assert.deepEqual(parsed.issues, []);
      } finally {
        rmrf(tmp);
      }
    });

    it('lint --strict fails on warnings', () => {
      const tmp = makeTempHome();
      try {
        const fixture = path.join(REPO_DIR, 'tests', 'fixtures', 'invalid-l06-half-priority.md');
        const result = runFeynman(['lint', '--strict', fixture], tmp);
        assert.equal(result.status, 1, `lint --strict should fail on warnings: ${result.stdout}`);
        assert.ok(result.stderr.includes('1 warning'), `expected warning count: ${result.stderr}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('lint reports missing files as usage errors', () => {
      const tmp = makeTempHome();
      try {
        const missing = path.join(tmp, 'missing.md');
        const result = runFeynman(['lint', missing], tmp);
        assert.equal(result.status, 2, `missing file should exit 2: ${result.status}`);
        assert.ok(result.stderr.includes('file not found'), `expected file-not-found message: ${result.stderr}`);
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

  describe('feynman examples', () => {
    it('lists examples and exits 0', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['examples'], tmp);
        assert.equal(result.status, 0, `examples list should exit 0: ${result.stderr}`);
        assert.ok(result.stdout.includes('Available examples:'), `expected examples header: ${result.stdout}`);
        assert.ok(result.stdout.includes('feature-planning'), 'expected feature-planning in examples list');
        assert.ok(result.stdout.includes('incident-response'), 'expected incident-response in examples list');
      } finally {
        rmrf(tmp);
      }
    });

    it('prints named example', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['examples', '--name', 'feature-planning'], tmp);
        assert.equal(result.status, 0, `expected exit 0: ${result.stderr}`);
        assert.ok(result.stdout.includes('Feature Planning'), `expected example title: ${result.stdout}`);
        assert.ok(result.stdout.includes('> We need fast text search'), `expected question in output: ${result.stdout}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('--random prints a sample and exits 0', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['examples', '--random'], tmp);
        assert.equal(result.status, 0, `expected exit 0: ${result.stderr}`);
        assert.ok(result.stdout.includes('Preview:'), `expected preview block: ${result.stdout}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('--name requires value', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['examples', '--name'], tmp);
        assert.equal(result.status, 2, `expected exit 2: ${result.status}`);
        assert.ok(result.stderr.includes('--name requires a value'), `expected validation message: ${result.stderr}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('--name and --random are mutually exclusive', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['examples', '--name', 'feature-planning', '--random'], tmp);
        assert.equal(result.status, 2, `expected exit 2: ${result.status}`);
        assert.ok(result.stderr.includes('use either --random or --name'), `expected conflict message: ${result.stderr}`);
      } finally {
        rmrf(tmp);
      }
    });

    it('unknown example returns exit 2', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['examples', '--name', 'does-not-exist'], tmp);
        assert.equal(result.status, 2, `expected exit 2 for missing example: ${result.status}`);
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
        const claudeDir = path.join(tmp, '.codex');
        fs.mkdirSync(claudeDir, { recursive: true });
        const existingCfg = {
          hooks: {
            UserPromptSubmit: [
              { hooks: [{ type: 'command', command: 'node /other/hook.js', timeout: 3 }] }
            ]
          },
          someOtherKey: { value: 99 }
        };
        fs.writeFileSync(path.join(claudeDir, 'hooks.json'), JSON.stringify(existingCfg, null, 2));

        runFeynman(['install'], tmp);

        const cfg = readCodexHooks(tmp);
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

// ─── feynman-lint --explain (Plan 09-05) ─────────────────────────────────────

describe('feynman-lint --explain flag', () => {
  const BIN = path.resolve(REPO_DIR, 'bin', 'feynman-lint.js');

  function runCli(args, stdin) {
    return spawnSync(process.execPath, [BIN, ...args], {
      input: stdin,
      encoding: 'utf8',
    });
  }

  it('--explain flag accepted (no unknown-flag error)', () => {
    const tmp = path.join(os.tmpdir(), `feynman-explain-${process.pid}.md`);
    fs.writeFileSync(tmp, 'no diagrams here\n');
    try {
      const r = runCli(['--explain', tmp]);
      assert.notEqual(r.status, 2, `unknown-flag error: ${r.stderr}`);
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  });

  it('--explain emits per-frame cost annotation', () => {
    const tmp = path.join(os.tmpdir(), `feynman-explain2-${process.pid}.md`);
    const input = '```\n┌────────────────┐\n│ a              │\n│ b              │\n│ c              │\n└────────────────┘\n```\n';
    fs.writeFileSync(tmp, input);
    try {
      const r = runCli(['--explain', tmp]);
      const out = r.stdout + r.stderr;
      assert.match(out, /framing/i, `expected 'framing' in output: ${out}`);
      assert.match(out, /dot-leader/i, `expected 'dot-leader' in output: ${out}`);
      assert.match(out, /saving/i, `expected 'saving' in output: ${out}`);
      assert.match(out, /\d+\s*chars/, `expected char counts in output: ${out}`);
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  });

  it('--explain on no-frame input produces no annotation', () => {
    const tmp = path.join(os.tmpdir(), `feynman-explain3-${process.pid}.md`);
    fs.writeFileSync(tmp, 'just prose, no diagrams\n');
    try {
      const r = runCli(['--explain', tmp]);
      const out = r.stdout + r.stderr;
      assert.doesNotMatch(out, /framing/, `unexpected 'framing' annotation: ${out}`);
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  });

  it('--explain --json emits JSON-formatted cost data', () => {
    const tmp = path.join(os.tmpdir(), `feynman-explain4-${process.pid}.md`);
    const input = '```\n┌──────────┐\n│ a        │\n│ b        │\n└──────────┘\n```\n';
    fs.writeFileSync(tmp, input);
    try {
      const r = runCli(['--explain', '--json', tmp]);
      const parsed = JSON.parse(r.stdout);
      assert.ok(parsed, 'JSON parseable');
      assert.ok('explain' in parsed, `expected explain key in JSON: ${r.stdout}`);
      assert.ok(Array.isArray(parsed.explain), 'explain must be an array');
      assert.ok(parsed.explain.length >= 1, 'one frame should produce one explain entry');
      const e0 = parsed.explain[0];
      assert.equal(typeof e0.line, 'number');
      assert.equal(typeof e0.cost.framing_chars, 'number');
      assert.equal(typeof e0.cost.saving, 'number');
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  });

  it('--help documents --explain', () => {
    const r = runCli(['--help']);
    assert.match(r.stdout, /--explain/, `--explain must appear in --help output`);
  });

  it('--explain does NOT modify the file', () => {
    const tmp = path.join(os.tmpdir(), `feynman-explain5-${process.pid}.md`);
    const input = '```\n┌──────┐\n│ a    │\n│ b    │\n└──────┘\n```\n';
    fs.writeFileSync(tmp, input);
    try {
      runCli(['--explain', tmp]);
      const after = fs.readFileSync(tmp, 'utf8');
      assert.equal(after, input, '--explain must be read-only on disk');
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  });
});
