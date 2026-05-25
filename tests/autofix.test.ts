// tests/autofix.test.ts — unit tests for lib/lint/autofix
// Pure-function autofix engine: rewrites misaligned ASCII frames.
// Zero deps. node:test + node:assert/strict.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

import { autofixFrame, autofix, autofixFrameToDotLeader } from '../lib/lint/autofix.ts';
import type { FrameNodeFull } from '../lib/lint/autofix.ts';

const require = createRequire(import.meta.url);
const cases = require(path.resolve(import.meta.dirname, 'lint-cases.json')) as Array<{
  name: string;
  input: string;
  expected_after_autofix_shape?: {
    no_frame_chars?: boolean;
    row_count?: number;
    mode?: string;
    aligned_dots?: boolean;
    preserves?: string[];
  };
}>;

// ---------------------------------------------------------------------------
// Helpers — build frame node objects matching the autofix.ts contract.
// A frame node = { kind: 'frame', top, inner, bottom, indent, start, end }
// `top` and `bottom` are the raw border lines (with corners), `inner` is an
// array of raw inner lines (with leading and trailing │ as authored).
// `indent` is the leading-space string of the top line.
// ---------------------------------------------------------------------------
function frameNode(top: string, inner: string[], bottom: string, indent?: string): FrameNodeFull {
  return {
    kind: 'frame',
    top,
    inner,
    bottom,
    indent: indent || '',
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
    assert.equal(lines[0]!.length, lines[3]!.length);
    // Every inner line must end with │ at the same column as ┐ on top.
    const topBarEnd = [...lines[0]!].length;
    for (let i = 1; i < lines.length - 1; i++) {
      assert.equal([...lines[i]!].length, topBarEnd, `inner line ${i} must match top width`);
      assert.equal([...lines[i]!].pop(), '│');
    }
    assert.equal([...lines[3]!].pop(), '┘');
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
    const topBarEnd = [...lines[0]!].length;
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
    const node = frameNode(clean[0]!, [clean[1]!, clean[2]!], clean[3]!);
    const out = autofixFrame(node);
    assert.equal(out, clean.join('\n'));
    // Apply twice — no further change.
    const node2 = frameNode(clean[0]!, [clean[1]!, clean[2]!], clean[3]!);
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
    const w = [...lines[0]!].length;
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
    const flines = frameMatch![0]!.split('\n');
    const w = [...flines[0]!].length;
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
    for (const f of frames!) {
      const fl = f.split('\n');
      const w = [...fl[0]!].length;
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

// ---------------------------------------------------------------------------
// autofixFrameToDotLeader — L11 conversion (Plan 09-04 / LINT-14)
// ---------------------------------------------------------------------------
describe('autofixFrameToDotLeader — L11 conversion', () => {
  it('exports autofixFrameToDotLeader', () => {
    assert.equal(typeof autofixFrameToDotLeader, 'function');
  });

  it('5-row frame with label/state pattern converts to dot-leader (shape check)', () => {
    const node = {
      kind: 'frame',
      top: '┌──────────────┐',
      inner: [
        '│ a ........ ok    │',
        '│ b ........ wait  │',
        '│ c ........ wip   │',
        '│ d ........ done  │',
        '│ e ........ done  │',
      ],
      bottom: '└──────────────┘',
      indent: '',
    };
    const out = autofixFrameToDotLeader(node);
    const lines = out.split('\n');
    assert.equal(lines.length, 5, '5 output rows');
    for (const ln of lines) {
      // No frame chars
      assert.doesNotMatch(ln, /[│┌┐└┘]/, `row "${ln}" must have no frame chars`);
      // Dot-leader shape: label + spaces + dots(>=3) + spaces + state
      assert.match(ln, / \.{3,} /, `row "${ln}" must be dot-leader`);
    }
    // Column alignment: every row has same dot-count
    const dotCounts = lines.map(ln => (ln.match(/\.+/) || [''])[0].length);
    assert.equal(new Set(dotCounts).size, 1, `dot-counts must be equal: ${dotCounts.join(',')}`);
    // Content preserved
    assert.ok(out.includes('ok'));
    assert.ok(out.includes('wait'));
    assert.ok(out.includes('done'));
  });

  it('preserves Unicode markers (✓, ✗, ←)', () => {
    const node = {
      kind: 'frame',
      top: '┌──────────────────┐',
      inner: [
        '│ a ........ ✓ done  │',
        '│ b ........ ✗ fail  │',
        '│ c ........ ← готов │',
      ],
      bottom: '└──────────────────┘',
      indent: '',
    };
    const out = autofixFrameToDotLeader(node);
    assert.ok(out.includes('✓ done'), `expected '✓ done' in: ${out}`);
    assert.ok(out.includes('✗ fail'), `expected '✗ fail' in: ${out}`);
    assert.ok(out.includes('← готов'), `expected '← готов' in: ${out}`);
  });

  it('non-pattern prose emits bullets', () => {
    const node = {
      kind: 'frame',
      top: '┌──────────────────┐',
      inner: [
        '│ free-form note   │',
        '│ another sentence │',
      ],
      bottom: '└──────────────────┘',
      indent: '',
    };
    const out = autofixFrameToDotLeader(node);
    const lines = out.split('\n');
    assert.match(lines[0]!, /^\s*-\s+/);
    assert.match(lines[1]!, /^\s*-\s+/);
  });

  it('preserves indentation', () => {
    const node = {
      kind: 'frame',
      top: '    ┌──────────┐',
      inner: [
        '    │ a ... ok   │',
        '    │ b ... wait │',
      ],
      bottom: '    └──────────┘',
      indent: '    ',
    };
    const out = autofixFrameToDotLeader(node);
    const lines = out.split('\n');
    assert.ok(lines[0]!.startsWith('    '), 'indentation preserved on row 1');
    assert.ok(lines[1]!.startsWith('    '), 'indentation preserved on row 2');
  });

  it('idempotency: autofix(autofix(x), CLI opts) is no-op on second pass', () => {
    const input = '┌────────────┐\n│ a ... ok   │\n│ b ... wait │\n└────────────┘';
    const opts = { processFenced: true, convertL11: true };
    const once = autofix(input, opts);
    const twice = autofix(once, opts);
    assert.equal(twice, once, 'second pass must be no-op');
  });

  it('frame with ≥6 inner lines NOT converted (still autofixFrame alignment-only)', () => {
    const input = '┌──────────┐\n│ a       │\n│ b       │\n│ c       │\n│ d       │\n│ e       │\n│ f       │\n└──────────┘';
    const out = autofix(input, { processFenced: true, convertL11: true });
    assert.ok(out.includes('┌'), 'frame top corner preserved');
    assert.ok(out.includes('└'), 'frame bottom corner preserved');
  });

  it('frame containing tree NOT converted (whitelist fall-through)', () => {
    const input = '┌──────────────┐\n│ root         │\n│ ├── child    │\n│ ├── leaf     │\n└──────────────┘';
    const out = autofix(input, { processFenced: true, convertL11: true });
    assert.ok(out.includes('┌'), 'tree-frame top corner preserved');
    assert.ok(out.includes('├──'), 'tree chars preserved');
  });

  it('frame containing embedded table column NOT converted', () => {
    const input = '┌────────────────────────┐\n│ phase │ owner  │ state │\n│ alpha │ tom    │ done  │\n│ beta  │ jules  │ wip   │\n└────────────────────────┘';
    const out = autofix(input, { processFenced: true, convertL11: true });
    assert.ok(out.includes('┌'), 'table-frame preserved');
  });

  it('default autofix() WITHOUT opts still skips fenced content (Phase 8.5 contract)', () => {
    const fenced = '```\n┌────────────┐\n│ a ... ok   │\n│ b ... wait │\n└────────────┘\n```';
    const out = autofix(fenced);
    assert.equal(out, fenced, 'default autofix must NOT touch fenced content');
  });

  it('default autofix() does NOT convert L11 frames (Phase 8.5 alignment-only)', () => {
    // Frame OUTSIDE fences, ≤5 lines. Default autofix must align, not convert.
    const input = '┌──────┐\n│ a ok │\n│ b wait │\n└──────┘';
    const out = autofix(input);
    assert.ok(out.includes('┌'), 'frame must be preserved without convertL11 opt');
  });

  it('CLI opts (processFenced + convertL11) processes fenced content AND converts L11', () => {
    const fenced = '```\n┌────────────┐\n│ a ... ok   │\n│ b ... wait │\n└────────────┘\n```';
    const out = autofix(fenced, { processFenced: true, convertL11: true });
    assert.notEqual(out, fenced, 'CLI opts must transform fenced frame');
    // Frame chars in the body must be gone (fence lines ``` remain).
    const body = out.split('\n').filter((l: string) => !/^\s*```/.test(l)).join('\n');
    assert.doesNotMatch(body, /[┌┐└┘]/, 'frame corners removed from body');
  });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Shared fixture directory for Pattern D/A/B/C tests
// ---------------------------------------------------------------------------
const fixturesDir = path.resolve(import.meta.dirname, 'fixtures', 'autofix');

// ---------------------------------------------------------------------------
// Pattern D — titled top frame (`┌─ Title ─┐`)
// ---------------------------------------------------------------------------
describe('Pattern D — titled top frame', () => {

  it('autofixFrame: preserves title and expands width to widest inner line', () => {
    const node = frameNode(
      '┌─ Status ─┐',
      ['│ ok       │', '│ long content here │'],
      '└──────────┘'
    );
    const out = autofixFrame(node);
    const lines = out.split('\n');
    // Title preserved in top bar.
    assert.match(lines[0]!, /^┌─ Status /);
    assert.ok(lines[0]!.endsWith('┐'), `top must end with ┐: ${lines[0]}`);
    // All lines same width.
    const w = [...lines[0]!].length;
    for (const l of lines) assert.equal([...l].length, w, `misaligned: ${l}`);
    // Wider inner content forces expansion.
    assert.ok(w > '┌─ Status ─┐'.length, 'frame must expand to fit content');
  });

  it('autofixFrame: plain frame (no title) still works correctly', () => {
    const node = frameNode(
      '┌──────────┐',
      ['│ short  │', '│ wider content │'],
      '└──────────┘'
    );
    const out = autofixFrame(node);
    const lines = out.split('\n');
    assert.match(lines[0]!, /^┌─+┐$/);
    const w = [...lines[0]!].length;
    for (const l of lines) assert.equal([...l].length, w);
  });

  it('autofixFrame: titled frame is idempotent', () => {
    // After fix, apply again — must produce the same output.
    const node = frameNode(
      '┌─ Status ─┐',
      ['│ ok       │', '│ long content here │'],
      '└──────────┘'
    );
    const once = autofixFrame(node);
    const onceLines = once.split('\n');
    const node2 = frameNode(onceLines[0]!, onceLines.slice(1, -1), onceLines[onceLines.length - 1]!);
    const twice = autofixFrame(node2);
    assert.equal(twice, once, 'titled frame fix must be idempotent');
  });

  it('autofix(text): repairs titled top via fixture file', () => {
    const before = fs.readFileSync(path.join(fixturesDir, 'titled-frame-before.md'), 'utf8').trim();
    const expected = fs.readFileSync(path.join(fixturesDir, 'titled-frame-after.md'), 'utf8').trim();
    const actual = autofix(before).trim();
    assert.equal(actual, expected, `titled frame autofix mismatch\nactual:\n${actual}\nexpected:\n${expected}`);
  });

  it('autofix(text): titled frame idempotency via fixture', () => {
    const after = fs.readFileSync(path.join(fixturesDir, 'titled-frame-after.md'), 'utf8').trim();
    const twice = autofix(after).trim();
    assert.equal(twice, after, 'already-fixed titled frame must be a no-op');
  });

  it('autofix(text): top bar regex catches titled tops inside full document', () => {
    const doc = [
      '# heading',
      '',
      '┌─ Gate ─┐',
      '│ tests pass │',
      '│ lint clean  │',
      '└─────────┘',
      '',
      'prose after',
    ].join('\n');
    const out = autofix(doc);
    // Title preserved.
    assert.match(out, /┌─ Gate /);
    // Prose untouched.
    assert.match(out, /^# heading$/m);
    assert.match(out, /^prose after$/m);
    // All frame lines same width.
    const frameLines = out.split('\n').filter(l => /[┌│└]/.test(l));
    const w = [...frameLines[0]!].length;
    for (const l of frameLines) assert.equal([...l].length, w, `misaligned frame line: ${l}`);
  });
});

// ---------------------------------------------------------------------------
// Pattern A — arrow column alignment (`→` / `-->` / `──>`)
// ---------------------------------------------------------------------------
describe('Pattern A — arrow column alignment', () => {
  it('aligns arrows in a 3-line group', () => {
    const before = [
      'service A → db',
      'service BB → cache',
      'service CCC → queue',
    ].join('\n');
    const after = [
      'service A   → db',
      'service BB  → cache',
      'service CCC → queue',
    ].join('\n');
    assert.equal(autofix(before), after);
  });

  it('does not touch a single-line arrow (no group)', () => {
    const s = 'service A → db';
    assert.equal(autofix(s), s);
  });

  it('does not touch arrows more than ±3 cols apart', () => {
    const s = [
      'a → x',
      'very long label here → y',
    ].join('\n');
    assert.equal(autofix(s), s);
  });

  it('does not touch arrows inside frame inner lines', () => {
    const s = [
      '┌─────────────────────────┐',
      '│ service A → db          │',
      '│ service BB → cache      │',
      '│ service CCC → queue     │',
      '└─────────────────────────┘',
    ].join('\n');
    // autofix runs frame alignment pass first, arrow pass skips frame lines
    const result = autofix(s);
    assert.ok(!result.includes('service A  '), 'should not double-pad inside frame');
  });

  it('uses before/after fixtures', () => {
    const before = fs.readFileSync(path.join(fixturesDir, 'arrow-basic-before.md'), 'utf8').trimEnd();
    const after  = fs.readFileSync(path.join(fixturesDir, 'arrow-basic-after.md'),  'utf8').trimEnd();
    assert.equal(autofix(before), after);
  });

  it('is idempotent — double pass equals single pass', () => {
    const before = fs.readFileSync(path.join(fixturesDir, 'arrow-basic-before.md'), 'utf8').trimEnd();
    const once   = autofix(before);
    const twice  = autofix(once);
    assert.equal(twice, once, 'second autofix pass should be a no-op');
  });
});

// ---------------------------------------------------------------------------
// autofix end-to-end via lint-cases.json fixtures (shape-based)
// ---------------------------------------------------------------------------
describe('autofix end-to-end via lint-cases.json fixtures (shape-based)', () => {
  const fixtures = cases.filter(c => c.expected_after_autofix_shape !== undefined);

  it('has ≥4 fixtures with expected_after_autofix_shape', () => {
    assert.ok(fixtures.length >= 4, `expected ≥4 shape fixtures, got ${fixtures.length}`);
  });

  for (const fx of fixtures) {
    it(`autofix shape matches: ${fx.name}`, () => {
      // CLI-context autofix: process fenced + convert L11.
      const out = autofix(fx.input, { processFenced: true, convertL11: true });
      const shape = fx.expected_after_autofix_shape!;

      if (shape.no_frame_chars) {
        // The fence ``` lines may remain in output — that's fine. Only frame
        // corners + outer pipes must be gone from any non-fence line.
        const nonFence = out.split('\n').filter((l: string) => !/^\s*```/.test(l)).join('\n');
        assert.doesNotMatch(nonFence, /[┌┐└┘│]/,
          `frame chars must be removed in "${fx.name}":\n${out}`);
      }

      // Extract the diagram body (strip surrounding ``` lines for row-count).
      const body = out.split('\n')
        .filter((l: string) => !/^\s*```/.test(l))
        .filter((l: string) => l.length > 0);

      if (typeof shape.row_count === 'number') {
        assert.equal(body.length, shape.row_count,
          `expected ${shape.row_count} rows, got ${body.length} in "${fx.name}":\n${out}`);
      }

      if (shape.mode === 'dot_leader') {
        for (const ln of body) {
          assert.match(ln, / \.{3,} /, `row "${ln}" must be dot-leader shape in "${fx.name}"`);
        }
        if (shape.aligned_dots) {
          const dotCounts = body.map((ln: string) => (ln.match(/\.+/) || [''])[0].length);
          assert.equal(new Set(dotCounts).size, 1,
            `dot-counts must align in "${fx.name}": got ${dotCounts.join(',')}\n${out}`);
        }
      } else if (shape.mode === 'bullet') {
        for (const ln of body) {
          assert.match(ln, /^\s*-\s+\S/, `row "${ln}" must be bullet in "${fx.name}"`);
        }
      } else if (shape.mode === 'no_change') {
        assert.equal(out, fx.input, `no_change mode: output must equal input for "${fx.name}"`);
      }

      for (const token of (shape.preserves || [])) {
        assert.ok(out.includes(token),
          `expected to preserve "${token}" in output of "${fx.name}":\n${out}`);
      }
    });

    it(`autofix is idempotent: ${fx.name}`, () => {
      const opts = { processFenced: true, convertL11: true };
      const once = autofix(fx.input, opts);
      const twice = autofix(once, opts);
      assert.equal(twice, once, `second pass must be no-op for "${fx.name}"`);
    });
  }
});

// ---------------------------------------------------------------------------
// feynman-lint --fix CLI for L11 dot-leader conversion (smoke)
// ---------------------------------------------------------------------------
describe('feynman-lint --fix CLI for L11 dot-leader conversion', () => {
  it('--fix converts L11-eligible frame in file in place', () => {
    const tmp = path.join(os.tmpdir(), `feynman-l11-${process.pid}.md`);
    const input = '# title\n\n```\n┌────────────┐\n│ a ... ok   │\n│ b ... wait │\n└────────────┘\n```\n';
    fs.writeFileSync(tmp, input);
    try {
      const result = spawnSync(process.execPath, [
        path.resolve(import.meta.dirname, '..', 'bin', 'feynman-lint.ts'),
        '--fix',
        tmp,
      ], { encoding: 'utf8' });
      assert.equal(result.status, 0,
        `expected exit 0, got ${result.status}; stderr: ${result.stderr}`);
      const after = fs.readFileSync(tmp, 'utf8');
      assert.notEqual(after, input, 'file must have been modified');
      assert.ok(!after.includes('┌'), 'frame must be removed by L11 dot-leader autofix');
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  });
});
