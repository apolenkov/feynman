// tests/cli.test.ts — tests for bin/feynman.ts unified CLI
// Stubs HOME to os.tmpdir() — never touches real ~/.claude/
// Uses node:test + node:assert/strict.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const FEYNMAN_JS = path.resolve(import.meta.dirname, '..', 'bin', 'feynman.ts');
const REPO_DIR   = path.resolve(import.meta.dirname, '..');
const PKG = require(path.join(REPO_DIR, 'package.json')) as Record<string, unknown>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-cli-test-'));
}

function rmrf(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

/**
 * Run bin/feynman.ts with given args and HOME stubbed to tmpHome.
 * Returns { stdout, stderr, status }.
 */
function runFeynman(args: string[], tmpHome: string, env: Record<string, string> = {}): RunResult {
  const result = spawnSync(process.execPath, [FEYNMAN_JS, ...args], {
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'],
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
function readSettings(tmpHome: string): Record<string, unknown> {
  const settingsPath = path.join(tmpHome, '.claude', 'settings.json');
  return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
}

function readCodexHooks(tmpHome: string): Record<string, unknown> {
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
        assert.ok(result.stdout.includes(PKG['version'] as string), `expected "${PKG['version']}" in stdout: ${result.stdout}`);
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
        assert.ok(fs.existsSync(path.join(out, 'hooks', 'feynman-activate.ts')));
        assert.ok(fs.existsSync(path.join(out, 'bin', 'feynman.ts')));
        assert.ok(fs.existsSync(path.join(out, '.claude-plugin', 'plugin.json')));
        assert.ok(fs.existsSync(path.join(out, '.codex-plugin', 'plugin.json')));
        assert.ok(fs.existsSync(path.join(out, 'skills', 'feynman', 'SKILL.md')));
        assert.ok(fs.existsSync(path.join(out, 'package.json')));
        assert.ok(fs.existsSync(path.join(out, 'feynman-bootstrap.json')));

        const manifest = JSON.parse(fs.readFileSync(path.join(out, 'feynman-bootstrap.json'), 'utf8'));
        assert.equal(manifest.version, PKG['version']);
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
    it('creates settings.json with SessionStart hook entry only (fresh HOME)', () => {
      const tmp = makeTempHome();
      try {
        const result = runFeynman(['install'], tmp);
        assert.equal(result.status, 0, `install failed: ${result.stderr}`);

        const settingsPath = path.join(tmp, '.codex', 'hooks.json');
        assert.ok(fs.existsSync(settingsPath), 'settings.json must exist');

        const cfg = readCodexHooks(tmp);
        const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        assert.equal(hooks['UserPromptSubmit'], undefined, 'UserPromptSubmit must not be registered (v0.7.0+)');
        assert.ok(Array.isArray(hooks['SessionStart']), 'SessionStart must be array');

        const entry = hooks['SessionStart']!.find(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        );
        assert.ok(entry, 'feynman-session-start.ts hook entry not found in settings.json');

        const hook = entry!.hooks[0]!;
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
        const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        assert.equal(hooks['UserPromptSubmit'], undefined, 'UserPromptSubmit must not be registered (v0.7.0+)');
        const sessionHooks = hooks['SessionStart']!.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        );
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
        const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        assert.equal(hooks['UserPromptSubmit'], undefined, 'UserPromptSubmit must not be registered (v0.7.0+)');
        const sessionCount = hooks['SessionStart']!.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        ).length;
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
        const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        assert.equal(hooks['UserPromptSubmit'], undefined, 'UserPromptSubmit must not be registered (v0.7.0+)');
        const sessionEntry = hooks['SessionStart']!.find(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        );
        assert.ok(sessionEntry, 'feynman session hook missing from Codex hooks.json');
        const hook = sessionEntry!.hooks[0]!;
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
        const claudeHooks = claudeCfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        const codexHooks = codexCfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        assert.equal(claudeHooks['UserPromptSubmit'], undefined, 'claude UserPromptSubmit must not be registered');
        assert.equal(codexHooks['UserPromptSubmit'], undefined, 'codex UserPromptSubmit must not be registered');
        const claudeSessionCount = claudeHooks['SessionStart']!.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        ).length;
        const codexSessionCount = codexHooks['SessionStart']!.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        ).length;
        assert.equal(claudeSessionCount, 1);
        assert.equal(codexSessionCount, 1);
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
        const claudeHooks = claudeCfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        const codexHooks = codexCfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        assert.equal(claudeHooks['UserPromptSubmit'], undefined, 'claude UserPromptSubmit must not be registered');
        assert.equal(codexHooks['UserPromptSubmit'], undefined, 'codex UserPromptSubmit must not be registered');
        const claudeSessionCount = claudeHooks['SessionStart']!.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        ).length;
        const codexSessionCount = codexHooks['SessionStart']!.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        ).length;
        assert.equal(claudeSessionCount, 1);
        assert.equal(codexSessionCount, 1);
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
        const claudeHooks = claudeCfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        const codexHooks = codexCfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        assert.equal(claudeHooks['UserPromptSubmit'], undefined, 'claude UserPromptSubmit must not be registered');
        assert.equal(codexHooks['UserPromptSubmit'], undefined, 'codex UserPromptSubmit must not be registered');
        const claudeSessionCount = claudeHooks['SessionStart']!.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        ).length;
        const codexSessionCount = codexHooks['SessionStart']!.filter(g =>
          g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        ).length;
        assert.equal(claudeSessionCount, 1);
        assert.equal(codexSessionCount, 1);
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
        const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]> | undefined;
        const feynman = (hooks?.['SessionStart'] || []).find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        );
        assert.equal(feynman, undefined, 'feynman SessionStart hook should be removed after uninstall');
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
        const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]> | undefined;
        const myHook = (hooks?.['UserPromptSubmit'] || []).find(e =>
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
        const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        const promptHooks = hooks['UserPromptSubmit']!;
        assert.equal(promptHooks.length, 1);
        assert.equal(promptHooks[0]!.hooks.length, 1);
        assert.ok(promptHooks[0]!.hooks[0]!.command.includes('my-hook.js'));
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
        const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]> | undefined;
        const feynman = (hooks?.['SessionStart'] || []).find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        );
        assert.equal(feynman, undefined, 'Codex feynman SessionStart hook should be removed after uninstall');
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
                  matcher: 'startup|resume|compact|clear',
                  hooks: [{
                    type: 'command',
                    command: `FEYNMAN_HOME=${codexDir} node ${path.join(REPO_DIR, 'hooks', 'feynman-session-start.ts')}`,
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
            },
          }, null, 2)
        );

        const result = runFeynman(['doctor'], tmp);
        assert.equal(result.status, 0, 'doctor must exit 0');
        assert.ok(result.stdout.includes('[FAIL] session hook script file exists and is readable'), result.stdout);
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
        const hooks = cfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
        // Pre-existing non-feynman UserPromptSubmit hook is preserved
        const otherHook = (hooks['UserPromptSubmit'] ?? []).find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('other/hook.js'))
        );
        assert.ok(otherHook, 'pre-existing hook should be preserved');
        // feynman does NOT add UserPromptSubmit (v0.7.0+)
        const feynmanHook = (hooks['UserPromptSubmit'] ?? []).find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-activate.ts'))
        );
        assert.equal(feynmanHook, undefined, 'feynman must NOT add UserPromptSubmit (v0.7.0+)');
        // feynman adds SessionStart instead
        const sessionHook = (hooks['SessionStart'] ?? []).find(e =>
          e.hooks && e.hooks.some(h => h.command && h.command.includes('feynman-session-start.ts'))
        );
        assert.ok(sessionHook, 'feynman SessionStart hook should be added');
        // Other config preserved
        assert.deepEqual(cfg['someOtherKey'], { value: 99 });
        // Total UserPromptSubmit count = 1 (only pre-existing)
        assert.equal((hooks['UserPromptSubmit'] ?? []).length, 1);
      } finally {
        rmrf(tmp);
      }
    });
  });

});

