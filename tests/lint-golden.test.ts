import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { lint } from '../lib/lint/index.ts';
import { L02_tree_chars, L08_frame_width, L11_overdecoration } from '../lib/lint/rules.ts';
import cases from './lint-cases.json' with { type: 'json' };

describe('ordered lint diagnostics', () => {
  // Group inputs by their named rule. Each expected list keeps diagnostics from *all* rules.
  for (const [family, rules] of Object.entries({
    flow: ['L02', 'L03', 'L04', 'L05', 'L06', 'L07'],
    'frame-geometry': ['L08', 'L09'],
    'frame-economy': ['L11', 'L12', 'L13', 'L15'],
    'other-rules': ['L01', 'L10', 'L14', 'none', 'all'],
  })) {
    it(family, () => {
      const fixture = new URL(`./fixtures/r04/${family}.json`, import.meta.url);
      const expected: unknown = JSON.parse(readFileSync(fixture, 'utf8'));
      const actual = Object.fromEntries(
        cases
          .filter(({ rule }) => rules.includes(rule))
          .map(({ name, input }) => [name, lint(input).issues]),
      );
      assert.deepEqual(actual, expected);
    });
  }

  it('accepts a frozen diagram node in flow, frame geometry and frame economy rules', () => {
    const node = Object.freeze({
      type: 'diagram',
      content: 'root\n├── leaf\n\n┌────┐\n│ x│\n└────┘',
      startLine: 10,
      endLine: 15,
      indent: 0,
    });
    const issues = [...L02_tree_chars(node), ...L08_frame_width(node), ...L11_overdecoration(node)];
    assert.deepEqual(
      issues.map(({ rule, line }) => [rule, line]),
      [
        ['L02', 11],
        ['L08', 14],
        ['L11', 13],
      ],
    );
  });
});
