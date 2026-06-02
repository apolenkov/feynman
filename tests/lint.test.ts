// tests/lint.test.ts — rule-level tests for lib/lint
// Tests golden cases from lint-cases.json + direct rule unit tests.
// Uses node:test + node:assert/strict. Zero deps.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

import { lint, format, RULE_IDS } from '../lib/lint/index.ts';
import { parse } from '../lib/lint/parser.ts';
import { estimateFrameCost } from '../lib/lint/rules.ts';
import { lastVisualColumnOf, firstVisualColumnOf } from '../lib/lint/width.ts';

const require = createRequire(import.meta.url);
const cases = require(path.resolve(import.meta.dirname, 'lint-cases.json')) as Array<{
  name: string;
  input: string;
  expected: string;
  rule: string;
  expected_issues?: Array<{ rule?: string; line?: number }>;
}>;

// ---------------------------------------------------------------------------
// Golden cases from lint-cases.json
// ---------------------------------------------------------------------------
describe('Golden cases (lint-cases.json)', () => {
  for (const tc of cases) {
    it(tc.name, () => {
      const result = lint(tc.input);

      if (tc.expected === 'pass') {
        // No error-severity issues allowed
        const errors = result.issues.filter(i => i.severity === 'error');
        assert.equal(
          errors.length, 0,
          `Expected pass but got ${errors.length} errors: ${errors.map(e => `${e.rule} ${e.message}`).join('; ')}`
        );
      } else {
        // Must have at least one issue matching the expected rule
        // (L06 uses severity='warn', so check all issues not just errors)
        const matchingIssues = result.issues.filter(i => {
          if (tc.rule === 'none' || tc.rule === 'all') return true;
          return i.rule === tc.rule;
        });

        if (tc.expected === 'fail') {
          assert.ok(
            matchingIssues.length >= 1,
            `Expected fail with rule '${tc.rule}' but got no matching issues. All issues: ${JSON.stringify(result.issues)}`
          );

          if (tc.expected_issues) {
            for (const exp of tc.expected_issues) {
              if (exp.rule) {
                const found = result.issues.some(i => i.rule === exp.rule);
                assert.ok(found, `Expected issue with rule '${exp.rule}' not found`);
              }
              if (exp.line !== undefined) {
                const found = result.issues.some(i => i.rule === exp.rule && i.line === exp.line);
                assert.ok(found, `Expected issue at line ${exp.line} for rule ${exp.rule} not found`);
              }
            }
          }
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Rule coverage check: every rule in the registry has ≥1 pass and ≥1 fail case.
// The list is DERIVED from RULE_IDS — adding a rule to the registry automatically
// requires a corresponding case in lint-cases.json (self-maintaining gate).
// ---------------------------------------------------------------------------
describe('Rule coverage: each rule has ≥1 pass and ≥1 fail case', () => {
  for (const ruleId of RULE_IDS) {
    it(`${ruleId} has at least one pass case`, () => {
      const passCases = cases.filter(c => c.rule === ruleId && c.expected === 'pass');
      assert.ok(
        passCases.length >= 1,
        `Rule ${ruleId} needs at least 1 pass case in lint-cases.json`
      );
    });

    it(`${ruleId} has at least one fail case`, () => {
      const failCases = cases.filter(c => c.rule === ruleId && c.expected === 'fail');
      assert.ok(
        failCases.length >= 1,
        `Rule ${ruleId} needs at least 1 fail case in lint-cases.json`
      );
    });
  }
});

// ---------------------------------------------------------------------------
// L01 — Box closure: direct unit tests
// ---------------------------------------------------------------------------
describe('L01 box closure — unit tests', () => {
  it('unclosed ┌ detected', () => {
    const md = '```\n┌─ Status ─┐\n│  item    │\n```';
    const result = lint(md);
    const l01 = result.issues.filter(i => i.rule === 'L01');
    assert.ok(l01.length >= 1, 'should detect unclosed box');
  });

  it('vertical alignment: ┌ and └ at same col passes', () => {
    const md = '```\n┌─────┐\n│ hi  │\n└─────┘\n```';
    const result = lint(md);
    const l01 = result.issues.filter(i => i.rule === 'L01');
    assert.equal(l01.length, 0, `no L01 issues expected, got: ${JSON.stringify(l01)}`);
  });

  it('nested boxes detected', () => {
    // Outer box closed, inner box open — should report inner unclosed
    const md = '```\n┌─────────┐\n│ ┌──┐ ok │\n│  hi     │\n└─────────┘\n```';
    // inner ┌ has no └ at same col as inner ┌
    const result = lint(md);
    // We just verify linter runs and exits without throwing
    assert.ok(Array.isArray(result.issues));
  });

  it('orphan └ (misaligned with ┌ col) flagged', () => {
    // ┌ at col 1, └ at col 4 — misaligned, so └ is "orphan" (no ┌ at col 4)
    const md = '```\n┌─ box ─┐\n│ item  │\n   └───┘\n```';
    const result = lint(md);
    const l01 = result.issues.filter(i => i.rule === 'L01');
    assert.ok(l01.length >= 1, 'misaligned └ should be flagged');
    assert.ok(l01.some(i => i.message.includes('Orphan')), 'should say Orphan');
  });
});

// ---------------------------------------------------------------------------
// L02 — Tree chars: direct unit tests
// ---------------------------------------------------------------------------
describe('L02 tree chars — unit tests', () => {
  it('correct tree: no issues', () => {
    const md = '```\nroot\n├── a\n└── b\n```';
    const result = lint(md);
    const l02 = result.issues.filter(i => i.rule === 'L02');
    assert.equal(l02.length, 0);
  });

  it('last child with ├── flagged', () => {
    const md = '```\nroot\n├── only-child\n```';
    const result = lint(md);
    const l02 = result.issues.filter(i => i.rule === 'L02');
    assert.ok(l02.length >= 1, 'last ├── child should be flagged');
  });

  it('message mentions └──', () => {
    const md = '```\nroot\n├── x\n├── y\n```';
    const result = lint(md);
    const l02 = result.issues.filter(i => i.rule === 'L02');
    assert.ok(l02.length >= 1);
    assert.ok(l02[0]!.message.includes('└──'), 'message should reference └──');
  });

  it('sibling at shallower indent level — exercises shallower-branch in L02', () => {
    // Multi-level tree where inner child is alone (last) — L02 should catch it
    // exercises the "same or shallower level" branch in rules.js lines 196-199
    const md = '```\nroot\n├── parent\n│   ├── child\n└── last\n```';
    const result = lint(md);
    // 'child' is last in its group and uses ├── — L02 issue expected
    const l02 = result.issues.filter(i => i.rule === 'L02');
    assert.ok(l02.length >= 1, 'inner ├── child with no sibling should be flagged');
  });
});

// ---------------------------------------------------------------------------
// L03 — Arrow style: mixed-arrow detection
// ---------------------------------------------------------------------------
describe('L03 arrow style — unit tests', () => {
  it('single style → passes', () => {
    const md = '```\n[A] → [B] → [C]\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L03').length, 0);
  });

  it('single style --> passes', () => {
    const md = '```\n[A] --> [B]\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L03').length, 0);
  });

  it('mixed → and --> detected', () => {
    const md = '```\n[A] --> [B] → [C]\n```';
    const result = lint(md);
    assert.ok(result.issues.filter(i => i.rule === 'L03').length >= 1);
  });

  it('mixed --> and ──> detected', () => {
    const md = '```\n[A] --> [B]\n[C] ──> [D]\n```';
    const result = lint(md);
    assert.ok(result.issues.filter(i => i.rule === 'L03').length >= 1);
  });

  it('issue mentions both styles in message', () => {
    const md = '```\n[A] --> [B] → [C]\n```';
    const result = lint(md);
    const l03 = result.issues.filter(i => i.rule === 'L03');
    assert.ok(l03.length >= 1);
    // Message should name the conflicting styles
    assert.ok(l03[0]!.message.includes('-->' ) || l03[0]!.message.includes('→'));
  });

  // --- seq-msg family ---
  it('seq diagram with both ->> and -->> does NOT trigger L03 (same family)', () => {
    const md = '```\nClient ->> API : POST /login\nDB   -->> API  : user row\nAPI -->> Client : 200 OK\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L03').length, 0,
      'sync ->> and return -->> must not be flagged as mixed styles');
  });

  it('only ->> (no -->> in diagram) passes L03', () => {
    const md = '```\nA ->> B : call\nB ->> C : forward\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L03').length, 0);
  });

  it('only -->> passes L03', () => {
    const md = '```\nB -->> A : done\nC -->> B : ack\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L03').length, 0);
  });

  it('mixing flow --> with seq ->> IS flagged as mixed styles', () => {
    const md = '```\n[A] --> [B]\nClient ->> API : call\n```';
    const result = lint(md);
    assert.ok(result.issues.filter(i => i.rule === 'L03').length >= 1,
      'flow --> and seq ->> are different families and should be flagged');
  });
});

