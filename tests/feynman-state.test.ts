// tests/feynman-state.test.ts — unit tests for the shared FeynmanState helpers.
// Covers state normalization and the SessionStart output-style suffix.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOutputStyle,
  DEFAULT_STATE,
  normalizeState,
  OUTPUT_STYLE_SUFFIX,
} from '../lib/state/index.ts';
import { assertDefined } from './helpers/assertions.ts';

describe('applyOutputStyle', () => {
  const RULES = 'RULES_TEXT';

  it('appends no suffix for the default style "full"', () => {
    assert.equal(applyOutputStyle(RULES, 'full'), RULES);
  });

  it('appends no suffix when output_style is absent (undefined)', () => {
    assert.equal(applyOutputStyle(RULES, undefined), RULES);
  });

  it('appends no suffix for a non-string value (corrupt state)', () => {
    assert.equal(applyOutputStyle(RULES, 42), RULES);
    assert.equal(applyOutputStyle(RULES, null), RULES);
  });

  it('appends no suffix for an unknown style', () => {
    assert.equal(applyOutputStyle(RULES, 'rainbow'), RULES);
    for (const name of ['constructor', 'toString', '__proto__']) {
      assert.equal(applyOutputStyle(RULES, name), RULES);
    }
  });

  it('appends the short suffix for output_style "short"', () => {
    const suffix = OUTPUT_STYLE_SUFFIX.short;
    assertDefined(suffix);
    assert.equal(applyOutputStyle(RULES, 'short'), RULES + suffix);
  });

  it('appends the middle suffix for output_style "middle"', () => {
    const suffix = OUTPUT_STYLE_SUFFIX.middle;
    assertDefined(suffix);
    assert.equal(applyOutputStyle(RULES, 'middle'), RULES + suffix);
  });
});

describe('normalizeState', () => {
  it('keeps a valid state unchanged', () => {
    const state = Object.freeze({
      enabled: false,
      intensity: 'lite',
      output_style: 'short',
      injections: 4,
    });
    assert.deepEqual(normalizeState(state), state);
    assert.notEqual(normalizeState(state), state);
  });

  it('defaults malformed fields and migrates the legacy counter', () => {
    assert.deepEqual(
      normalizeState({ enabled: 'yes', intensity: 'wide', output_style: 42, count: 7 }),
      {
        ...DEFAULT_STATE,
        injections: 7,
      },
    );
  });

  it('does not retain an invalid counter', () => {
    assert.equal(normalizeState({ injections: -1 }).injections, DEFAULT_STATE.injections);
  });
});
