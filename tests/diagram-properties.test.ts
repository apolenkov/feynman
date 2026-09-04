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
      const width = Math.max(...labels.map(visualWidth)) + 2;
      const indent = ' '.repeat(scriptIndex % 3);
      const rows = labels.map(
        (label) => `${indent}│ ${label}${' '.repeat(width - visualWidth(label) - 1)}│`,
      );
      const frame = [
        `${indent}┌${'─'.repeat(width)}┐`,
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
          assert.ok(fixed.startsWith('Before\n\n'));
          assert.ok(fixed.endsWith('\n\nAfter'));
          const damaged = frame.replace(rows[0] ?? '', `${indent}${labels[0] ?? ''}`);
          const preserved = autofix(damaged, options);
          for (const label of labels)
            assert.ok(preserved.includes(label), `damaged frame lost ${label}`);
        }
      }
    }
  }
});