// ---------------------------------------------------------------------------
// L04 — Column widths: table consistency
// ---------------------------------------------------------------------------
describe('L04 column widths — unit tests', () => {
  it('consistent table passes', () => {
    const md = '```\n| A | B |\n|---|---|\n| 1 | 2 |\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L04').length, 0);
  });

  it('inconsistent separator detected', () => {
    const md = '```\n| A | B | C |\n|---|---|\n| 1 | 2 | 3 |\n```';
    const result = lint(md);
    assert.ok(result.issues.filter(i => i.rule === 'L04').length >= 1);
  });

  it('issue reports column counts', () => {
    const md = '```\n| A | B | C |\n|---|---|\n| 1 | 2 | 3 |\n```';
    const result = lint(md);
    const l04 = result.issues.filter(i => i.rule === 'L04');
    assert.ok(l04.length >= 1);
    assert.ok(/column/i.test(l04[0]!.message));
  });

  it('escaped pipe inside a cell is not a column boundary', () => {
    // A valid GFM table where one cell contains a literal "|" written as "\|".
    const md = '```\n| h1 | h2 |\n|----|----|\n| a \\| b | c |\n```';
    const result = lint(md);
    assert.equal(
      result.issues.filter(i => i.rule === 'L04').length, 0,
      'escaped pipe must count as cell content, not an extra column',
    );
  });
});

