// tests/hook.test.js — e2e tests for hooks/feynman-activate.js
// Uses node:test + node:assert/strict. Spawns hook as child process.
// Each test gets an isolated temp dir (HOME override) — no ~/.claude/ pollution.
'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK_PATH = path.resolve(__dirname, '..', 'hooks', 'feynman-activate.js');
const RULES_PATH = path.resolve(__dirname, '..', 'rules', 'feynman-activate.md');

/**
 * Create an isolated temp dir and return its path.
 * The dir is auto-cleaned after the test using the cleanup fn returned.
 */
function makeTempHome() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-hook-test-'));
  return dir;
}

function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Run the hook with a given HOME and stdin JSON.
 * Returns { status, stdout, stderr }.
 */
function runHook(tmpHome, stdinData) {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(stdinData),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tmpHome,
    },
    timeout: 10000,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Parse additionalContext from hook stdout JSON.
 * Returns the additionalContext string or throws.
 */
function parseAdditionalContext(stdout) {
  const parsed = JSON.parse(stdout);
  assert.ok(
    parsed.hookSpecificOutput,
    'hookSpecificOutput missing from stdout'
  );
  assert.equal(
    parsed.hookSpecificOutput.hookEventName,
    'UserPromptSubmit',
    'hookEventName must be UserPromptSubmit'
  );
  const ctx = parsed.hookSpecificOutput.additionalContext;
  assert.ok(typeof ctx === 'string', 'additionalContext must be a string');
  return ctx;
}

