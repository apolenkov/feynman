// tests/hook_sanity.test.ts — unit tests for assertTagPairs (WR-01/02/03)
// Uses node:test + node:assert/strict. Imports assertTagPairs directly from
// the hook module — no child-process spawn needed for pure-function tests.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { assertTagPairs } from '../hooks/feynman-activate.ts';

describe('assertTagPairs', () => {

  it('returns true for well-formed rules file with matching tag pairs', () => {
    const content = [
      '<intensity name="lite">rules lite</intensity>',
      '<intensity name="full">rules full</intensity>',
      '<intensity name="ultra">rules ultra</intensity>',
    ].join('\n');
    assert.equal(assertTagPairs(content), true);
  });

  it('returns false for malformed file with unmatched opening tag', () => {
    const content = [
      '<intensity name="lite">rules lite</intensity>',
      '<intensity name="full">rules full without closing tag',
    ].join('\n');
    assert.equal(assertTagPairs(content), false);
  });

});