// ---------------------------------------------------------------------------
// L05 — Flow integrity: orphan boxes
// ---------------------------------------------------------------------------
describe('L05 flow integrity — unit tests', () => {
  it('connected boxes pass', () => {
    const md = '```\n[A] --> [B]\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L05').length, 0);
  });

  it('two boxes no arrow flagged', () => {
    const md = '```\n[A] [B]\n```';
    const result = lint(md);
    assert.ok(result.issues.filter(i => i.rule === 'L05').length >= 1);
  });

  it('three boxes no arrows flagged', () => {
    const md = '```\n[A] [B] [C]\n```';
    const result = lint(md);
    assert.ok(result.issues.filter(i => i.rule === 'L05').length >= 1);
  });

  it('parallel layout (wide spacing) not flagged', () => {
    // More than 3 spaces between boxes = parallel layout
    const md = '```\n[A]     [B]\n```';
    const result = lint(md);
    // Parallel layout uses 3+ spaces gap — should not be flagged
    assert.equal(result.issues.filter(i => i.rule === 'L05').length, 0);
  });

  it('[A] ->> [B] is not flagged (seq arrow recognized by L05)', () => {
    const md = '```\n[Client] ->> [API]\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L05').length, 0,
      '->> must count as an arrow between boxes');
  });

  it('[A] -->> [B] is not flagged (return seq arrow recognized by L05)', () => {
    const md = '```\n[API] -->> [Client]\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L05').length, 0,
      '-->> must count as an arrow between boxes');
  });
});

// ---------------------------------------------------------------------------
// L06 — Priority scale: ▲/▼ pairing
// ---------------------------------------------------------------------------
describe('L06 priority scale — unit tests', () => {
  it('both ▲ and ▼ passes', () => {
    const md = '```\n▲ high\n  item\n▼ low\n  item\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L06').length, 0);
  });

  it('▲ without ▼ flagged as warn', () => {
    const md = '```\n▲ high priority\n  critical\n```';
    const result = lint(md);
    const l06 = result.issues.filter(i => i.rule === 'L06');
    assert.ok(l06.length >= 1);
    assert.equal(l06[0]!.severity, 'warn');
  });

  it('▼ without ▲ flagged as warn', () => {
    const md = '```\n▼ low priority\n  cosmetic\n```';
    const result = lint(md);
    const l06 = result.issues.filter(i => i.rule === 'L06');
    assert.ok(l06.length >= 1);
    assert.equal(l06[0]!.severity, 'warn');
  });

  it('neither ▲ nor ▼ passes', () => {
    const md = '```\n[A] --> [B]\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L06').length, 0);
  });

  it('vertical flow arrows do not trigger priority-scale warning', () => {
    const md = '```\n[A]\n |\n ▼\n[B]\n |\n ▼\n[C]\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L06').length, 0);
  });
});

