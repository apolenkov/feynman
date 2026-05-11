// tests/hook.test.ts — e2e tests for feynman hook scripts
// Uses node:test + node:assert/strict. Spawns hook as child process.
// Each test gets an isolated temp dir (HOME override) — no ~/.claude/ pollution.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOOK_PATH = path.resolve(import.meta.dirname, '..', 'hooks', 'feynman-activate.ts');
const SESSION_HOOK_PATH = path.resolve(import.meta.dirname, '..', 'hooks', 'feynman-session-start.ts');

/**
 * Create an isolated temp dir and return its path.
 * The dir is auto-cleaned after the test using the cleanup fn returned.
 */
function makeTempHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-hook-test-'));
  return dir;
}

function rmrf(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

interface HookResult {
  status: number;
  stdout: string;
  stderr: string;
}

/**
 * Run the hook with a given HOME and stdin JSON.
 * Returns { status, stdout, stderr }.
 */
function runHook(tmpHome: string, stdinData: unknown): HookResult {
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
    status: result.status ?? 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runHookWithFeynmanHome(tmpHome: string, feynmanHome: string, stdinData: unknown): HookResult {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify(stdinData),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tmpHome,
      FEYNMAN_HOME: feynmanHome,
    },
    timeout: 10000,
  });
  return {
    status: result.status ?? 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function runSessionHook(tmpHome: string, stdinData: unknown = { session_id: 'test-session' }): HookResult {
  const result = spawnSync('node', [SESSION_HOOK_PATH], {
    input: JSON.stringify(stdinData),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tmpHome,
    },
    timeout: 10000,
  });
  return {
    status: result.status ?? 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Parse additionalContext from hook stdout JSON.
 * Returns the additionalContext string or throws.
 */
function parseAdditionalContext(stdout: string): string {
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
    let tmpHome: string;
    let result: HookResult;

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
      assert.ok(fs.existsSync(flagPath), '.feynman-active flag should be created by default');
    });

    it('emits valid additionalContext JSON', () => {
      const ctx = parseAdditionalContext(result.stdout);
      assert.ok(ctx.length > 0, 'additionalContext should not be empty');
    });

    it('stdout is valid JSON (no trailing newline issues)', () => {
      const parsed = JSON.parse(result.stdout);
      assert.equal(typeof parsed, 'object');
    });
  });

  describe('Codex target via FEYNMAN_HOME', () => {
    let tmpHome: string;
    let codexHome: string;
    let result: HookResult;

    before(() => {
      tmpHome = makeTempHome();
      codexHome = path.join(tmpHome, '.codex');
      result = runHookWithFeynmanHome(tmpHome, codexHome, { prompt: 'draw the flow' });
    });

    after(() => rmrf(tmpHome));

    it('creates ~/.codex/.feynman/state.json', () => {
      const statePath = path.join(codexHome, '.feynman', 'state.json');
      assert.ok(fs.existsSync(statePath), 'Codex state.json should be created');
    });

    it('creates ~/.codex/.feynman-active flag', () => {
      const flagPath = path.join(codexHome, '.feynman-active');
      assert.ok(fs.existsSync(flagPath), 'Codex flag should be created by default');
    });

    it('emits valid additionalContext by default', () => {
      assert.equal(result.status, 0);
      const ctx = parseAdditionalContext(result.stdout);
      assert.ok(ctx.length > 0, 'additionalContext should not be empty');
    });
  });

  describe('SessionStart hook', () => {
    it('bootstraps full mode and emits rules text', () => {
      const tmpHome = makeTempHome();
      try {
        const result = runSessionHook(tmpHome);
        const statePath = path.join(tmpHome, '.claude', '.feynman', 'state.json');
        const flagPath = path.join(tmpHome, '.claude', '.feynman-active');
        const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        assert.equal(result.status, 0);
        assert.equal(state.enabled, true);
        assert.equal(state.intensity, 'full');
        assert.ok(fs.existsSync(flagPath), '.feynman-active flag should be created');
        assert.ok(result.stdout.length > 50, 'SessionStart should emit non-trivial rules text');
      } finally {
        rmrf(tmpHome);
      }
    });

    it('stays silent when state is disabled', () => {
      const tmpHome = makeTempHome();
      try {
        const feynmanDir = path.join(tmpHome, '.claude', '.feynman');
        fs.mkdirSync(feynmanDir, { recursive: true });
        fs.writeFileSync(
          path.join(feynmanDir, 'state.json'),
          JSON.stringify({ enabled: false, intensity: 'full', injections: 0 })
        );
        const result = runSessionHook(tmpHome);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, '');
      } finally {
        rmrf(tmpHome);
      }
    });

    it('stays silent and removes flag when state is corrupt', () => {
      const tmpHome = makeTempHome();
      try {
        const feynmanDir = path.join(tmpHome, '.claude', '.feynman');
        fs.mkdirSync(feynmanDir, { recursive: true });
        fs.writeFileSync(path.join(feynmanDir, 'state.json'), '{ not valid json');
        fs.writeFileSync(path.join(tmpHome, '.claude', '.feynman-active'), 'full');

        const result = runSessionHook(tmpHome);
        assert.equal(result.status, 0);
        assert.equal(result.stdout, '');
        assert.equal(result.stderr, '');
        assert.ok(!fs.existsSync(path.join(tmpHome, '.claude', '.feynman-active')));
      } finally {
        rmrf(tmpHome);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Path 2: Normal flow — enabled, intensity=full
  // -------------------------------------------------------------------------
  describe('Path 2: normal flow (enabled, intensity=full)', () => {
    let tmpHome: string;
    let result: HookResult;
    let stateAfter: Record<string, unknown>;

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
      assert.equal(stateAfter['injections'], 3, 'injections should increment from 2 to 3');
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
  // Path 3: Disabled — .feynman-active absent, state.enabled=false
  // -------------------------------------------------------------------------
  describe('Path 3: disabled (flag absent, state.enabled=false)', () => {
    let tmpHome: string;
    let result: HookResult;

    before(() => {
      tmpHome = makeTempHome();
      const feynmanDir = path.join(tmpHome, '.claude', '.feynman');
      fs.mkdirSync(feynmanDir, { recursive: true });
      const statePath = path.join(feynmanDir, 'state.json');
      // Write disabled state and DO NOT create flag file.
      fs.writeFileSync(statePath, JSON.stringify({ enabled: false, intensity: 'full', injections: 5 }));

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
    let tmpHomeLite: string;
    let tmpHomeUltra: string;
    let resultLite: HookResult;
    let resultUltra: HookResult;

    before(() => {
      function makeHome(intensity: string): string {
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
      assert.ok(ctx.includes('Lite') || ctx.length < parseAdditionalContext(resultUltra.stdout).length, 'lite section should be lite variant');
    });
  });

  // -------------------------------------------------------------------------
  // Path 5: Corrupt state recovery — malformed state.json
  // -------------------------------------------------------------------------
  describe('Path 5: corrupt state recovery', () => {
    let tmpHome: string;
    let result: HookResult;

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
    let tmpHome: string;
    let result: SpawnSyncReturns<string>;

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
      const patchedHookPath = path.join(tmpHome, 'feynman-activate-test.ts');
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
      assert.equal((result.stderr || '').trim(), '');
    });

    it('no stdout (no injection)', () => {
      assert.equal((result.stdout || '').trim(), '');
    });
  });

  // -------------------------------------------------------------------------
  // Path 6b: Outer catch — malformed JSON stdin
  // Tests lines 97-100
  // -------------------------------------------------------------------------
  describe('Path 6b: outer catch (malformed JSON stdin)', () => {
    let tmpHome: string;

    before(() => {
      tmpHome = makeTempHome();
    });

    after(() => rmrf(tmpHome));

    it('exits 0 on malformed JSON stdin', () => {
      const r = spawnSync('node', [HOOK_PATH], {
        input: 'not json at all !!!',
        encoding: 'utf8',
        env: { ...process.env, HOME: tmpHome },
        timeout: 10000,
      });
      assert.equal(r.status, 0);
    });

    it('no stderr (silent fail)', () => {
      const r = spawnSync('node', [HOOK_PATH], {
        input: 'not json at all !!!',
        encoding: 'utf8',
        env: { ...process.env, HOME: tmpHome },
        timeout: 10000,
      });
      assert.equal((r.stderr || '').trim(), '');
    });

    it('no stdout (no injection)', () => {
      const r = spawnSync('node', [HOOK_PATH], {
        input: 'not json at all !!!',
        encoding: 'utf8',
        env: { ...process.env, HOME: tmpHome },
        timeout: 10000,
      });
      assert.equal((r.stdout || '').trim(), '');
    });
  });

  // -------------------------------------------------------------------------
  // Path 7: State file write failure — still injects rules
  // -------------------------------------------------------------------------
  describe('Path 7: state write failure (read-only state dir)', () => {
    let tmpHome: string;
    let result: HookResult;

    before(function(this: unknown) {
      // Skip on environments where we can't test file permissions (e.g. root)
      if (process.getuid && process.getuid() === 0) {
        (this as { skip: () => void }).skip();
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
  // rules-file integrity (production rules) — asserts live rules/feynman-activate.md
  // These tests read the production artifact directly. They FAIL on the old HTML-comment
  // format (red phase) and PASS once Task 2 rewrites the file to XML contract.
  // -------------------------------------------------------------------------
  describe('rules-file integrity (production rules)', () => {
    const RULES_FILE = path.resolve(import.meta.dirname, '..', 'rules', 'feynman-activate.md');
    let rulesContent: string;
    let rulesBytes: number;

    before(() => {
      rulesContent = fs.readFileSync(RULES_FILE, 'utf8');
      rulesBytes   = fs.statSync(RULES_FILE).size;
    });

    it('file size ≤ 4480 bytes', () => {
      assert.ok(rulesBytes <= 4480, `rules file is ${rulesBytes} bytes — must be ≤ 4480`);
    });

    it('contains exactly 3 <intensity name="…"> opening tags', () => {
      const matches = rulesContent.match(/<intensity\s+name\s*=\s*["'][^"']+["']\s*>/g) || [];
      assert.equal(matches.length, 3, `expected 3 <intensity name=...> tags, found ${matches.length}`);
    });

    it('contains exactly 3 </intensity> closing tags', () => {
      const matches = rulesContent.match(/<\/intensity>/g) || [];
      assert.equal(matches.length, 3, `expected 3 </intensity> closing tags, found ${matches.length}`);
    });

    it('contains zero legacy HTML-comment intensity markers', () => {
      const legacy = (rulesContent.match(/<!--\s*\/?(lite|full|ultra)\s*-->/g) || []).length;
      assert.equal(legacy, 0, `found ${legacy} legacy HTML-comment markers — must be removed`);
    });

    it('contains at least one each of <triggers> <syntax> <examples> <contract> tags', () => {
      assert.ok(/<triggers>/.test(rulesContent), 'missing <triggers> tag');
      assert.ok(/<syntax>/.test(rulesContent), 'missing <syntax> tag');
      assert.ok(/<examples>/.test(rulesContent), 'missing <examples> tag');
      assert.ok(/<contract>/.test(rulesContent), 'missing <contract> tag');
    });

    it('<contract> content contains classify, channel, amplify, suppress', () => {
      const contractMatch = rulesContent.match(/<contract>([\s\S]*?)<\/contract>/i);
      assert.ok(contractMatch, 'no <contract>…</contract> block found');
      const body = contractMatch![1]!.toLowerCase();
      for (const word of ['classify', 'channel', 'amplify', 'suppress']) {
        assert.ok(body.includes(word), `<contract> missing word: ${word}`);
      }
    });

    it('SDLC patterns wrapper: <patterns selection="one-of"> or "select ONE" or "mutex"', () => {
      const hasWrapper  = /<patterns\s+selection\s*=\s*["']one-of["']>/.test(rulesContent);
      const hasSelectOne = /select ONE/i.test(rulesContent);
      const hasMutex    = /mutex/.test(rulesContent);
      assert.ok(hasWrapper || hasSelectOne || hasMutex, 'missing mutex SDLC pattern marker');
    });

    it('suppression guidance names all four classes: definition, recommendation, question, greeting', () => {
      const lower = rulesContent.toLowerCase();
      for (const word of ['definition', 'recommendation', 'question', 'greeting']) {
        assert.ok(lower.includes(word), `suppression guidance missing: ${word}`);
      }
    });

    it('few-shot literal-character density: ≥6 "├──" occurrences', () => {
      const count = (rulesContent.match(/├──/g) || []).length;
      assert.ok(count >= 6, `found ${count} "├──" occurrences — need ≥ 6`);
    });

    it('few-shot arrow density: ≥6 "→" occurrences', () => {
      const count = (rulesContent.match(/→/g) || []).length;
      assert.ok(count >= 6, `found ${count} "→" occurrences — need ≥ 6`);
    });

    it('hook extracts each intensity (lite/full/ultra) as non-empty and distinct content', () => {
      // Inline xmlMatchers — doubles as contract assertion against hook drift
      const xmlMatchers: Record<string, RegExp> = {
        lite:  /<intensity\s+name\s*=\s*["']lite["']\s*>([\s\S]*?)<\/intensity>/,
        full:  /<intensity\s+name\s*=\s*["']full["']\s*>([\s\S]*?)<\/intensity>/,
        ultra: /<intensity\s+name\s*=\s*["']ultra["']\s*>([\s\S]*?)<\/intensity>/,
      };
      const extracted: Record<string, string> = {};
      for (const [name, re] of Object.entries(xmlMatchers)) {
        const m = re.exec(rulesContent);
        assert.ok(m, `hook regex could not extract <intensity name="${name}"> block`);
        const content = m![1]!.trim();
        assert.ok(content.length > 0, `extracted ${name} content is empty`);
        extracted[name] = content;
      }
      assert.notEqual(extracted['lite'], extracted['full'],  'lite and full must be distinct');
      assert.notEqual(extracted['full'], extracted['ultra'], 'full and ultra must be distinct');
      assert.notEqual(extracted['lite'], extracted['ultra'], 'lite and ultra must be distinct');
    });
  });

  // -------------------------------------------------------------------------
  // Extra: session_id path-traversal guard
  // -------------------------------------------------------------------------
  describe('Security: session_id path-traversal guard', () => {
    let tmpHome: string;

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

  // -------------------------------------------------------------------------
  // XML intensity extraction — TDD RED block (Plan 08-01)
  // Tests that the hook extracts content from <intensity name="..."> XML tags.
  // Uses the Path 6 patched-hook pattern: rewrites RULES_PATH to a temp file
  // containing inline XML rule fixtures.
  // -------------------------------------------------------------------------
  describe('XML intensity extraction', () => {

    /**
     * Runs a patched copy of the hook with RULES_PATH pointing at a synthetic
     * rules file written by the test. Mirrors Path 6 helper pattern.
     */
    function runHookWithRules(tmpHome: string, rulesContent: string, _intensity: string): SpawnSyncReturns<string> {
      const hookSrc = fs.readFileSync(HOOK_PATH, 'utf8');
      const rulesFilePath = path.join(tmpHome, 'synthetic-rules.md');
      fs.writeFileSync(rulesFilePath, rulesContent);
      const escapedPath = rulesFilePath.replace(/\\/g, '\\\\');
      const patchedSrc = hookSrc.replace(
        /const RULES_PATH\s*=.*$/m,
        `const RULES_PATH = '${escapedPath}';`
      );
      const patchedHookPath = path.join(tmpHome, 'feynman-activate-xml-test.ts');
      fs.writeFileSync(patchedHookPath, patchedSrc);

      return spawnSync('node', [patchedHookPath], {
        input: JSON.stringify({ prompt: 'test' }),
        encoding: 'utf8',
        env: { ...process.env, HOME: tmpHome },
        timeout: 10000,
      });
    }

    function setupHome(intensity: string): string {
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

    // Case 1: extracts lite content from <intensity name="lite">…</intensity>
    it('extracts lite content from XML intensity block', () => {
      const tmpHome = setupHome('lite');
      try {
        const rules = [
          '<intensity name="lite">',
          'Lite rules content here.',
          '</intensity>',
          '<intensity name="full">',
          'Full rules content here.',
          '</intensity>',
          '<intensity name="ultra">',
          'Ultra rules content here.',
          '</intensity>',
        ].join('\n');
        const result = runHookWithRules(tmpHome, rules, 'lite');
        assert.equal(result.status, 0);
        const ctx = parseAdditionalContext(result.stdout || '');
        assert.ok(ctx.includes('Lite rules content here.'), `expected lite content, got: ${ctx}`);
        assert.ok(!ctx.includes('Full rules'), 'should not include full content');
      } finally {
        rmrf(tmpHome);
      }
    });

    // Case 2: extracts full content from <intensity name="full">…</intensity>
    it('extracts full content from XML intensity block', () => {
      const tmpHome = setupHome('full');
      try {
        const rules = [
          '<intensity name="lite">',
          'Lite rules content here.',
          '</intensity>',
          '<intensity name="full">',
          'Full rules content here.',
          '</intensity>',
          '<intensity name="ultra">',
          'Ultra rules content here.',
          '</intensity>',
        ].join('\n');
        const result = runHookWithRules(tmpHome, rules, 'full');
        assert.equal(result.status, 0);
        const ctx = parseAdditionalContext(result.stdout || '');
        assert.ok(ctx.includes('Full rules content here.'), `expected full content, got: ${ctx}`);
        assert.ok(!ctx.includes('Lite rules'), 'should not include lite content');
      } finally {
        rmrf(tmpHome);
      }
    });

    // Case 3: extracts ultra content from <intensity name="ultra">…</intensity>
    it('extracts ultra content from XML intensity block', () => {
      const tmpHome = setupHome('ultra');
      try {
        const rules = [
          '<intensity name="lite">',
          'Lite rules content here.',
          '</intensity>',
          '<intensity name="full">',
          'Full rules content here.',
          '</intensity>',
          '<intensity name="ultra">',
          'Ultra rules content here.',
          '</intensity>',
        ].join('\n');
        const result = runHookWithRules(tmpHome, rules, 'ultra');
        assert.equal(result.status, 0);
        const ctx = parseAdditionalContext(result.stdout || '');
        assert.ok(ctx.includes('Ultra rules content here.'), `expected ultra content, got: ${ctx}`);
        assert.ok(!ctx.includes('Lite rules'), 'should not include lite content');
      } finally {
        rmrf(tmpHome);
      }
    });

    // Case 4: tolerates whitespace variants — <intensity name = "lite" > and single quotes
    it('tolerates whitespace in XML tag attributes', () => {
      const tmpHome = setupHome('lite');
      try {
        const rules = [
          '<intensity name = "lite" >',
          'Lite whitespace variant content.',
          '</intensity>',
        ].join('\n');
        const result = runHookWithRules(tmpHome, rules, 'lite');
        assert.equal(result.status, 0);
        const ctx = parseAdditionalContext(result.stdout || '');
        assert.ok(ctx.includes('Lite whitespace variant content.'), `expected whitespace-variant content, got: ${ctx}`);
      } finally {
        rmrf(tmpHome);
      }
    });

    // Case 4b: tolerates single-quoted attributes — <intensity name='lite'>
    it('tolerates single-quoted XML intensity attribute', () => {
      const tmpHome = setupHome('lite');
      try {
        const rules = [
          "<intensity name='lite'>",
          'Lite single-quote content.',
          '</intensity>',
        ].join('\n');
        const result = runHookWithRules(tmpHome, rules, 'lite');
        assert.equal(result.status, 0);
        const ctx = parseAdditionalContext(result.stdout || '');
        assert.ok(ctx.includes('Lite single-quote content.'), `expected single-quote content, got: ${ctx}`);
      } finally {
        rmrf(tmpHome);
      }
    });

    // Case 5: ignores text outside any <intensity> block
    it('ignores content outside XML intensity blocks', () => {
      const tmpHome = setupHome('full');
      try {
        const rules = [
          'This preamble text should NOT be injected.',
          '<intensity name="lite">',
          'Lite only.',
          '</intensity>',
          '<intensity name="full">',
          'Full target content.',
          '</intensity>',
          'This epilogue text should NOT be injected either.',
        ].join('\n');
        const result = runHookWithRules(tmpHome, rules, 'full');
        assert.equal(result.status, 0);
        const ctx = parseAdditionalContext(result.stdout || '');
        assert.ok(ctx.includes('Full target content.'), `expected full content, got: ${ctx}`);
        assert.ok(!ctx.includes('preamble'), 'preamble must not be injected');
        assert.ok(!ctx.includes('epilogue'), 'epilogue must not be injected');
      } finally {
        rmrf(tmpHome);
      }
    });

    // Case 6: legacy regression — HTML-comment markers still work (dual-format backward compat)
    it('legacy regression: HTML-comment markers still extract content', () => {
      const tmpHome = setupHome('full');
      try {
        // Use the REAL rules file (which still has HTML-comment markers)
        // No patching needed — just run the real hook with legacy rules
        const result = runHook(tmpHome, { prompt: 'test' });
        assert.equal(result.status, 0);
        const ctx = parseAdditionalContext(result.stdout);
        assert.ok(ctx.length > 50, 'legacy HTML-comment rules must still be extracted');
      } finally {
        rmrf(tmpHome);
      }
    });

  });

});

// ─── Phase 10: Output-style presets (short / middle / full) ──────────────────

describe('hook output_style suffix injection (Phase 10)', () => {
  function seedState(tmpHome: string, state: Record<string, unknown>): void {
    const feynmanDir = path.join(tmpHome, '.claude', '.feynman');
    fs.mkdirSync(feynmanDir, { recursive: true });
    fs.writeFileSync(path.join(feynmanDir, 'state.json'), JSON.stringify(state, null, 2));
    fs.writeFileSync(path.join(tmpHome, '.claude', '.feynman-active'), (state['intensity'] as string) || 'full');
  }

  it('output_style=full → no suffix added (default behaviour)', () => {
    const tmpHome = makeTempHome();
    try {
      seedState(tmpHome, { enabled: true, intensity: 'full', output_style: 'full', injections: 0 });
      const result = runHook(tmpHome, { session_id: 's1', prompt: 'hi' });
      assert.equal(result.status, 0);
      const ctx = parseAdditionalContext(result.stdout);
      assert.doesNotMatch(ctx, /Output style:/, 'no suffix for output_style=full');
    } finally {
      rmrf(tmpHome);
    }
  });

  it('output_style missing → no suffix (back-compat with v0.3.x state.json)', () => {
    const tmpHome = makeTempHome();
    try {
      seedState(tmpHome, { enabled: true, intensity: 'full', injections: 0 });
      const result = runHook(tmpHome, { session_id: 's1', prompt: 'hi' });
      assert.equal(result.status, 0);
      const ctx = parseAdditionalContext(result.stdout);
      assert.doesNotMatch(ctx, /Output style:/, 'missing output_style must default to full (no suffix)');
    } finally {
      rmrf(tmpHome);
    }
  });

  it('output_style=short → short suffix appended', () => {
    const tmpHome = makeTempHome();
    try {
      seedState(tmpHome, { enabled: true, intensity: 'full', output_style: 'short', injections: 0 });
      const result = runHook(tmpHome, { session_id: 's1', prompt: 'hi' });
      assert.equal(result.status, 0);
      const ctx = parseAdditionalContext(result.stdout);
      assert.match(ctx, /Output style: short/, 'short suffix must appear');
      assert.match(ctx, /no frames/i, 'short suffix must forbid frames');
      assert.match(ctx, /dot-leader/i, 'short suffix must mention dot-leader');
    } finally {
      rmrf(tmpHome);
    }
  });

  it('output_style=middle → middle suffix appended', () => {
    const tmpHome = makeTempHome();
    try {
      seedState(tmpHome, { enabled: true, intensity: 'full', output_style: 'middle', injections: 0 });
      const result = runHook(tmpHome, { session_id: 's1', prompt: 'hi' });
      assert.equal(result.status, 0);
      const ctx = parseAdditionalContext(result.stdout);
      assert.match(ctx, /Output style: middle/, 'middle suffix must appear');
      assert.match(ctx, /≥6|>= ?6|6\+/, 'middle suffix must mention ≥6 threshold for frames');
    } finally {
      rmrf(tmpHome);
    }
  });

  it('suffix appended AFTER rules text — rules content not corrupted', () => {
    const tmpHome = makeTempHome();
    try {
      seedState(tmpHome, { enabled: true, intensity: 'full', output_style: 'short', injections: 0 });
      const result = runHook(tmpHome, { session_id: 's1', prompt: 'hi' });
      assert.equal(result.status, 0);
      const ctx = parseAdditionalContext(result.stdout);
      // The contract block lives in the rules file; suffix must come AFTER it.
      const contractIdx = ctx.indexOf('<contract>');
      const suffixIdx = ctx.indexOf('Output style:');
      if (contractIdx >= 0) {
        assert.ok(suffixIdx > contractIdx, 'suffix must come after rules content');
      } else {
        // Fallback: suffix exists.
        assert.ok(suffixIdx > 0, 'suffix exists');
      }
    } finally {
      rmrf(tmpHome);
    }
  });

  it('invalid output_style value → treated as full (no suffix)', () => {
    const tmpHome = makeTempHome();
    try {
      seedState(tmpHome, { enabled: true, intensity: 'full', output_style: 'garbage', injections: 0 });
      const result = runHook(tmpHome, { session_id: 's1', prompt: 'hi' });
      assert.equal(result.status, 0);
      const ctx = parseAdditionalContext(result.stdout);
      assert.doesNotMatch(ctx, /Output style:/, 'invalid value must fall back to full (no suffix)');
    } finally {
      rmrf(tmpHome);
    }
  });
});
