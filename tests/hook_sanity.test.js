// tests/test_hook_sanity.js — unit tests for assertTagPairs (WR-01/02/03)
// Uses node:test + node:assert/strict. Requires assertTagPairs directly from
// the hook module — no child-process spawn needed for pure-function tests.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { assertTagPairs } = require('../hooks/feynman-activate.js');

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
