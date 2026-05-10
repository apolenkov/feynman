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

// ---------------------------------------------------------------------------
// autofixFrameToDotLeader — L11 conversion (Plan 09-04 / LINT-14)
// ---------------------------------------------------------------------------
describe('autofixFrameToDotLeader — L11 conversion', () => {
  const { autofixFrameToDotLeader, autofix: autofixWithOpts } =
    require(path.resolve(__dirname, '..', 'lib', 'lint', 'autofix'));

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
    assert.match(lines[0], /^\s*-\s+/);
    assert.match(lines[1], /^\s*-\s+/);
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
    assert.ok(lines[0].startsWith('    '), 'indentation preserved on row 1');
    assert.ok(lines[1].startsWith('    '), 'indentation preserved on row 2');
  });

  it('idempotency: autofix(autofix(x), {processFenced:true}) is no-op on second pass', () => {
    const input = '┌────────────┐\n│ a ... ok   │\n│ b ... wait │\n└────────────┘';
    const once = autofixWithOpts(input);
    const twice = autofixWithOpts(once);
    assert.equal(twice, once, 'second pass must be no-op');
  });

  it('frame with ≥6 inner lines NOT converted (still autofixFrame alignment-only)', () => {
    const input = '┌──────────┐\n│ a       │\n│ b       │\n│ c       │\n│ d       │\n│ e       │\n│ f       │\n└──────────┘';
    const out = autofixWithOpts(input);
    assert.ok(out.includes('┌'), 'frame top corner preserved');
    assert.ok(out.includes('└'), 'frame bottom corner preserved');
  });

  it('frame containing tree NOT converted (whitelist fall-through)', () => {
    const input = '┌──────────────┐\n│ root         │\n│ ├── child    │\n│ ├── leaf     │\n└──────────────┘';
    const out = autofixWithOpts(input);
    assert.ok(out.includes('┌'), 'tree-frame top corner preserved');
    assert.ok(out.includes('├──'), 'tree chars preserved');
  });

  it('frame containing embedded table column NOT converted', () => {
    const input = '┌────────────────────────┐\n│ phase │ owner  │ state │\n│ alpha │ tom    │ done  │\n│ beta  │ jules  │ wip   │\n└────────────────────────┘';
    const out = autofixWithOpts(input);
    assert.ok(out.includes('┌'), 'table-frame preserved');
  });

  it('default autofix() WITHOUT opts.processFenced still skips fenced content (Phase 8.5 contract)', () => {
    const fenced = '```\n┌────────────┐\n│ a ... ok   │\n│ b ... wait │\n└────────────┘\n```';
    const out = autofix(fenced);
    assert.equal(out, fenced, 'default autofix must NOT touch fenced content');
  });

  it('autofix({processFenced:true}) processes fenced content (CLI --fix path)', () => {
    const fenced = '```\n┌────────────┐\n│ a ... ok   │\n│ b ... wait │\n└────────────┘\n```';
    const out = autofixWithOpts(fenced, { processFenced: true });
    assert.notEqual(out, fenced, 'processFenced=true must transform fenced frame');
    assert.doesNotMatch(out, /[┌┐└┘]/, 'frame corners removed');
  });
});

// ---------------------------------------------------------------------------
// autofix end-to-end via lint-cases.json fixtures (shape-based)
// ---------------------------------------------------------------------------
describe('autofix end-to-end via lint-cases.json fixtures (shape-based)', () => {
  const cases = require(path.resolve(__dirname, 'lint-cases.json'));
  const { autofix: autofixE2E } = require(path.resolve(__dirname, '..', 'lib', 'lint', 'autofix'));

  const fixtures = cases.filter(c => c.expected_after_autofix_shape !== undefined);

  it('has ≥4 fixtures with expected_after_autofix_shape', () => {
    assert.ok(fixtures.length >= 4, `expected ≥4 shape fixtures, got ${fixtures.length}`);
  });

  for (const fx of fixtures) {
    it(`autofix shape matches: ${fx.name}`, () => {
      // CLI-context autofix: process fenced content.
      const out = autofixE2E(fx.input, { processFenced: true });
      const shape = fx.expected_after_autofix_shape;

      if (shape.no_frame_chars) {
        // The fence ``` lines may remain in output — that's fine. Only frame
        // corners + outer pipes must be gone from any non-fence line.
        const nonFence = out.split('\n').filter(l => !/^\s*```/.test(l)).join('\n');
        assert.doesNotMatch(nonFence, /[┌┐└┘│]/,
          `frame chars must be removed in "${fx.name}":\n${out}`);
      }

      // Extract the diagram body (strip surrounding ``` lines for row-count).
      const body = out.split('\n')
        .filter(l => !/^\s*```/.test(l))
        .filter(l => l.length > 0);

      if (typeof shape.row_count === 'number') {
        assert.equal(body.length, shape.row_count,
          `expected ${shape.row_count} rows, got ${body.length} in "${fx.name}":\n${out}`);
      }

      if (shape.mode === 'dot_leader') {
        for (const ln of body) {
          assert.match(ln, / \.{3,} /, `row "${ln}" must be dot-leader shape in "${fx.name}"`);
        }
        if (shape.aligned_dots) {
          const dotCounts = body.map(ln => (ln.match(/\.+/) || [''])[0].length);
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
      const once = autofixE2E(fx.input, { processFenced: true });
      const twice = autofixE2E(once, { processFenced: true });
      assert.equal(twice, once, `second pass must be no-op for "${fx.name}"`);
    });
  }
});

// ---------------------------------------------------------------------------
// feynman-lint --fix CLI for L11 dot-leader conversion (smoke)
// ---------------------------------------------------------------------------
describe('feynman-lint --fix CLI for L11 dot-leader conversion', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const { spawnSync } = require('node:child_process');

  it('--fix converts L11-eligible frame in file in place', () => {
    const tmp = path.join(os.tmpdir(), `feynman-l11-${process.pid}.md`);
    const input = '# title\n\n```\n┌────────────┐\n│ a ... ok   │\n│ b ... wait │\n└────────────┘\n```\n';
    fs.writeFileSync(tmp, input);
    try {
      const result = spawnSync(process.execPath, [
        path.resolve(__dirname, '..', 'bin', 'feynman-lint.js'),
        '--fix',
        tmp,
      ]);
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
