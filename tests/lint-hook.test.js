// tests/lint-hook.test.js — e2e tests for hooks/feynman-lint.js (Stop-hook)
// Spawns the hook as a child process, pipes stdin JSON {response}, checks stdout.
// Uses node:test + node:assert/strict.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const HOOK_PATH = path.resolve(__dirname, '..', 'hooks', 'feynman-lint.js');

/**
 * Run the lint hook with a given response string.
 * Returns { status, stdout, stderr }.
 */
function runLintHook(response) {
  const result = spawnSync('node', [HOOK_PATH], {
    input: JSON.stringify({ response }),
    encoding: 'utf8',
    timeout: 10000,
  });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

describe('feynman-lint Stop-hook', () => {

  // -------------------------------------------------------------------------
  // Path 1: Clean response (no diagrams) — exit 0, no additionalContext
  // -------------------------------------------------------------------------
  describe('Path 1: clean response (no diagrams)', () => {
    let result;

    it('exits 0', () => {
      result = runLintHook('This is just regular prose. No diagrams here.');
      assert.equal(result.status, 0);
    });

    it('emits no stdout', () => {
      const r = runLintHook('This is just regular prose. No diagrams here.');
      assert.equal(r.stdout.trim(), '', 'clean response should produce no output');
    });
  });

  // -------------------------------------------------------------------------
  // Path 2: Valid diagram — exit 0, no additionalContext
  // -------------------------------------------------------------------------
  describe('Path 2: valid diagram (lint passes)', () => {
    const validResponse = [
      'Here is the flow:',
      '',
      '```',
      '[Auth] --> [Handler] --> [Response]',
      '```',
      '',
      'And a tree:',
      '',
      '```',
      'project',
      '├── src',
      '│   └── index.js',
      '└── package.json',
      '```',
    ].join('\n');

    it('exits 0', () => {
      const r = runLintHook(validResponse);
      assert.equal(r.status, 0);
    });

    it('emits no stdout (valid diagram is silent)', () => {
      const r = runLintHook(validResponse);
      assert.equal(r.stdout.trim(), '', 'valid diagram should produce no output');
    });
  });

  // -------------------------------------------------------------------------
  // Path 3: Invalid diagram — exit 0, emits additionalContext with corrections
  // -------------------------------------------------------------------------
  describe('Path 3: invalid diagram (lint fails, emits correction)', () => {
    // L01 violation: ┌ with no matching └
    const invalidResponse = [
      'Here is a status:',
      '',
      '```',
      '┌─ Status ─┐',
      '│  item    │',
      '```',
    ].join('\n');

    let result;

    it('exits 0 (never blocks Claude)', () => {
      result = runLintHook(invalidResponse);
      assert.equal(result.status, 0, 'hook must always exit 0 even on lint failure');
    });

    it('emits JSON additionalContext', () => {
      const r = runLintHook(invalidResponse);
      assert.ok(r.stdout.trim().length > 0, 'should emit stdout for invalid diagram');
      const parsed = JSON.parse(r.stdout);
      assert.ok(parsed.hookSpecificOutput, 'hookSpecificOutput missing');
    });

    it('hookEventName is Stop', () => {
      const r = runLintHook(invalidResponse);
      const parsed = JSON.parse(r.stdout);
      assert.equal(parsed.hookSpecificOutput.hookEventName, 'Stop');
    });

    it('additionalContext contains rule correction', () => {
      const r = runLintHook(invalidResponse);
      const parsed = JSON.parse(r.stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(typeof ctx === 'string', 'additionalContext must be string');
      assert.ok(ctx.length > 0, 'additionalContext must not be empty');
      // Should reference L01 or box closure concept
      assert.ok(
        ctx.includes('L01') || ctx.includes('Box') || ctx.includes('box'),
        `correction should reference L01 rule, got: ${ctx.substring(0, 200)}`
      );
    });

    it('correction message has instruction line', () => {
      const r = runLintHook(invalidResponse);
      const parsed = JSON.parse(r.stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(
        ctx.includes('DIAGRAM LINT CORRECTIONS') || ctx.includes('correct') || ctx.includes('Correct'),
        'correction message should instruct to fix the diagram'
      );
    });
  });

  // -------------------------------------------------------------------------
  // Path 4: ALWAYS exits 0 (never blocks Claude)
  // -------------------------------------------------------------------------
  describe('Path 4: always exits 0', () => {
    const inputs = [
      '',
      'no diagrams at all',
      '```\n[A] --> [B]\n```',
      '```\n┌─ box ─┐\n│ item  │\n```',  // L01 fail
      '```\n[A] [B]\n```',                 // L05 fail
      '```\n▲ only up, no down\n```',     // L06 fail
    ];

    for (const response of inputs) {
      const label = response.length > 30 ? response.substring(0, 30) + '...' : (response || '<empty>');
      it(`exits 0 for: "${label}"`, () => {
        const r = runLintHook(response);
        assert.equal(r.status, 0, `hook must exit 0 for input "${label}"`);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Edge cases: malformed JSON input
  // -------------------------------------------------------------------------
  describe('Edge: malformed stdin JSON', () => {
    it('exits 0 on invalid JSON', () => {
      const result = spawnSync('node', [HOOK_PATH], {
        input: 'this is not json!',
        encoding: 'utf8',
        timeout: 10000,
      });
      assert.equal(result.status, 0, 'malformed JSON must not crash hook');
    });

    it('exits 0 on empty stdin', () => {
      const result = spawnSync('node', [HOOK_PATH], {
        input: '',
        encoding: 'utf8',
        timeout: 10000,
      });
      assert.equal(result.status, 0);
    });
  });

  // -------------------------------------------------------------------------
  // Path 5: autofix engaged for misaligned bare frame in prose
  // -------------------------------------------------------------------------
  describe('Path 5: autofix engaged for misaligned frame', () => {
    const misalignedResponse = [
      'Here is a status:',
      '',
      '┌──┐',
      '│ short │',
      '│ much longer content line │',
      '└──┘',
    ].join('\n');

    it('exits 0', () => {
      const r = runLintHook(misalignedResponse);
      assert.equal(r.status, 0);
    });

    it('emits additionalContext wrapped in <feynman-autofix>', () => {
      const r = runLintHook(misalignedResponse);
      assert.ok(r.stdout.trim().length > 0, 'should emit stdout');
      const parsed = JSON.parse(r.stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(
        ctx.includes('<feynman-autofix>') && ctx.includes('</feynman-autofix>'),
        `expected autofix wrapper, got: ${ctx.substring(0, 200)}`
      );
    });

    it('autofixed text passes lint cleanly', () => {
      const r = runLintHook(misalignedResponse);
      const parsed = JSON.parse(r.stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      const match = ctx.match(/<feynman-autofix>\n([\s\S]*?)\n<\/feynman-autofix>/);
      assert.ok(match, 'wrapper format missing');
      // Re-lint the fixed frame inside a code-block context (lint operates on fenced)
      const fixedFenced = '```\n' + match[1].split('\n').filter(l => /^[┌│└]/.test(l)).join('\n') + '\n```';
      const { lint } = require('../lib/lint');
      const result = lint(fixedFenced);
      const errors = result.issues.filter(i => i.severity === 'error' && (i.rule === 'L08' || i.rule === 'L09'));
      assert.equal(errors.length, 0, `autofixed frame should pass L08/L09, got: ${JSON.stringify(errors)}`);
    });
  });

  // -------------------------------------------------------------------------
  // Path 6: autofix is no-op on clean frame or fenced frame (fall through)
  // -------------------------------------------------------------------------
  describe('Path 6: autofix no-op (fenced or clean) falls through to rule path', () => {
    it('no autofix when frame is fenced (user-authored)', () => {
      // Misaligned frame INSIDE fences — autofix skips fenced content
      const response = '```\n┌──┐\n│ x │\n│ much longer │\n└──┘\n```';
      const r = runLintHook(response);
      assert.equal(r.status, 0);
      // Either silent (lint passes since L08/L09 may not fire on this fenced block depending on parser)
      // OR rule-feedback (no autofix wrapper)
      if (r.stdout.trim().length > 0) {
        const parsed = JSON.parse(r.stdout);
        const ctx = parsed.hookSpecificOutput.additionalContext;
        assert.ok(
          !ctx.includes('<feynman-autofix>'),
          'fenced frames should NOT trigger autofix wrapper'
        );
      }
    });

    it('clean response (no frames) does not emit autofix wrapper', () => {
      const response = '```\n[A] --> [B]\n```';
      const r = runLintHook(response);
      assert.equal(r.status, 0);
      if (r.stdout.trim().length > 0) {
        const parsed = JSON.parse(r.stdout);
        const ctx = parsed.hookSpecificOutput.additionalContext;
        assert.ok(
          !ctx.includes('<feynman-autofix>'),
          'no frames should not trigger autofix wrapper'
        );
      }
    });
  });

  // -------------------------------------------------------------------------
  // L-rule corrections: verify specific rule corrections appear in output
  // -------------------------------------------------------------------------
  describe('Rule corrections in additionalContext', () => {
    it('L02 correction mentions └──', () => {
      // last child uses ├── instead of └──
      const response = '```\nroot\n├── only-child\n```';
      const r = runLintHook(response);
      const parsed = JSON.parse(r.stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(
        ctx.includes('L02') || ctx.includes('└──') || ctx.includes('tree'),
        `L02 correction expected, got: ${ctx.substring(0, 200)}`
      );
    });

    it('L05 correction mentions arrow', () => {
      const response = '```\n[A] [B]\n```';
      const r = runLintHook(response);
      const parsed = JSON.parse(r.stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext;
      assert.ok(
        ctx.includes('L05') || ctx.includes('arrow') || ctx.includes('-->'),
        `L05 correction expected, got: ${ctx.substring(0, 200)}`
      );
    });
  });
});