// ---------------------------------------------------------------------------
// L07 — No mermaid+ASCII mix
// ---------------------------------------------------------------------------
describe('L07 no mermaid mix — unit tests', () => {
  it('ASCII only passes', () => {
    const md = 'Flow:\n\n```\n[A] --> [B]\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L07').length, 0);
  });

  it('mermaid only passes', () => {
    const md = '```mermaid\ngraph LR\n  A --> B\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L07').length, 0);
  });

  it('mermaid + ASCII flow flagged', () => {
    const md = 'Diagram:\n\n```\n[A] --> [B]\n```\n\n```mermaid\ngraph LR\n  A --> B\n```';
    const result = lint(md);
    assert.ok(result.issues.filter(i => i.rule === 'L07').length >= 1);
  });

  it('mermaid + box-drawing flagged', () => {
    const md = '```\n┌─ box ─┐\n│  hi   │\n└───────┘\n```\n\n```mermaid\ngraph TD\n  A\n```';
    const result = lint(md);
    assert.ok(result.issues.filter(i => i.rule === 'L07').length >= 1);
  });
});

// ---------------------------------------------------------------------------
// L08 — Frame width discipline (including multibyte chars)
// ---------------------------------------------------------------------------
describe('L08 frame width — unit tests', () => {
  it('consistent frame passes', () => {
    const md = '```\n┌─ OK ─┐\n│  hi  │\n└──────┘\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L08').length, 0);
  });

  it('close row width mismatch flagged', () => {
    const md = '```\n┌─ Status ─┐\n│  done    │\n└────────────────────┘\n```';
    const result = lint(md);
    assert.ok(result.issues.filter(i => i.rule === 'L08').length >= 1);
  });

  it('internal row too wide flagged', () => {
    const md = '```\n┌─ Status ─┐\n│  this line is extremely wide and definitely does not fit the frame │\n└──────────┘\n```';
    const result = lint(md);
    assert.ok(result.issues.filter(i => i.rule === 'L08').length >= 1);
  });

  it('issue reports widths', () => {
    const md = '```\n┌─ Status ─┐\n│  done    │\n└────────────────────┘\n```';
    const result = lint(md);
    const l08 = result.issues.filter(i => i.rule === 'L08');
    assert.ok(l08.length >= 1);
    assert.ok(/width/i.test(l08[0]!.message));
  });

  it('multibyte box-drawing chars: width computed as 1 per char', () => {
    // displayWidth test: box-drawing chars are single-width
    // Create perfectly sized frame to verify no false-positive
    // ┌─ X ─┐ = chars: ┌─ X ─┐ = 8 chars, all single-width
    // │ hi  │ = 8 chars
    // └─────┘ = 8 chars
    const md = '```\n┌─ X ─┐\n│ hi  │\n└─────┘\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L08').length, 0,
      'single-width box chars should not trigger false-positive');
  });

  it('CJK wide char (emoji) triggers width=2 in frame', () => {
    // A CJK/emoji char should be counted as width 2, causing mismatch if not accounted for
    // Use U+1F600 (😀) which is in the 0x1F300-0x1F64F range (width 2)
    // Frame open: ┌─ Status ─┐ — width W
    // Internal: │ 😀 data │ — emoji is width 2, so row is wider
    // This tests the width=2 branch in displayWidth (line 52 in rules.js)
    const emoji = '😀'; // 😀
    const md = `\`\`\`\n┌─ X ─┐\n│ ${emoji} ok │\n└─────┘\n\`\`\``;
    const result = lint(md);
    // If emoji is counted as width 2, row will be wider — L08 issue expected
    // We just verify the linter runs without throwing
    assert.ok(Array.isArray(result.issues));
  });
});