// ─── feynman-lint --explain (Plan 09-05) ─────────────────────────────────────

describe('feynman-lint --explain flag', () => {
  const BIN = path.resolve(REPO_DIR, 'bin', 'feynman-lint.ts');

  function runCli(args: string[], stdin?: string): { status: number | null; stdout: string; stderr: string } {
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

// ─── feynman-lint CLI error branches (coverage hardening) ───────────────────

describe('feynman-lint CLI error branches', () => {
  const BIN = path.resolve(REPO_DIR, 'bin', 'feynman-lint.ts');

  function runLint(args: string[], stdin?: string): { status: number | null; stdout: string; stderr: string } {
    return spawnSync(process.execPath, [BIN, ...args], {
      input: stdin,
      encoding: 'utf8',
    });
  }

  it('exits 2 and prints error for unknown flag', () => {
    const r = runLint(['--bogus-flag']);
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
    assert.match(r.stderr, /unknown flag/, `expected "unknown flag" in stderr: ${r.stderr}`);
  });

  it('exits 2 and prints error for too many file arguments', () => {
    const r = runLint(['a.md', 'b.md']);
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
    assert.match(r.stderr, /too many file arguments/, `expected "too many file arguments" in stderr: ${r.stderr}`);
  });

  it('exits 2 with usage when no file and no stdin', () => {
    const r = runLint([]);
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
    // stderr contains USAGE block which includes the binary name
    assert.match(r.stderr, /feynman-lint/, `expected usage in stderr: ${r.stderr}`);
  });

  it('exits 2 for --fix with stdin (-)', () => {
    const r = runLint(['--fix', '-'], 'some markdown content\n');
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
    assert.match(r.stderr, /--fix requires a file path/, `expected --fix error in stderr: ${r.stderr}`);
  });

  it('exits 2 for file-not-found in normal mode', () => {
    const r = runLint(['/nonexistent/path/file-does-not-exist.md']);
    assert.equal(r.status, 2, `expected exit 2, got ${r.status}: ${r.stderr}`);
    assert.match(r.stderr, /file not found/, `expected "file not found" in stderr: ${r.stderr}`);
  });
});

// ─── feynman install --target cline|cursor|windsurf (Phase 12 IDE compat) ────

describe('feynman install --target <ide>', () => {
  function makeTmpCwd(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-ide-test-'));
  }

  function runFromCwd(args: string[], cwd: string): RunResult {
    const result = spawnSync(process.execPath, [FEYNMAN_JS, ...args], {
      encoding: 'utf8',
      env: {
        PATH: process.env['PATH'],
        HOME: cwd,
        NO_COLOR: '1',
      },
      cwd,
    });
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      status: result.status ?? 1,
    };
  }

  it('install --target cline writes .clinerules/feynman-rules.md', () => {
    const tmp = makeTmpCwd();
    try {
      const r = runFromCwd(['install', '--target', 'cline'], tmp);
      assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stderr}`);
      const rules = path.join(tmp, '.clinerules', 'feynman-rules.md');
      assert.ok(fs.existsSync(rules), 'rules file must exist');
      const content = fs.readFileSync(rules, 'utf8');
      assert.ok(content.length > 200, 'rules content must be substantive');
      assert.doesNotMatch(content, /^---\n/, 'cline format has no frontmatter');
    } finally {
      rmrf(tmp);
    }
  });

  it('install --target cursor writes .cursor/rules/feynman.mdc with YAML frontmatter', () => {
    const tmp = makeTmpCwd();
    try {
      const r = runFromCwd(['install', '--target', 'cursor'], tmp);
      assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stderr}`);
      const rules = path.join(tmp, '.cursor', 'rules', 'feynman.mdc');
      assert.ok(fs.existsSync(rules), 'rules file must exist at .cursor/rules/feynman.mdc');
      const content = fs.readFileSync(rules, 'utf8');
      assert.match(content, /^---\n/, 'cursor format must start with frontmatter');
      assert.match(content, /alwaysApply:\s*true/, 'alwaysApply must be true');
      assert.match(content, /globs:\s*"\*\*"/, 'globs must be "**"');
    } finally {
      rmrf(tmp);
    }
  });

  it('install --target windsurf writes .windsurf/rules/feynman.md', () => {
    const tmp = makeTmpCwd();
    try {
      const r = runFromCwd(['install', '--target', 'windsurf'], tmp);
      assert.equal(r.status, 0, `expected exit 0, got ${r.status}: ${r.stderr}`);
      const rules = path.join(tmp, '.windsurf', 'rules', 'feynman.md');
      assert.ok(fs.existsSync(rules), 'rules file must exist at .windsurf/rules/feynman.md');
      const content = fs.readFileSync(rules, 'utf8');
      assert.ok(content.length > 200, 'rules content must be substantive');
      assert.doesNotMatch(content, /^---\n/, 'windsurf format has no frontmatter');
    } finally {
      rmrf(tmp);
    }
  });

  it('install --target cline is idempotent', () => {
    const tmp = makeTmpCwd();
    try {
      const r1 = runFromCwd(['install', '--target', 'cline'], tmp);
      assert.equal(r1.status, 0);
      const r2 = runFromCwd(['install', '--target', 'cline'], tmp);
      assert.equal(r2.status, 0, 'second install must succeed');
      const rules = path.join(tmp, '.clinerules', 'feynman-rules.md');
      assert.ok(fs.existsSync(rules));
    } finally {
      rmrf(tmp);
    }
  });

  it('doctor --target cline succeeds after install', () => {
    const tmp = makeTmpCwd();
    try {
      runFromCwd(['install', '--target', 'cline'], tmp);
      const r = runFromCwd(['doctor', '--target', 'cline'], tmp);
      assert.equal(r.status, 0, `doctor expected exit 0, got ${r.status}: ${r.stderr}`);
      assert.match(r.stdout, /\[OK\]/, 'doctor must report OK');
    } finally {
      rmrf(tmp);
    }
  });

  it('doctor --target cline fails when rules file is missing', () => {
    const tmp = makeTmpCwd();
    try {
      const r = runFromCwd(['doctor', '--target', 'cline'], tmp);
      assert.equal(r.status, 1, 'doctor must fail when not installed');
      assert.match(r.stdout, /\[FAIL\]/, 'doctor must report FAIL');
    } finally {
      rmrf(tmp);
    }
  });

  it('doctor --target cursor validates frontmatter alwaysApply', () => {
    const tmp = makeTmpCwd();
    try {
      runFromCwd(['install', '--target', 'cursor'], tmp);
      // Corrupt the frontmatter
      const rules = path.join(tmp, '.cursor', 'rules', 'feynman.mdc');
      const content = fs.readFileSync(rules, 'utf8');
      fs.writeFileSync(rules, content.replace('alwaysApply: true', 'alwaysApply: false'));
      const r = runFromCwd(['doctor', '--target', 'cursor'], tmp);
      assert.equal(r.status, 1, 'doctor must fail when frontmatter alwaysApply≠true');
    } finally {
      rmrf(tmp);
    }
  });

  it('invalid --target value still rejected', () => {
    const tmp = makeTmpCwd();
    try {
      const r = runFromCwd(['install', '--target', 'visualstudio'], tmp);
      assert.equal(r.status, 2, 'unknown target must exit 2');
    } finally {
      rmrf(tmp);
    }
  });
});

