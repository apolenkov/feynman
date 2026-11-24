import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import fc from 'fast-check';
import { autofix } from '../lib/lint/autofix.ts';
import { iterateFrames, nextFrame } from '../lib/lint/frames.ts';
import { lint } from '../lib/lint/index.ts';
import { parse } from '../lib/lint/parser.ts';
import { assertBoundedWork } from './helpers/scan-work.ts';

const properties = { seed: 20261124, numRuns: 200 };
const fenced = (content: string): string => `\`\`\`\n${content}\n\`\`\``;
const locations = (input: string, rules: readonly string[]) =>
  lint(input, { rules }).issues.map(({ rule, line, column }) => [rule, line, column]);

describe('F25 labeled connections', () => {
  it('preserves the accepted labels and L05 source locations', () => {
    const label = fc.array(fc.constantFrom('load', '\t', ' ', '-', '─', '<', '>', '→', '\u2028'), {
      maxLength: 10,
    });
    const start = fc.constantFrom('--', '<--', '----', '-', '<--- ');
    const end = fc.constantFrom('--', '-->', '---->', '-', '--> tail');
    fc.assert(
      fc.property(start, label, end, (left, parts, right) => {
        const connection = ` ${left}${parts.join('')}${right} `;
        // Keep the audited grammar as an oracle on short, shrinkable values only.
        const bare = /^\s*(?:(?:<-+>|<-+|-+>{1,2})|(?:←|↔|→|─+(?:→|>))|-{2,})\s*$/.test(connection);
        const text = /^\s*<?-{2,}\s*(.+?)\s*-{2,}>?\s*$/.exec(connection)?.[1]?.trim();
        const labeled = Boolean(text) && !/<-|->|←|↔|→|─+(?:→|>)/.test(text ?? '');
        const row = `  [A]${connection}[B]`;
        assert.deepEqual(parse(fenced(row)), [
          { type: 'diagram', content: row, startLine: 2, endLine: 3, indent: 0 },
        ]);
        assert.deepEqual(locations(fenced(row), ['L05']), bare || labeled ? [] : [['L05', 2, 3]]);
        const fixed = autofix(row);
        assert.equal(fixed, row);
        assert.equal(autofix(fixed), fixed);
      }),
      properties,
    );
  });

  function connector(size: number, shape: 'valid' | 'bad suffix' | 'stroke label'): string {
    if (shape === 'valid') return `--${'x'.repeat(size - 5)}-->`;
    if (shape === 'bad suffix') return '-'.repeat(size / 2) + ' '.repeat(size / 2 - 1) + 'x';
    return `--${'─'.repeat(size - 5)}-->`;
  }

  for (const [shape, repeated] of [
    ['valid', ['x']],
    ['bad suffix', ['-', ' ']],
    ['stroke label', ['─']],
  ] as const) {
    it(`bounds lint work for ${shape} connectors`, () => {
      assertBoundedWork(
        1024,
        (n) => fenced(`[A] ${connector(n, shape)} [B]`),
        (input) => lint(input, { rules: ['L05'] }),
        repeated,
      );
    });
  }
});