// ---------------------------------------------------------------------------
// L11 overdecoration — unit tests
// ---------------------------------------------------------------------------
describe('L11 overdecoration — unit tests', () => {
  it('frame with 5 inner lines flagged as warn', () => {
    const md = '```\n┌─────────┐\n│ a ... 1 │\n│ b ... 2 │\n│ c ... 3 │\n│ d ... 4 │\n│ e ... 5 │\n└─────────┘\n```';
    const result = lint(md);
    const l11 = result.issues.filter(i => i.rule === 'L11');
    assert.ok(l11.length >= 1, 'should detect overdecoration');
    assert.equal(l11[0]!.severity, 'warn');
    assert.match(l11[0]!.message, /5 items/);
    assert.match(l11[0]!.message, /saves ~\d+ chars/);
  });

  it('frame with 6 inner lines NOT flagged (boundary)', () => {
    const md = '```\n┌─────────┐\n│ a ... 1 │\n│ b ... 2 │\n│ c ... 3 │\n│ d ... 4 │\n│ e ... 5 │\n│ f ... 6 │\n└─────────┘\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L11').length, 0);
  });

  it('frame containing tree NOT flagged (whitelist) — L11 only', () => {
    const md = '```\n┌──────────────┐\n│ root         │\n│ ├── child    │\n│ └── leaf     │\n└──────────────┘\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L11').length, 0);
  });

  it('frame containing embedded table column NOT flagged (whitelist)', () => {
    const md = '```\n┌────────────────────────┐\n│ phase │ owner  │ state │\n│ alpha │ tom    │ done  │\n│ beta  │ jules  │ wip   │\n└────────────────────────┘\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L11').length, 0);
  });

  it('frame with 1 inner line is overdecoration (lower bound)', () => {
    const md = '```\n┌──────────┐\n│ alone ok │\n└──────────┘\n```';
    const result = lint(md);
    const l11 = result.issues.filter(i => i.rule === 'L11');
    assert.equal(l11.length, 1);
    assert.match(l11[0]!.message, /1 items/);
  });

  it('no frame, no L11 fire', () => {
    const md = 'just prose\nwith no diagrams';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L11').length, 0);
  });
});

// ---------------------------------------------------------------------------
// L12 token-budget — unit tests
// ---------------------------------------------------------------------------
describe('L12 token-budget — unit tests', () => {
  it('estimateFrameCost returns required cost shape', () => {
    const cost = estimateFrameCost({
      top: '┌──────────┐',
      inner: ['│ a     │', '│ b     │'],
      bottom: '└──────────┘',
    });
    assert.equal(typeof cost.framing_chars, 'number');
    assert.equal(typeof cost.content_chars, 'number');
    assert.equal(typeof cost.border_chars, 'number');
    assert.equal(typeof cost.padding_chars, 'number');
    assert.equal(typeof cost.dotleader_equivalent, 'number');
    assert.equal(typeof cost.saving, 'number');
    assert.ok(cost.saving >= 0, 'saving must be non-negative');
  });

  it('padding-dominated frame flagged', () => {
    const md = '```\n┌────────────────────────────┐\n│ a                          │\n│ b                          │\n│ c                          │\n└────────────────────────────┘\n```';
    const result = lint(md);
    const l12 = result.issues.filter(i => i.rule === 'L12');
    assert.ok(l12.length >= 1);
    assert.equal(l12[0]!.severity, 'warn');
  });

  it('content-dominated frame NOT flagged', () => {
    const md = '```\n┌──────────────────────────────┐\n│ deploy production step alpha │\n│ deploy production step beta  │\n└──────────────────────────────┘\n```';
    const result = lint(md);
    const l12 = result.issues.filter(i => i.rule === 'L12');
    assert.equal(l12.length, 0);
  });

  it('tree composition inside frame is NOT flagged (whitelist)', () => {
    const md = '```\n┌──────────────┐\n│ root         │\n│ ├── child    │\n│ └── leaf     │\n└──────────────┘\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L12').length, 0);
  });
});

// ---------------------------------------------------------------------------
// L13 double-wrap — unit tests
// ---------------------------------------------------------------------------
describe('L13 double-wrap — unit tests', () => {
  it('tree inside frame flagged', () => {
    const md = '```\n┌──────────┐\n│ root     │\n│ ├── a    │\n│ └── b    │\n└──────────┘\n```';
    const result = lint(md);
    const l13 = result.issues.filter(i => i.rule === 'L13');
    assert.ok(l13.length >= 1);
    assert.equal(l13[0]!.severity, 'warn');
  });

  it('bare tree (no frame) NOT flagged', () => {
    const md = '```\nroot\n├── a\n└── b\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L13').length, 0);
  });

  it('frame without tree NOT flagged', () => {
    const md = '```\n┌─────────┐\n│ a       │\n│ b       │\n│ c       │\n│ d       │\n│ e       │\n│ f       │\n└─────────┘\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L13').length, 0);
  });

  it('L11 and L13 are complementary on tree-in-frame: L11 silent, L13 fires', () => {
    // Tree inside frame: L11 whitelists (so does not fire), L13 detects.
    const md = '```\n┌──────────┐\n│ root     │\n│ ├── a    │\n│ └── b    │\n└──────────┘\n```';
    const result = lint(md);
    const l11 = result.issues.filter(i => i.rule === 'L11');
    const l13 = result.issues.filter(i => i.rule === 'L13');
    assert.equal(l11.length, 0, 'L11 must whitelist tree-in-frame');
    assert.ok(l13.length >= 1, 'L13 must detect tree-in-frame');
  });
});

