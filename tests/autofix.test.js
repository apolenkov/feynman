// tests/autofix.test.js — unit tests for lib/lint/autofix
// Pure-function autofix engine: rewrites misaligned ASCII frames.
// Zero deps. node:test + node:assert/strict.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { autofixFrame, autofix } = require(path.resolve(__dirname, '..', 'lib', 'lint', 'autofix'));

// ---------------------------------------------------------------------------
// Helpers — build frame node objects matching the autofix.js contract.
// A frame node = { kind: 'frame', top, inner, bottom, indent, start, end }
// `top` and `bottom` are the raw border lines (with corners), `inner` is an
// array of raw inner lines (with leading and trailing │ as authored).
// `indent` is the leading-space string of the top line.
// ---------------------------------------------------------------------------
function frameNode(top, inner, bottom, indent) {
  return {
    kind: 'frame',
    top,
    inner,
    bottom,
    indent: indent || '',
    start: 0,
    end: 0,
  };
}

// ---------------------------------------------------------------------------
// autofixFrame — direct frame rewriting
// ---------------------------------------------------------------------------
describe('autofixFrame — single-frame repair', () => {
  it('repairs a frame whose inner line is wider than the border', () => {
    // Top says width=10 dashes. Inner content needs 14 chars.
    const node = frameNode(
      '┌──────────┐',
      ['│ short                │', '│ this line is too wide │'],
      '└──────────┘'
    );
    const out = autofixFrame(node);
    const lines = out.split('\n');
    // Top, two inner, bottom — 4 lines.
    assert.equal(lines.length, 4);
    // Top and bottom widths must match.
    assert.equal(lines[0].length, lines[3].length);
    // Every inner line must end with │ at the same column as ┐ on top.
    const topBarEnd = [...lines[0]].length;
    for (let i = 1; i < lines.length - 1; i++) {
      assert.equal([...lines[i]].length, topBarEnd, `inner line ${i} must match top width`);
      assert.equal([...lines[i]].pop(), '│');
    }
    assert.equal([...lines[3]].pop(), '┘');
  });

  it('repairs a frame whose right-edge │ is past the top ┐ column', () => {
    // Misaligned: inner │ overshoots the top ┐.
    const node = frameNode(
      '┌─────┐',
      ['│ a       │', '│ b   │'],
      '└─────┘'
    );
    const out = autofixFrame(node);
    const lines = out.split('\n');
    const topBarEnd = [...lines[0]].length;
    for (const line of lines) {
      assert.equal([...line].length, topBarEnd);
    }
  });

  it('is idempotent on an already-clean frame', () => {
    const clean = [
      '┌────────┐',
      '│ hello  │',
      '│ world  │',
      '└────────┘',
    ];
    const node = frameNode(clean[0], [clean[1], clean[2]], clean[3]);
    const out = autofixFrame(node);
    assert.equal(out, clean.join('\n'));
    // Apply twice — no further change.
    const node2 = frameNode(clean[0], [clean[1], clean[2]], clean[3]);
    assert.equal(autofixFrame(node2), out);
  });

  it('preserves Unicode content (▲▼ ✓✗ ├──) inside the frame', () => {
    const node = frameNode(
      '┌──────────┐',
      ['│ ▲ high     │', '│ ✓ done     │', '│ ├── child  │'],
      '└──────────┘'
    );
    const out = autofixFrame(node);
    assert.match(out, /▲ high/);
    assert.match(out, /✓ done/);
    assert.match(out, /├── child/);
    // All lines aligned.
    const lines = out.split('\n');
    const w = [...lines[0]].length;
    for (const line of lines) assert.equal([...line].length, w);
  });

  it('preserves indent on every line of an indented frame', () => {
    const node = frameNode(
      '    ┌────┐',
      ['    │ a    │', '    │ bb   │'],
      '    └────┘',
      '    '
    );
    const out = autofixFrame(node);
    for (const line of out.split('\n')) {
      assert.ok(line.startsWith('    '), `line missing indent: ${line}`);
    }
  });
});

// ---------------------------------------------------------------------------
// autofix(text) — text-level walker
// ---------------------------------------------------------------------------
describe('autofix(text) — full document rewriting', () => {
  it('leaves text without frames unchanged', () => {
    const text = '# Heading\n\nSome prose paragraph.\n\n- list item\n- another\n';
    assert.equal(autofix(text), text);
  });

  it('only touches frame regions — non-frame text is byte-identical', () => {
    const before = [
      '# Title',
      '',
      'prose before',
      '',
      '┌────┐',
      '│ a    │',
      '└────┘',
      '',
      'prose after',
      '',
    ].join('\n');
    const after = autofix(before);
    // Prose blocks survive verbatim.
    assert.match(after, /^# Title$/m);
    assert.match(after, /^prose before$/m);
    assert.match(after, /^prose after$/m);
    // Frame is now well-formed.
    const frameMatch = after.match(/┌[─]+┐\n(?:│[^\n]*│\n)+└[─]+┘/);
    assert.ok(frameMatch, 'frame must be repaired and matchable');
    // Width consistency on the rewritten frame.
    const flines = frameMatch[0].split('\n');
    const w = [...flines[0]].length;
    for (const l of flines) assert.equal([...l].length, w);
  });

  it('is idempotent — autofix(autofix(x)) === autofix(x)', () => {
    const text = [
      'preface',
      '┌────┐',
      '│ longer content │',
      '│ x   │',
      '└────┘',
      'epilogue',
    ].join('\n');
    const once = autofix(text);
    const twice = autofix(once);
    assert.equal(twice, once);
  });

  it('handles multiple sibling frames in one document', () => {
    const text = [
      '┌───┐',
      '│ aaaa  │',
      '└───┘',
      '',
      '┌──────┐',
      '│ b │',
      '└──────┘',
    ].join('\n');
    const out = autofix(text);
    // Two frames — each must be self-consistent.
    const frames = out.match(/┌[─]+┐\n(?:│[^\n]*│\n)+└[─]+┘/g);
    assert.ok(frames && frames.length === 2, `expected 2 frames, got ${frames && frames.length}`);
    for (const f of frames) {
      const fl = f.split('\n');
      const w = [...fl[0]].length;
      for (const l of fl) assert.equal([...l].length, w);
    }
  });

  it('skips empty frames (┌┐ / └┘) — no crash, returns unchanged', () => {
    const text = '┌┐\n└┘\n';
    assert.equal(autofix(text), text);
  });

  it('does not touch frames inside fenced code blocks', () => {
    const text = [
      'before',
      '```',
      '┌──┐',
      '│ broken inside fence │',
      '└──┘',
      '```',
      'after',
    ].join('\n');
    // Code-block frames are user-rendered samples — leave them alone.
    const out = autofix(text);
    assert.equal(out, text);
  });
});
