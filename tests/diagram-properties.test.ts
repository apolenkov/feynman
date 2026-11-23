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

it('parses generated arrow rows and aligns them idempotently without changing labels', () => {
  const row = fc.record({
    padding: fc.integer({ min: 0, max: 3 }),
    token: fc.constantFrom('-->', '→', '──>', '─→'),
    label: fc.constantFrom('alpha', 'β', '漢字', '🧭'),
  });
  fc.assert(
    fc.property(fc.array(row, { minLength: 2, maxLength: 24 }), (rows) => {
      const input = rows
        .map(({ padding, token, label }) => `[x]${' '.repeat(padding)}${token} [${label}]`)
        .join('\n');
      const fixed = autofix(input);
      assert.equal(autofix(fixed), fixed);
      assert.deepEqual(
        parse(fixed).map((node) => node.content),
        [fixed],
      );
      assert.deepEqual(
        fixed.split('\n'),
        rows.map(({ token, label }) => `[x] ${token} [${label}]`),
      );
    }),
  );
});

it('scans a long unfinished box label in a generic fence within the time budget', () => {
  const label = '['.repeat(100_000);
  const start = performance.now();
  assert.deepEqual(parse(`\`\`\`\n${label}\n\`\`\``), []);
  assert.ok(performance.now() - start < 2000);
});
