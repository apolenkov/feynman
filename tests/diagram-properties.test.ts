import { boxes } from '../lib/lint/boxes.ts';
import { flowArrowIndex, hasExactlyOneArrow } from '../lib/lint/arrows.ts';
import fc from 'fast-check';
import { parse } from '../lib/lint/parser.ts';
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { autofix } from '../lib/lint/autofix.ts';
import { visualWidth } from '../lib/lint/width.ts';
import { lint } from '../lib/lint/index.ts';

it('preserves generated Unicode labels and converges across frame conversion modes', () => {
  const scripts = ['Latin', 'Кириллица', '漢字', 'e\u0301', '🧭'];
  for (const [scriptIndex, script] of scripts.entries()) {
    for (let count = 1; count <= 8; count++) {
      const labels = Array.from({ length: count }, (_, index) => `${script}_${count}_${index}`);
      const title = `${script} status`;
      const width = Math.max(Math.max(...labels.map(visualWidth)) + 2, visualWidth(title) + 4);
      const indent = ' '.repeat(scriptIndex % 3);
      const rows = labels.map(
        (label) => `${indent}│ ${label}${' '.repeat(width - visualWidth(label) - 1)}│`,
      );
      const frame = [
        `${indent}┌─ ${title} ${'─'.repeat(width - visualWidth(title) - 3)}┐`,
        ...rows,
        `${indent}└${'─'.repeat(width)}┘`,
      ].join('\n');
      assert.deepEqual(lint(frame, { rules: ['L08', 'L09'] }).issues, [], frame);
      assert.equal(autofix(frame), frame, 'valid frame alignment must be stable');
      for (const convertL11 of [false, true]) {
        for (const convertL15 of [false, true]) {
          const options = Object.freeze({ processFenced: true, convertL11, convertL15 });
          const input = `Before\n\n\`\`\`text\n${frame}\n\`\`\`\n\nAfter`;
          const fixed = autofix(input, options);
          assert.equal(autofix(fixed, options), fixed, `conversion must converge: ${input}`);
          for (const label of labels) assert.ok(fixed.includes(label), `lost label ${label}`);
          assert.ok(fixed.includes(title), `lost title ${title}`);
          assert.ok(fixed.startsWith('Before\n\n'));
          assert.ok(fixed.endsWith('\n\nAfter'));
          const damaged = frame.replace(rows[0] ?? '', `${indent}${labels[0] ?? ''}`);
          const preserved = autofix(damaged, options);
          assert.ok(preserved.includes(title), `damaged frame lost title ${title}`);
          for (const label of labels)
            assert.ok(preserved.includes(label), `damaged frame lost ${label}`);
        }
      }
    }
  }
});

it('preserves compact titles and complete generated status payloads', () => {
  const payloads = [
    '✓ built successfully',
    '✗ failed after retry',
    '◐ still processing items',
    '⌛ waiting for deployment',
    '← готов к запуску',
    '→ deploy next stage',
  ];
  for (const [index, payload] of payloads.entries()) {
    const title = `Deploy_${index}`;
    const input = `┌─${title}┐\n│ service_${index} ${payload} │\n└────────────────────┘`;
    const options = Object.freeze({ processFenced: true, convertL11: true, convertL15: true });
    const fixed = autofix(input, options);
    for (const token of [title, `service_${index}`, payload])
      assert.ok(fixed.includes(token), `lost ${token}: ${fixed}`);
    assert.equal(autofix(fixed, options), fixed);
  }
});

it('aligns a narrow compact title once and satisfies frame rules', () => {
  const input = '┌─Deploy┐\n│ x │\n└───────┘';
  const fixed = autofix(input);
  assert.ok(fixed.includes('Deploy'));
  assert.equal(autofix(fixed), fixed);
  assert.deepEqual(lint(fixed, { rules: ['L01', 'L08', 'L09'] }).issues, []);
});

const propertyOptions = { seed: 20261123, numRuns: 100 };

it('parses generated arrow rows and aligns them idempotently without changing labels', () => {
  const row = fc.record({
    left: fc.constantFrom('x', '漢', '🧭'),
    padding: fc.integer({ min: 0, max: 2 }),
    token: fc.constantFrom('-->', '→', '──>', '─→'),
    label: fc.constantFrom('alpha', 'β', '漢字', '🧭'),
  });
  fc.assert(
    fc.property(fc.array(row, { minLength: 2, maxLength: 24 }), (rows) => {
      const input = rows
        .map(
          ({ left, padding, token, label }) => `[${left}]${' '.repeat(padding)}${token} [${label}]`,
        )
        .join('\n');
      const fixed = autofix(input);
      assert.equal(autofix(fixed), fixed);
      assert.deepEqual(
        parse(fixed).map((node) => node.content),
        [fixed],
      );
      const widest = Math.max(...rows.map(({ left }) => visualWidth(left)));
      assert.deepEqual(
        fixed.split('\n'),
        rows.map(
          ({ left, token, label }) =>
            `[${left}]${' '.repeat(1 + widest - visualWidth(left))}${token} [${label}]`,
        ),
      );
    }),
    propertyOptions,
  );
});

it('matches nonempty boxes and complete arrow tokens in generated rows', () => {
  const token = fc.constantFrom('->', '─>', '─→', '──>', '-->', '→');
  const piece = fc.oneof(
    token,
    token.map((arrow) => `[漢${arrow}]`),
    fc.constantFrom('[]', '[', ']', '[[x]', '[unclosed', '🧭'),
  );
  fc.assert(
    fc.property(fc.array(piece, { minLength: 1, maxLength: 16 }), (pieces) => {
      const line = pieces.join('');
      const arrows = [...line.matchAll(/─→|→|──>|-->/g)];
      assert.equal(flowArrowIndex(line), arrows[0]?.index ?? -1);
      assert.equal(hasExactlyOneArrow(line), arrows.length === 1);
      const labels = [...line.matchAll(/\[[^\]]+\]/g)];
      assert.deepEqual(
        [...boxes(line)],
        labels.map((m) => ({ start: m.index, end: m.index + m[0].length })),
      );
    }),
    propertyOptions,
  );
});

it('requires two nonempty boxes to classify an arrowless box row', () => {
  for (const line of ['[single]', '[] [single]', '[[nested]', '[unfinished']) {
    assert.deepEqual(parse(line), []);
    assert.deepEqual(
      parse(`\`\`\`
${line}
\`\`\``),
      [],
    );
  }
});

it('preserves multiline labels and same-line arrow gaps in mermaid mix detection', () => {
  for (const [row, mixed] of [
    ['[a\nb] --> [c\nd]', true],
    ['[a] [nested --> [b]', true],
    ['[a]\n--> [b]', false],
    ['[a] -->\u2028[b]', false],
    ['[] --> [b]', false],
    ['[a] --> []', false],
  ] as const) {
    const input = `\`\`\`mermaid
\`\`\`
${row}`;
    assert.equal(lint(input, { rules: ['L07'] }).issues.length, Number(mixed), row);
  }
});

it('scans long unfinished labels within the time budget', () => {
  const label = '['.repeat(100_000);
  for (const [fence, content, nodeCount] of [
    ['', label, 0],
    ['', `[a] --> [b]\n${label}`, 1],
    ['mermaid', label, 0],
  ] as const) {
    const input = `\`\`\`${fence}\n${content}\n\`\`\``;
    const start = performance.now();
    assert.equal(parse(input).length, nodeCount);
    assert.deepEqual(lint(input).issues, []);
    assert.equal(autofix(input, { processFenced: true }), input);
    assert.ok(performance.now() - start < 2000);
  }
});