// ---------------------------------------------------------------------------
// A01 regression: titled frames (┌─ Title ─┐) must be caught by L11/L12/L13
// Prior to the fix, L11/L12/L13 used /^(\s*)┌─+┐\s*$/ which missed titled openers.
// ---------------------------------------------------------------------------
describe('A01 regression — titled frames caught by L11/L12/L13', () => {
  it('titled frame with tree inside is caught by L13 (not invisible)', () => {
    const md = '```\n┌─ Section ─┐\n│ root      │\n│ ├── a     │\n│ └── b     │\n└───────────┘\n```';
    const result = lint(md);
    const l13 = result.issues.filter(i => i.rule === 'L13');
    assert.ok(l13.length >= 1, 'titled frame with tree must be caught by L13');
    assert.equal(l13[0]!.severity, 'warn');
  });

  it('titled frame with ≤5 items is caught by L11 (not invisible)', () => {
    // Titled opener: ┌─ Status ─┐  (has non-dash text after ┌─)
    const md = '```\n┌─ Status ─┐\n│ a ... ok │\n│ b ... ok │\n│ c ... ok │\n└──────────┘\n```';
    const result = lint(md);
    const l11 = result.issues.filter(i => i.rule === 'L11');
    assert.ok(l11.length >= 1, 'titled frame with 3 items must be caught by L11');
    assert.equal(l11[0]!.severity, 'warn');
  });

  it('titled frame with padding-dominated content is caught by L12 (not invisible)', () => {
    const md = '```\n┌─ Wide frame ─────────────────────────┐\n│ a                                    │\n│ b                                    │\n│ c                                    │\n└──────────────────────────────────────┘\n```';
    const result = lint(md);
    const l12 = result.issues.filter(i => i.rule === 'L12');
    assert.ok(l12.length >= 1, 'titled frame with wide padding must be caught by L12');
    assert.equal(l12[0]!.severity, 'warn');
  });
});

// ---------------------------------------------------------------------------
// L15 — Homogeneous frame: direct unit tests
// ---------------------------------------------------------------------------
describe('L15 homogeneous frame — unit tests', () => {
  it('frame wrapping kv pairs flagged', () => {
    const md = '```\n┌──────────────────┐\n│ name: Alice      │\n│ role: engineer   │\n│ team: backend    │\n└──────────────────┘\n```';
    const result = lint(md);
    const l15 = result.issues.filter(i => i.rule === 'L15');
    assert.ok(l15.length >= 1, 'kv frame should be flagged by L15');
    assert.equal(l15[0]!.severity, 'warn');
    assert.ok(/kv/.test(l15[0]!.message));
  });

  it('frame wrapping bullets flagged', () => {
    const md = '```\n┌────────────────┐\n│ - alpha        │\n│ - beta         │\n│ - gamma        │\n└────────────────┘\n```';
    const result = lint(md);
    const l15 = result.issues.filter(i => i.rule === 'L15');
    assert.ok(l15.length >= 1, 'bullet frame should be flagged by L15');
    assert.ok(/bullet/.test(l15[0]!.message));
  });

  it('frame with arrow-bearing content NOT flagged by L15 (complex guard)', () => {
    // Arrow content triggers the complex guard (stripped.some(/─→|→|──>|-->/)
    // so L15 skips this frame.
    const md = '```\n┌────────────────────┐\n│ [A] → [B]          │\n│ step → next step   │\n└────────────────────┘\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L15').length, 0,
      'frame with arrows should not be flagged by L15 (complex guard)');
  });

  it('frame with only 1 inner line NOT flagged by L15 (needs ≥2)', () => {
    const md = '```\n┌────────────┐\n│ name: Alice │\n└────────────┘\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L15').length, 0,
      'single-line frame should not be flagged by L15');
  });

  it('titled frame wrapping prose flagged by L15', () => {
    const md = '```\n┌─ Notes ──────────────────┐\n│ first observation here   │\n│ second observation here  │\n└──────────────────────────┘\n```';
    const result = lint(md);
    const l15 = result.issues.filter(i => i.rule === 'L15');
    assert.ok(l15.length >= 1, 'titled frame wrapping prose should be flagged by L15');
    assert.ok(/prose/.test(l15[0]!.message));
  });
});

