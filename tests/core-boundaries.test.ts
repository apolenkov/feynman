import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ESLint } from 'eslint';
import { autofixFrame } from '../lib/lint/autofix.ts';
import { lint, format, RULE_REGISTRY, RULE_IDS, RULE_DESCRIPTIONS } from '../lib/lint/index.ts';
import { INTENSITIES, OUTPUT_STYLES, DEFAULT_STATE } from '../lib/state/model.ts';
import { L01_box_closure, L10_mixed_script, estimateFrameCost } from '../lib/lint/rules.ts';

describe('core ownership boundaries', () => {
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
      "import { it as spec } from 'node:test'; spec('case', () => {});",
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
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      name: string;
      keywords: string[];
      bin: Record<string, string>;
    };
    for (const token of [pkg.name, ...pkg.keywords, ...Object.keys(pkg.bin)]) {
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
        messages.some((message) => message.ruleId?.startsWith('no-restricted-')),
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
    ]) {
      assert.ok(filePath && source);
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