describe('F26 frame iteration', () => {
  const frame = '┌─────┐\n│ row │\n└─────┘';
  const unclosed = '  ┌───┐\n  │ x │';
  const frameRules = ['L11', 'L12', 'L13', 'L15'];

  it('preserves mixed-indent closer order and inner rows', () => {
    const rows = fc.array(
      fc.constantFrom(
        '┌─ Title ─┐',
        '  ┌───┐',
        '│ x │',
        '  │ y │',
        '  │ open',
        '└┘',
        '  └───┘',
        'prose',
        '',
      ),
      { maxLength: 24 },
    );
    fc.assert(
      fc.property(rows, (lines) => {
        const expected = [];
        for (let start = 0; start < lines.length;) {
          const frame = nextFrame(lines, start);
          if (frame === null) break;
          expected.push(frame);
          start = frame.closeLi < 0 ? frame.topLi + 1 : frame.closeLi + 1;
        }
        assert.deepEqual([...iterateFrames(Object.freeze(lines))], expected);
      }),
      properties,
    );
  });

  it('preserves lint locations and autofix bytes around an unclosed frame and a fence', () => {
    const content = `${unclosed}\n┌─────┐\n│ row │\n└─────┘\n  ┌───┐\n  │ y │`;
    assert.deepEqual(parse(fenced(content)), [
      { type: 'diagram', content, startLine: 2, endLine: 9, indent: 0 },
    ]);
    assert.deepEqual(locations(fenced(content), frameRules), [
      ['L11', 4, 1],
      ['L12', 4, 1],
    ]);
    const input = `${unclosed}\n${fenced('┌─┐\n│ row │\n└─┘')}\n  └───┘`;
    assert.equal(autofix(input), input);
    const options = { processFenced: true };
    const fixed = autofix(input, options);
    assert.equal(fixed, `${unclosed}\n${fenced('┌────┐\n│ row│\n└────┘')}\n  └───┘`);
    assert.equal(autofix(fixed, options), fixed);
  });

  it('uses the nearest later L09 closer at the same visual left column', () => {
    const content = [
      '    ┌─┐',
      '中┌─┐',
      '└─┘',
      '  │x││',
      '\u001b[31m  └─┘┘\u001b[0m',
      '  └─┘',
      '┌─┐',
      '│x││',
      '└─┘',
    ].join('\n');
    assert.deepEqual(locations(fenced(content), ['L09']), [
      ['L09', 5, 5],
      ['L09', 6, 5],
      ['L09', 9, 3],
    ]);
  });

  it('bounds lint work for unclosed frames with all default rules', () => {
    assertBoundedWork(1024, (n) => fenced(`${unclosed}\n`.repeat(n).trimEnd()), lint);
  });

  for (const [name, rows] of [
    ['closed', frame],
    ['unclosed', unclosed],
  ] as const) {
    it(`bounds lint work for ${name} frames`, () => {
      assertBoundedWork(
        128,
        (n) => fenced(`${rows}\n`.repeat(n).trimEnd()),
        (input) => lint(input, { rules: frameRules }),
      );
    });

    it(`bounds autofix work for ${name} frames`, () => {
      assertBoundedWork(128, (n) => `${rows}\n`.repeat(n), autofix);
    });
  }
});

const row = 'ordinary prose without chart marks '.repeat(4).trimEnd();
const barLine = '│'.padEnd(row.length) + '\n';
const verticalBarSuffix = (n: number) => `${row}\n`.repeat(n) + barLine.repeat(n);

describe('F27 contiguous standalone blocks', () => {
  const suffix = '  ┌─────┐\n  │ row │\n  └┘';
  const repaired = '  ┌─────┐\n  │ row │\n  └─────┘';

  it('keeps accepted blocks and recovers a diagram suffix at its original source range', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(row, row.replace('without', 'with │ ')), {
          minLength: 1,
          maxLength: 12,
        }),
        (lines) => {
          const prose = lines.join('\n');
          assert.deepEqual(parse(prose), []);
          assert.deepEqual(locations(prose, ['L09']), []);
          assert.equal(autofix(prose), prose);

          const accepted = `description\n${suffix}`;
          assert.deepEqual(parse(accepted), [
            { type: 'diagram', content: accepted, startLine: 1, endLine: 4, indent: 0 },
          ]);

          const mixed = `${prose}\n<!-- note\n${suffix}`;
          assert.deepEqual(parse(mixed), [
            {
              type: 'diagram',
              content: suffix,
              startLine: lines.length + 2,
              endLine: lines.length + 4,
              indent: 2,
            },
          ]);
          assert.deepEqual(locations(mixed, ['L09']), [['L09', lines.length + 4, 9]]);
          assert.equal(autofix(mixed), `${prose}\n<!-- note\n${repaired}`);
          assert.equal(autofix(autofix(mixed)), autofix(mixed));
        },
      ),
      properties,
    );
  });

  it('bounds parse work for an accepted prose block', () => {
    assertBoundedWork(48, (n) => `${`${'─'.repeat(110)} words\n`.repeat(n)}${suffix}`, parse);
  });

  it('bounds parse work for a rejected prose block', () => {
    assertBoundedWork(48, (n) => `${row}\n`.repeat(n), parse);
  });

  it('bounds lint work for prose with a valid diagram suffix', () => {
    assertBoundedWork(
      48,
      (n) => `${row}\n`.repeat(n) + suffix,
      (input) => lint(input, { rules: ['L09'] }),
    );
  });

  it('bounds parse work for a suffix of vertical bars', () => {
    assertBoundedWork(128, verticalBarSuffix, parse, [barLine]);
  });
});