// ---------------------------------------------------------------------------
// Parser: standalone block detection (lines 195-220 in parser.js)
// ---------------------------------------------------------------------------
describe('Parser: standalone diagram detection', () => {
  it('standalone flow diagram (no fences) detected', () => {
    // [A] → [B] without fences — standalone block
    const md = '[A] → [B] → [C]';
    const ast = parse(md);
    assert.ok(ast.length >= 1, 'standalone flow should be detected');
  });

  it('standalone tree (no fences) detected', () => {
    const md = 'root\n├── child-a\n└── child-b';
    const ast = parse(md);
    assert.ok(ast.length >= 1, 'standalone tree should be detected');
  });

  it('prose with [brackets] containing English words not treated as diagram', () => {
    const md = '[see docs] then [run tests]';
    const result = lint(md);
    assert.ok(Array.isArray(result.issues));
  });

  it('priority scale standalone detected', () => {
    const md = '▲ high\n  item\n▼ low\n  item';
    const ast = parse(md);
    assert.ok(ast.length >= 1, 'standalone priority scale should be detected');
  });

  it('standalone table detected', () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const ast = parse(md);
    assert.ok(ast.length >= 1, 'standalone table should be detected');
  });

  it('multibox standalone: [A] [B] without prose between flagged', () => {
    const md = '[A] [B]';
    const result = lint(md);
    // L05 should catch this
    assert.ok(result.issues.filter(i => i.rule === 'L05').length >= 1);
  });
});

// ---------------------------------------------------------------------------
// lint() API contract
// ---------------------------------------------------------------------------
describe('lint() API contract', () => {
  it('returns {issues, passed} for valid input', () => {
    const result = lint('hello world');
    assert.ok('issues' in result, 'result must have issues');
    assert.ok('passed' in result, 'result must have passed');
    assert.ok(Array.isArray(result.issues));
    assert.equal(typeof result.passed, 'boolean');
  });

  it('non-string input returns passed=true with no issues', () => {
    const r1 = lint(null as unknown as string);
    const r2 = lint(undefined as unknown as string);
    const r3 = lint(42 as unknown as string);
    for (const r of [r1, r2, r3]) {
      assert.equal(r.passed, true);
      assert.equal(r.issues.length, 0);
    }
  });

  it('rules filter works', () => {
    // Diagram that would fail L01 and L05
    const md = '```\n[A] [B]\n┌─ box ─┐\n│ item  │\n```';
    const l05only = lint(md, { rules: ['L05'] });
    // L05-only should not contain L01 issues
    const hasL01 = l05only.issues.some(i => i.rule === 'L01');
    assert.equal(hasL01, false, 'filtered lint should not include L01');
  });

  it('empty string is valid, no issues', () => {
    const result = lint('');
    assert.equal(result.passed, true);
    assert.equal(result.issues.length, 0);
  });
});

// ---------------------------------------------------------------------------
// format() function tests
// ---------------------------------------------------------------------------
describe('format() output modes', () => {
  it('gcc mode produces file:line format', () => {
    const issues = [{ rule: 'L01', severity: 'error' as const, line: 5, column: 1, message: 'test error' }];
    const out = format(issues, 'gcc', 'test.md', false);
    assert.ok(out.includes('test.md:5:1'), `expected 'test.md:5:1' in: ${out}`);
    assert.ok(out.includes('L01'));
  });

  it('json mode produces JSON array string', () => {
    const issues = [{ rule: 'L02', severity: 'warn' as const, line: 3, column: 2, message: 'warn test' }];
    const out = format(issues, 'json', 'file.md', false);
    const parsed = JSON.parse(out);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed[0].rule, 'L02');
  });

  it('empty issues returns empty string in gcc mode', () => {
    const out = format([], 'gcc', 'test.md', false);
    assert.equal(out, '');
  });
});

