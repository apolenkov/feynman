import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { autofix } from '../lib/lint/autofix.ts';

describe('mixed-frame autofix bytes', () => {
  const fixtures = new URL('./fixtures/r04/', import.meta.url);
  const input = readFileSync(new URL('mixed-input.txt', fixtures), 'utf8');

  for (const [name, options] of [
    ['default', {}],
    ['converted', { processFenced: true, convertL11: true, convertL15: true }],
  ] as const) {
    it(`${name} output is byte-exact and stable on a second pass`, () => {
      const expected = readFileSync(new URL(`${name}.txt`, fixtures));
      const frozenOptions = Object.freeze(options);
      const fixed = autofix(input, frozenOptions);
      assert.deepEqual(Buffer.from(fixed), expected);
      assert.equal(autofix(fixed, frozenOptions), fixed);
    });
  }
});