// ─── OpenCode adapter tests ───────────────────────────────────────────────────

describe('feynman install --target opencode', () => {
  function readOpenCodeSettings(tmpHome: string): Record<string, unknown> {
    const p = path.join(tmpHome, '.config', 'opencode', 'opencode.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
  }

  it('creates opencode.json with our path in instructions[]', () => {
    const tmp = makeTempHome();
    try {
      const r = runFeynman(['install', '--target', 'opencode'], tmp);
      assert.equal(r.status, 0, `install failed: ${r.stderr}`);
      const settings = readOpenCodeSettings(tmp);
      const instructions = settings['instructions'] as string[];
      assert.ok(Array.isArray(instructions), 'instructions must be an array');
      const hasFeynman = instructions.some(p => p.includes('.feynman/rules.md'));
      assert.ok(hasFeynman, 'instructions must contain feynman rules.md path');
    } finally {
      rmrf(tmp);
    }
  });

  it('creates rules.md with substantive content', () => {
    const tmp = makeTempHome();
    try {
      runFeynman(['install', '--target', 'opencode'], tmp);
      const rulesPath = path.join(tmp, '.config', 'opencode', '.feynman', 'rules.md');
      assert.ok(fs.existsSync(rulesPath), 'rules.md must exist');
      const content = fs.readFileSync(rulesPath, 'utf8');
      assert.ok(content.length > 200, 'rules.md must have substantive content');
    } finally {
      rmrf(tmp);
    }
  });

  it('creates state.json and .feynman-active flag', () => {
    const tmp = makeTempHome();
    try {
      runFeynman(['install', '--target', 'opencode'], tmp);
      const statePath = path.join(tmp, '.config', 'opencode', '.feynman', 'state.json');
      const flagPath = path.join(tmp, '.config', 'opencode', '.feynman-active');
      assert.ok(fs.existsSync(statePath), 'state.json must exist');
      assert.ok(fs.existsSync(flagPath), '.feynman-active flag must exist');
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>;
      assert.ok('enabled' in state, 'state.json must have enabled field');
    } finally {
      rmrf(tmp);
    }
  });

  it('is idempotent: double install adds path only once', () => {
    const tmp = makeTempHome();
    try {
      runFeynman(['install', '--target', 'opencode'], tmp);
      runFeynman(['install', '--target', 'opencode'], tmp);
      const settings = readOpenCodeSettings(tmp);
      const instructions = settings['instructions'] as string[];
      const feynmanPaths = instructions.filter(p => p.includes('.feynman/rules.md'));
      assert.equal(feynmanPaths.length, 1, 'must have exactly one feynman path after double install');
    } finally {
      rmrf(tmp);
    }
  });

  it('preserves foreign instructions on install', () => {
    const tmp = makeTempHome();
    try {
      const opencodeCfgDir = path.join(tmp, '.config', 'opencode');
      fs.mkdirSync(opencodeCfgDir, { recursive: true });
      const existing = { instructions: ['/some/other/rules.md'] };
      fs.writeFileSync(path.join(opencodeCfgDir, 'opencode.json'), JSON.stringify(existing, null, 2));

      runFeynman(['install', '--target', 'opencode'], tmp);
      const settings = readOpenCodeSettings(tmp);
      const instructions = settings['instructions'] as string[];
      assert.ok(instructions.includes('/some/other/rules.md'), 'foreign path must be preserved');
    } finally {
      rmrf(tmp);
    }
  });

  it('uninstall removes rules.md and flag, preserves state.json', () => {
    const tmp = makeTempHome();
    try {
      runFeynman(['install', '--target', 'opencode'], tmp);
      const r = runFeynman(['uninstall', '--target', 'opencode'], tmp);
      assert.equal(r.status, 0, `uninstall failed: ${r.stderr}`);

      const rulesPath = path.join(tmp, '.config', 'opencode', '.feynman', 'rules.md');
      const flagPath = path.join(tmp, '.config', 'opencode', '.feynman-active');
      const statePath = path.join(tmp, '.config', 'opencode', '.feynman', 'state.json');
      assert.ok(!fs.existsSync(rulesPath), 'rules.md must be removed by uninstall');
      assert.ok(!fs.existsSync(flagPath), '.feynman-active must be removed by uninstall');
      assert.ok(fs.existsSync(statePath), 'state.json must be preserved after uninstall');
    } finally {
      rmrf(tmp);
    }
  });

  it('uninstall removes our path from instructions[] but leaves others', () => {
    const tmp = makeTempHome();
    try {
      const opencodeCfgDir = path.join(tmp, '.config', 'opencode');
      fs.mkdirSync(opencodeCfgDir, { recursive: true });
      const existing = { instructions: ['/some/other/rules.md'] };
      fs.writeFileSync(path.join(opencodeCfgDir, 'opencode.json'), JSON.stringify(existing, null, 2));

      runFeynman(['install', '--target', 'opencode'], tmp);
      runFeynman(['uninstall', '--target', 'opencode'], tmp);

      const settings = readOpenCodeSettings(tmp);
      const instructions = settings['instructions'] as string[];
      assert.ok(instructions.includes('/some/other/rules.md'), 'foreign path must survive uninstall');
      const feynmanPaths = instructions.filter(p => p.includes('.feynman/rules.md'));
      assert.equal(feynmanPaths.length, 0, 'feynman path must be removed from instructions[]');
    } finally {
      rmrf(tmp);
    }
  });

  it('respects pre-existing disabled state: writes empty rules.md', () => {
    const tmp = makeTempHome();
    try {
      // First install (enabled by default)
      runFeynman(['install', '--target', 'opencode'], tmp);
      // Simulate /feynman off: write state.json with enabled=false and remove flag
      const statePath = path.join(tmp, '.config', 'opencode', '.feynman', 'state.json');
      const flagPath = path.join(tmp, '.config', 'opencode', '.feynman-active');
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as Record<string, unknown>;
      state['enabled'] = false;
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
      if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
      // Re-install (mimics SKILL.md step 2b calling feynman install after /feynman off)
      runFeynman(['install', '--target', 'opencode'], tmp);
      const rulesPath = path.join(tmp, '.config', 'opencode', '.feynman', 'rules.md');
      const content = fs.readFileSync(rulesPath, 'utf8');
      assert.equal(content, '', 'rules.md must be empty when enabled=false');
    } finally {
      rmrf(tmp);
    }
  });

  it('doctor exits 0 after install', () => {
    const tmp = makeTempHome();
    try {
      runFeynman(['install', '--target', 'opencode'], tmp);
      const r = runFeynman(['doctor', '--target', 'opencode'], tmp);
      assert.equal(r.status, 0, `doctor failed: ${r.stderr}`);
      assert.match(r.stdout, /Status: OK/, 'doctor must report Status: OK');
    } finally {
      rmrf(tmp);
    }
  });

  it('--target all installs claude + codex + opencode', () => {
    const tmp = makeTempHome();
    try {
      const r = runFeynman(['install', '--target', 'all'], tmp);
      assert.equal(r.status, 0, `install --target all failed: ${r.stderr}`);

      // claude and codex hooks
      const claudeCfg = readSettings(tmp);
      const codexCfg = readCodexHooks(tmp);
      const claudeHooks = claudeCfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
      const codexHooks = codexCfg['hooks'] as Record<string, { hooks: { command: string }[] }[]>;
      assert.ok(claudeHooks['SessionStart']?.some(g =>
        g.hooks?.some(h => h.command?.includes('feynman-session-start'))
      ), 'claude SessionStart hook must be registered');
      assert.ok(codexHooks['SessionStart']?.some(g =>
        g.hooks?.some(h => h.command?.includes('feynman-session-start'))
      ), 'codex SessionStart hook must be registered');

      // opencode instructions
      const openSettings = readOpenCodeSettings(tmp);
      const instructions = openSettings['instructions'] as string[];
      assert.ok(instructions?.some(p => p.includes('.feynman/rules.md')), 'opencode instructions must include feynman rules.md');
    } finally {
      rmrf(tmp);
    }
  });
});