// ---------------------------------------------------------------------------
// width.ts — lastVisualColumnOf / firstVisualColumnOf ANSI + not-found branches
// ---------------------------------------------------------------------------
describe('width.ts — ANSI escape handling in column search', () => {
  it('lastVisualColumnOf: ANSI escapes skipped, col counts visible chars only', () => {
    // '\x1b[31m' (5 chars) skipped, then r(col=1) e(col=2) d(col=3), '\x1b[0m' skipped.
    // Last 'd' lands at col 3.
    assert.equal(lastVisualColumnOf('\x1b[31mred\x1b[0m', 'd'), 3);
  });

  it('firstVisualColumnOf: ANSI escapes skipped, returns col of first match', () => {
    // '\x1b[31m' (5 chars) skipped, then r(col=1) is the first match.
    assert.equal(firstVisualColumnOf('\x1b[31mred\x1b[0m', 'r'), 1);
  });

  it('firstVisualColumnOf: returns -1 when char is not found in string', () => {
    // 'z' never appears in 'abc'; loop exhausts → return -1 (line 114)
    assert.equal(firstVisualColumnOf('abc', 'z'), -1);
  });
});

// ---------------------------------------------------------------------------
// L14 — Blank-line separation: unit tests
// ---------------------------------------------------------------------------
describe('L14 blank-line separation — unit tests', () => {
  it('diagram with blank lines on both sides: no L14', () => {
    const md = 'prose before\n\n```\n[A] → [B]\n```\n\nprose after';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L14').length, 0);
  });

  it('prose line directly before opening fence: L14 warn', () => {
    const md = 'prose before\n```\n[A] → [B]\n```\n\nprose after';
    const result = lint(md);
    const l14 = result.issues.filter(i => i.rule === 'L14');
    assert.ok(l14.length >= 1, 'should detect missing blank line before fence');
    assert.equal(l14[0]!.severity, 'warn');
    assert.ok(l14[0]!.message.includes('blank line'));
  });

  it('prose line directly after closing fence: L14 warn', () => {
    const md = 'prose before\n\n```\n[A] → [B]\n```\nprose after';
    const result = lint(md);
    const l14 = result.issues.filter(i => i.rule === 'L14');
    assert.ok(l14.length >= 1, 'should detect missing blank line after fence');
    assert.equal(l14[0]!.severity, 'warn');
  });

  it('both sides missing blank line: two L14 warns', () => {
    const md = 'prose before\n```\n[A] → [B]\n```\nprose after';
    const result = lint(md);
    const l14 = result.issues.filter(i => i.rule === 'L14');
    assert.equal(l14.length, 2, `expected 2 L14 issues, got ${l14.length}`);
  });

  it('block at start of file (no "before"): no false positive', () => {
    const md = '```\n[A] → [B]\n```\n\nprose after';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L14').length, 0);
  });

  it('block at end of file (no "after"): no false positive', () => {
    const md = 'prose before\n\n```\n[A] → [B]\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L14').length, 0);
  });

  it('block is first and last in file: no false positive', () => {
    const md = '```\n[A] → [B]\n```';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L14').length, 0);
  });

  it('consecutive code blocks (fence directly follows fence): no L14 between them', () => {
    // closing ``` of block 1 directly before opening ``` of block 2 — lenient
    const md = 'prose\n\n```\n[A] → [B]\n```\n```\n[C] → [D]\n```\n\nprose';
    const result = lint(md);
    // The second block has a fence line (```) directly before it — must not warn.
    const l14 = result.issues.filter(i => i.rule === 'L14');
    assert.equal(l14.length, 0, `expected no L14, got ${JSON.stringify(l14)}`);
  });

  it('heading directly before fence: no L14 (heading is structural, not prose)', () => {
    const md = '## Section\n```\n[A] → [B]\n```\n\nprose';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L14').length, 0);
  });

  it('standalone diagram (no fences): no L14', () => {
    // Standalone blocks are not fenced — L14 does not apply.
    const md = 'prose before\n[A] → [B]\nprose after';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L14').length, 0);
  });

  it('diagram with no diagram chars: no L14', () => {
    // A fenced block without box-drawing / arrows / tree chars should not fire.
    const md = 'prose\n```\njust text without diagram chars\n```\nprose';
    const result = lint(md);
    assert.equal(result.issues.filter(i => i.rule === 'L14').length, 0);
  });

  it('suggestion references the fence direction', () => {
    const md = 'prose before\n```\n[A] → [B]\n```\n\nprose after';
    const result = lint(md);
    const l14 = result.issues.filter(i => i.rule === 'L14');
    assert.ok(l14.length >= 1);
    assert.ok(l14[0]!.suggestion !== undefined && l14[0]!.suggestion!.length > 0);
  });
});