describe('feynman-activate hook', () => {

  // -------------------------------------------------------------------------
  // Path 1: First-run bootstrap
  // -------------------------------------------------------------------------
  describe('Path 1: first-run bootstrap', () => {
    let tmpHome;
    let result;

    before(() => {
      tmpHome = makeTempHome();
      result = runHook(tmpHome, { prompt: 'test prompt' });
    });

    after(() => rmrf(tmpHome));

    it('exits 0', () => {
      assert.equal(result.status, 0);
    });

    it('creates ~/.claude/.feynman/state.json', () => {
      const statePath = path.join(tmpHome, '.claude', '.feynman', 'state.json');
      assert.ok(fs.existsSync(statePath), 'state.json should be created');
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      assert.equal(state.enabled, true);
      assert.equal(state.intensity, 'full');
    });

    it('creates ~/.claude/.feynman-active flag', () => {
      const flagPath = path.join(tmpHome, '.claude', '.feynman-active');
      assert.ok(fs.existsSync(flagPath), '.feynman-active flag should be created');
    });

    it('emits valid additionalContext JSON', () => {
      const ctx = parseAdditionalContext(result.stdout);
      assert.ok(ctx.length > 0, 'additionalContext should not be empty');
    });

    it('stdout is valid JSON (no trailing newline issues)', () => {
      // Strict: entire stdout must be exactly one JSON object
      const parsed = JSON.parse(result.stdout);
      assert.equal(typeof parsed, 'object');
    });
  });

  // -------------------------------------------------------------------------
  // Path 2: Normal flow — enabled, intensity=full
  // -------------------------------------------------------------------------
  describe('Path 2: normal flow (enabled, intensity=full)', () => {
    let tmpHome;
    let result;
    let stateAfter;

    before(() => {
      tmpHome = makeTempHome();
      const feynmanDir = path.join(tmpHome, '.claude', '.feynman');
      fs.mkdirSync(feynmanDir, { recursive: true });
      const statePath = path.join(feynmanDir, 'state.json');
      const flagPath = path.join(tmpHome, '.claude', '.feynman-active');
      fs.writeFileSync(statePath, JSON.stringify({ enabled: true, intensity: 'full', injections: 2 }));
      fs.writeFileSync(flagPath, 'full');

      result = runHook(tmpHome, { prompt: 'what is the flow?' });
      stateAfter = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    });

    after(() => rmrf(tmpHome));

    it('exits 0', () => {
      assert.equal(result.status, 0);
    });

    it('increments state.injections', () => {
      assert.equal(stateAfter.injections, 3, 'injections should increment from 2 to 3');
    });

    it('injects rules as additionalContext', () => {
      const ctx = parseAdditionalContext(result.stdout);
      assert.ok(ctx.length > 50, 'rules text should be non-trivial');
    });

    it('injected rules contain diagram keywords', () => {
      const ctx = parseAdditionalContext(result.stdout);
      // Rules file should contain ASCII diagram keywords
      assert.ok(
        ctx.includes('diagram') || ctx.includes('ASCII') || ctx.includes('-->'),
        'rules should reference diagrams'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Path 3: Disabled — .feynman-active absent, state.json exists
  // -------------------------------------------------------------------------
  describe('Path 3: disabled (flag absent, state exists)', () => {
    let tmpHome;
    let result;

    before(() => {
      tmpHome = makeTempHome();
      const feynmanDir = path.join(tmpHome, '.claude', '.feynman');
      fs.mkdirSync(feynmanDir, { recursive: true });
      const statePath = path.join(feynmanDir, 'state.json');
      // Write state but DO NOT create flag file
      fs.writeFileSync(statePath, JSON.stringify({ enabled: true, intensity: 'full', injections: 5 }));

      result = runHook(tmpHome, { prompt: 'any prompt' });
    });

    after(() => rmrf(tmpHome));

    it('exits 0 silently', () => {
      assert.equal(result.status, 0);
    });

    it('emits no stdout (no injection)', () => {
      assert.equal(result.stdout.trim(), '', 'disabled hook must not write anything to stdout');
    });
  });

  // -------------------------------------------------------------------------
  // Path 4: Intensity switch — lite vs ultra produce different content
  // -------------------------------------------------------------------------
  describe('Path 4: intensity switch', () => {
    let tmpHomeLite;
    let tmpHomeUltra;
    let resultLite;
    let resultUltra;

    before(() => {
      function makeHome(intensity) {
        const dir = makeTempHome();
        const feynmanDir = path.join(dir, '.claude', '.feynman');
        fs.mkdirSync(feynmanDir, { recursive: true });
        fs.writeFileSync(
          path.join(feynmanDir, 'state.json'),
          JSON.stringify({ enabled: true, intensity, injections: 0 })
        );
        fs.writeFileSync(path.join(dir, '.claude', '.feynman-active'), intensity);
        return dir;
      }
      tmpHomeLite = makeHome('lite');
      tmpHomeUltra = makeHome('ultra');

      resultLite  = runHook(tmpHomeLite,  { prompt: 'test' });
      resultUltra = runHook(tmpHomeUltra, { prompt: 'test' });
    });

    after(() => {
      rmrf(tmpHomeLite);
      rmrf(tmpHomeUltra);
    });

    it('lite exits 0', () => assert.equal(resultLite.status, 0));
    it('ultra exits 0', () => assert.equal(resultUltra.status, 0));

    it('lite produces additionalContext', () => {
      const ctx = parseAdditionalContext(resultLite.stdout);
      assert.ok(ctx.length > 0);
    });

    it('ultra produces additionalContext', () => {
      const ctx = parseAdditionalContext(resultUltra.stdout);
      assert.ok(ctx.length > 0);
    });

    it('lite and ultra inject different rule blocks', () => {
      const ctxLite  = parseAdditionalContext(resultLite.stdout);
      const ctxUltra = parseAdditionalContext(resultUltra.stdout);
      assert.notEqual(ctxLite, ctxUltra, 'different intensities should inject different rule text');
    });

    it('lite section contains Lite in header', () => {
      const ctx = parseAdditionalContext(resultLite.stdout);
      assert.ok(ctx.includes('Lite') || ctx.length < ctxUltraLen(), 'lite section should be lite variant');
      function ctxUltraLen() { return parseAdditionalContext(resultUltra.stdout).length; }
    });
  });

  // -------------------------------------------------------------------------
  // Path 5: Corrupt state recovery — malformed state.json
  // -------------------------------------------------------------------------
  describe('Path 5: corrupt state recovery', () => {
    let tmpHome;
    let result;

    before(() => {
      tmpHome = makeTempHome();
      const feynmanDir = path.join(tmpHome, '.claude', '.feynman');
      fs.mkdirSync(feynmanDir, { recursive: true });
      const statePath = path.join(feynmanDir, 'state.json');
      const flagPath  = path.join(tmpHome, '.claude', '.feynman-active');
      // Write malformed JSON
      fs.writeFileSync(statePath, '{ this is not valid json !!!');
      // Flag exists so hook tries to proceed
      fs.writeFileSync(flagPath, 'full');

      result = runHook(tmpHome, { prompt: 'any' });
    });

    after(() => rmrf(tmpHome));

    it('exits 0 (graceful recovery)', () => {
      assert.equal(result.status, 0, 'hook must exit 0 even with corrupt state');
    });

    it('does not throw or produce error output', () => {
      // stderr should be empty — no Node.js uncaught exceptions
      assert.equal(result.stderr.trim(), '', 'no stderr output expected');
    });
  });

  // -------------------------------------------------------------------------
  // Path 6: Rules file missing — exits 0 silently (self-heal)
  // Tests lines 72-74 (catch block when RULES_PATH unreadable)
  // -------------------------------------------------------------------------
  describe('Path 6: missing rules file (self-heal)', () => {
    let tmpHome;
    let result;

    before(() => {
      tmpHome = makeTempHome();
      const feynmanDir = path.join(tmpHome, '.claude', '.feynman');
      fs.mkdirSync(feynmanDir, { recursive: true });
      fs.writeFileSync(
        path.join(feynmanDir, 'state.json'),
        JSON.stringify({ enabled: true, intensity: 'full', injections: 0 })
      );
      fs.writeFileSync(path.join(tmpHome, '.claude', '.feynman-active'), 'full');

      // Create a modified hook that points to a non-existent rules file
      // so the catch(e) on RULES_PATH read fires
      const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8');
      const patchedSrc = hookSrc.replace(
        /const RULES_PATH\s*=.*$/m,
        `const RULES_PATH = '/nonexistent/path/to/rules.md';`
      );
      const patchedHookPath = path.join(tmpHome, 'feynman-activate-test.js');
      fs.writeFileSync(patchedHookPath, patchedSrc);

      result = spawnSync('node', [patchedHookPath], {
        input: JSON.stringify({ prompt: 'test' }),
        encoding: 'utf8',
        env: { ...process.env, HOME: tmpHome },
        timeout: 10000,
      });
    });

    after(() => rmrf(tmpHome));

    it('exits 0 when rules file missing (self-heal)', () => {
      assert.equal(result.status, 0);
    });

    it('no stderr (silent fail)', () => {
      assert.equal(result.stderr.trim(), '');
    });

    it('no stdout (no injection)', () => {
      assert.equal(result.stdout.trim(), '');
    });
  });

  // -------------------------------------------------------------------------
  // Path 6b: Outer catch — malformed JSON stdin
  // Tests lines 97-100
  // -------------------------------------------------------------------------
  describe('Path 6b: outer catch (malformed JSON stdin)', () => {
    let tmpHome;
    let result;

    before(() => {
      tmpHome = makeTempHome();
      result = spawnSync('node', [HOOK_PATH], {
        input: 'not json at all !!!',
        encoding: 'utf8',
        env: { ...process.env, HOME: tmpHome },
        timeout: 10000,
      });
    });

    after(() => rmrf(tmpHome));

    it('exits 0 on malformed JSON stdin', () => {
      assert.equal(result.status, 0);
    });

    it('no stderr (silent fail)', () => {
      assert.equal(result.stderr.trim(), '');
    });

    it('no stdout (no injection)', () => {
      assert.equal(result.stdout.trim(), '');
    });
  });

  // -------------------------------------------------------------------------
  // Path 7: State file write failure — still injects rules
  // -------------------------------------------------------------------------
  describe('Path 7: state write failure (read-only state dir)', () => {
    let tmpHome;
    let result;

    before(function() {
      // Skip on environments where we can't test file permissions (e.g. root)
      if (process.getuid && process.getuid() === 0) {
        this.skip('Cannot test read-only files as root');
        return;
      }
      tmpHome = makeTempHome();
      const feynmanDir = path.join(tmpHome, '.claude', '.feynman');
      fs.mkdirSync(feynmanDir, { recursive: true });
      const statePath = path.join(feynmanDir, 'state.json');
      fs.writeFileSync(
        statePath,
        JSON.stringify({ enabled: true, intensity: 'full', injections: 0 })
      );
      fs.writeFileSync(path.join(tmpHome, '.claude', '.feynman-active'), 'full');
      // Make state.json read-only so write fails
      fs.chmodSync(statePath, 0o444);

      result = runHook(tmpHome, { prompt: 'test' });
    });

    after(() => {
      if (tmpHome) {
        // Restore write permission for cleanup
        try {
          const statePath = path.join(tmpHome, '.claude', '.feynman', 'state.json');
          fs.chmodSync(statePath, 0o644);
        } catch (_) {}
        rmrf(tmpHome);
      }
    });

    it('still exits 0 (write failure is non-fatal)', () => {
      if (!tmpHome) return; // skipped
      assert.equal(result.status, 0);
    });

    it('still injects rules despite write failure', () => {
      if (!tmpHome) return; // skipped
      const ctx = parseAdditionalContext(result.stdout);
      assert.ok(ctx.length > 0, 'rules should still be injected even if state write fails');
    });
  });

  // -------------------------------------------------------------------------
  // Extra: session_id path-traversal guard
  // -------------------------------------------------------------------------
  describe('Security: session_id path-traversal guard', () => {
    let tmpHome;

    before(() => {
      tmpHome = makeTempHome();
      // Bootstrap a valid home so we know the exit is from the guard, not missing state
      const feynmanDir = path.join(tmpHome, '.claude', '.feynman');
      fs.mkdirSync(feynmanDir, { recursive: true });
      fs.writeFileSync(path.join(feynmanDir, 'state.json'), JSON.stringify({ enabled: true, intensity: 'full', injections: 0 }));
      fs.writeFileSync(path.join(tmpHome, '.claude', '.feynman-active'), 'full');
    });

    after(() => rmrf(tmpHome));

    it('exits 0 on path-traversal session_id', () => {
      const result = runHook(tmpHome, { prompt: 'x', session_id: '../../../etc/passwd' });
      assert.equal(result.status, 0);
      assert.equal(result.stdout.trim(), '', 'traversal session_id must be rejected silently');
    });
  });

});
