import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { lint } from '../lib/lint/index.ts';

function isIncludesFunction(value: unknown): value is typeof String.prototype.includes {
  return typeof value === 'function';
}

function isTestFunction(value: unknown): value is typeof RegExp.prototype.test {
  return typeof value === 'function';
}

describe('lint rule execution failures', () => {
  it('turns a per-node rule exception into a failed result at the node line', () => {
    const includesDescriptor = Object.getOwnPropertyDescriptor(String.prototype, 'includes');
    const originalIncludes: unknown = includesDescriptor?.value;
    assert.ok(includesDescriptor !== undefined && isIncludesFunction(originalIncludes));
    String.prototype.includes = function includes(
      this: string,
      searchString: string,
      position?: number,
    ): boolean {
      if (this === '┌──┐\n│ x│\n└──┘' && searchString === '┌') {
        throw new Error('injected per-node failure');
      }
      return Reflect.apply(originalIncludes, this, [searchString, position]);
    };

    try {
      const result = lint('before\n```\n┌──┐\n│ x│\n└──┘\n```', { rules: ['L01'] });
      assert.equal(result.passed, false);
      assert.deepEqual(result.issues, [
        {
          rule: 'L01',
          severity: 'error',
          line: 3,
          column: 1,
          message: 'Rule execution failed: injected per-node failure',
        },
      ]);
    } finally {
      Object.defineProperty(String.prototype, 'includes', includesDescriptor);
    }
  });

  it('turns a full-text rule exception into a failed result without an AST placeholder', () => {
    const testDescriptor = Object.getOwnPropertyDescriptor(RegExp.prototype, 'test');
    const originalTest: unknown = testDescriptor?.value;
    assert.ok(testDescriptor !== undefined && isTestFunction(originalTest));
    RegExp.prototype.test = function test(this: RegExp, text: string): boolean {
      if (this.source === '^\\s*```+\\s*mermaid\\b') {
        throw new Error('injected full-text failure');
      }
      return Reflect.apply(originalTest, this, [text]);
    };

    try {
      const result = lint('plain text', { rules: ['L07'] });
      assert.equal(result.passed, false);
      assert.deepEqual(result.issues, [
        {
          rule: 'L07',
          severity: 'error',
          line: 1,
          column: 1,
          message: 'Rule execution failed: injected full-text failure',
        },
      ]);
    } finally {
      Object.defineProperty(RegExp.prototype, 'test', testDescriptor);
    }
  });
});