describe('landed L05 and L07 bracket scanning', () => {
  for (const [name, tail, expected] of [
    ['complete flow', ']', [['L07', 1, 1]]],
    ['incomplete bracket', '', []],
    ['incomplete arrow', ']', [['L05', 4, 1]]],
  ] as const) {
    const input = (n: number): string => {
      const label = 'x'.repeat(n / 2);
      const separator = name === 'incomplete arrow' ? '-- >' : '-->';
      const right = name === 'incomplete bracket' ? '['.repeat(label.length) : label;
      return `\`\`\`mermaid\n\`\`\`\n${fenced(`[${label}] ${separator} [${right}${tail}`)}`;
    };
    it(`retains bounded lint work for ${name}`, () => {
      const run = (text: string) => locations(text, ['L05', 'L07']);
      assert.deepEqual(run(input(64)), expected);
      assertBoundedWork(2048, input, run, ['[', 'x']);
    });
  }
});

describe('scan work counters', () => {
  const letters = (n: number) => 'a'.repeat(n);
  function rejects(reason: RegExp, ...args: Parameters<typeof assertBoundedWork>): void {
    assert.throws(() => {
      assertBoundedWork(...args);
    }, reason);
  }

  for (const method of ['includes', 'indexOf'] as const) {
    it(`counts the span searched by ${method}`, () => {
      rejects(/(?:substringChecks|searchUnits) at sizes/, 64, letters, (text) => {
        for (let i = 0; i < text.length; i++) text[method](']', i);
      });
      assertBoundedWork(64, letters, (text) => {
        for (let i = 0; i < text.length; i++) text[method]('a', i);
        text[method](']');
      });
    });
  }

  const rowMoves = {
    unshift: (rows: string[]) => rows.unshift('a'),
    shift: (rows: string[]) => rows.shift(),
    splice: (rows: string[]) => rows.splice(1, 0, 'a'),
    reverse: (rows: string[]) => rows.reverse(),
    toReversed: (rows: string[]) => rows.toReversed(),
  };
  for (const [method, move] of Object.entries(rowMoves)) {
    it(`counts elements moved by ${method}`, () => {
      rejects(/copiedRows at sizes/, 64, letters, (text) => {
        const rows = Array.from(text);
        for (let remaining = text.length; remaining > 0; remaining--) move(rows);
      });
      assertBoundedWork(64, letters, (text) => {
        const rows: string[] = [];
        for (const ch of text) rows.push(ch);
        move(rows);
      });
    });
  }

  it('counts equal-size splice replacements without shifting the tail', () => {
    assertBoundedWork(64, letters, (text) => {
      const rows = Array.from(text);
      for (const ch of text) rows.splice(1, 1, ch);
    });
  });

  it('detects a single exec scanning the vertical-bar suffix from each line', () => {
    rejects(
      /super-linear repetition/,
      16,
      verticalBarSuffix,
      (text) => /^[\s│]*[├└]──/m.exec(text),
      [barLine],
    );
    assertBoundedWork(16, verticalBarSuffix, (text) => /[├└]──/.exec(text), [barLine]);
  });

  for (const method of ['sticky exec', 'split'] as const) {
    it(`counts the characters inspected by a rejecting ${method}`, () => {
      const scan = (text: string, pattern: RegExp) => {
        if (method === 'split') {
          text.split(pattern);
          return;
        }
        const sticky = new RegExp(pattern, 'y');
        for (let i = 0; i < text.length; i++) {
          sticky.lastIndex = i;
          sticky.exec(text);
        }
      };
      rejects(/regexUnits at sizes/, 64, letters, (text) => {
        scan(text, /a+b/);
      });
      assertBoundedWork(64, letters, (text) => {
        scan(text, /b+a/);
      });
    });
  }

  it('distinguishes early and late rejection of an anchored expression', () => {
    const scan = (text: string, pattern: RegExp) => {
      for (let remaining = text.length; remaining > 0; remaining--) pattern.exec(text);
    };
    rejects(/regexUnits at sizes/, 64, letters, (text) => {
      scan(text, /^a+b/);
    });
    assertBoundedWork(64, letters, (text) => {
      scan(text, /^b/);
    });
  });
});
