import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ESLint } from 'eslint';
import { autofixFrame } from '../lib/lint/autofix.ts';
import { lint, format, RULE_REGISTRY, RULE_IDS, RULE_DESCRIPTIONS } from '../lib/lint/index.ts';
import { INTENSITIES, OUTPUT_STYLES, DEFAULT_STATE } from '../lib/state/model.ts';
import { L01_box_closure, L10_mixed_script, estimateFrameCost } from '../lib/lint/rules.ts';
import { assertRecord, assertUnknownArray, assertString } from './helpers/assertions.ts';

describe('core ownership boundaries', () => {
  it('rejects representative violations through the effective strict configuration', async () => {
    const eslint = new ESLint();
    const sentinels = [
      ['no-non-null-assertion', 'export const value = [1][0]!;'],
      ['no-unsafe-type-assertion', 'export const value = JSON.parse("1") as number;'],
      ['no-unnecessary-condition', 'export const value = true ? 1 : 0;'],
      [
        'prefer-nullish-coalescing',
        'export const value = ("" as string | undefined) || "fallback";',
      ],
      ['array-type', 'export const value: Array<string> = [];'],
      [
        'strict-boolean-expressions',
        'export function f(value: boolean | undefined): number { return value ? 1 : 0; }',
      ],
      [
        'switch-exhaustiveness-check',
        'export function f(value: "a" | "b"): number { switch (value) { case "a": return 1; } return 0; }',
      ],
      [
        'prefer-readonly-parameter-types',
        'export function f(value: string[]): number { return value.length; }',
      ],
    ] as const;
    for (const [rule, source] of sentinels) {
      const results = await eslint.lintText(source, { filePath: 'lib/lint/rules.ts' });
      assert.ok(
        results
          .flatMap((result) => result.messages)
          .some((message) => message.ruleId === `@typescript-eslint/${rule}`),
        `effective configuration must reject ${rule}`,
      );
    }
    const reassignment = await eslint.lintText(
      'export function f(value: { key: number }): void { value.key = 2; }',
      { filePath: 'bin/adapters/state-store.ts' },
    );
    assert.ok(
      reassignment
        .flatMap((result) => result.messages)
        .some((message) => message.ruleId === 'no-param-reassign'),
    );
  });

  it('freezes exported defaults and registries for JavaScript consumers too', () => {
    for (const value of [
      RULE_REGISTRY,
      RULE_IDS,
      RULE_DESCRIPTIONS,
      INTENSITIES,
      OUTPUT_STYLES,
      DEFAULT_STATE,
      ...RULE_REGISTRY,
    ]) {
      assert.equal(Object.isFrozen(value), true);
      assert.equal(Reflect.set(value, 'unexpectedMutation', true), false);
    }
  });

  it('permits runner-owned registration but rejects floating application promises in tests', async () => {
    const eslint = new ESLint();
    const filePath = 'tests/core-boundaries.test.ts';
    const registration = await eslint.lintText(
      "import { it as spec } from 'node:test'; import assert from 'node:assert/strict'; spec('case', () => { assert.equal(1, 1); });",
      { filePath },
    );
    assert.deepEqual(
      registration.flatMap((result) => result.messages),
      [],
    );
    const application = await eslint.lintText(
      'async function it() { await Promise.resolve(); } it();',
      { filePath },
    );
    assert.ok(
      application
        .flatMap((result) => result.messages)
        .some((message) => message.ruleId === '@typescript-eslint/no-floating-promises'),
    );
  });

  it('accepts every published package identifier without reading metadata in the core', () => {
    const pkg: unknown = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    assertRecord(pkg);
    assertString(pkg['name']);
    assertUnknownArray(pkg['keywords']);
    assertRecord(pkg['bin']);
    for (const token of [pkg['name'], ...pkg['keywords'], ...Object.keys(pkg['bin'])]) {
      assertString(token);
      assert.deepEqual(L10_mixed_script(token), [], token);
    }
  });

  it('rejects external dependencies, re-exports, dynamic loading and ambient I/O', async () => {
    const eslint = new ESLint();
    for (const source of [
      "import 'node:fs';",
      "import 'fs/promises';",
      "export * from '../../bin/adapters/state-store.ts';",
      "import '../../package.json' with { type: 'json' };",
      "void import('node:fs');",
      "require('fs');",
      "process.stdout.write('side effect');",
      "globalThis.fetch('https://example.test');",
    ]) {
      const results = await eslint.lintText(source, { filePath: 'lib/lint/rules.ts' });
      const messages = results.flatMap((result) => result.messages);
      assert.ok(
        messages.some((message) => message.ruleId?.startsWith('no-restricted-') === true),
        source,
      );
    }
  });

  it('allows static core dependencies and I/O in adapters', async () => {
    const eslint = new ESLint();
    for (const [filePath, source] of [
      ['lib/lint/rules.ts', "export * from './width.ts';"],
      ['lib/lint/rules.ts', "export * from '../state/model.ts';"],
      ['bin/adapters/state-store.ts', "import 'node:fs';"],
    ] as const) {
      const results = await eslint.lintText(source, { filePath });
      assert.deepEqual(
        results.flatMap((result) => result.messages),
        [],
      );
    }
  });

  it('accepts frozen caller-owned nodes, options and diagnostic lists', () => {
    const frame = Object.freeze({
      top: '┌────┐',
      inner: Object.freeze(['│ ab │']),
      bottom: '└────┘',
      indent: '',
    });
    const original = JSON.stringify(frame);
    const text = autofixFrame(frame);
    assert.equal(text, '┌────┐\n│ ab │\n└────┘');
    assert.ok(estimateFrameCost(frame).framing_chars > 0);
    assert.equal(JSON.stringify(frame), original);

    const node = Object.freeze({
      type: 'diagram',
      content: text,
      startLine: 1,
      endLine: 3,
      indent: 0,
    });
    assert.deepEqual(L01_box_closure(node), []);
    const options = Object.freeze({ rules: Object.freeze(['L01']) });
    const result = lint(text, options);
    assert.equal(result.passed, true);
    assert.equal(format(Object.freeze(result.issues), 'json'), '[]');
  });
});
