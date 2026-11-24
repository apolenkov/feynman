import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

describe('feynman-lint output streams', () => {
  const cli = path.resolve(import.meta.dirname, '../bin/feynman-lint.ts');
  const input = '```\n' + '┌─────┐\n│ row │\n└─────┘\n'.repeat(2048) + '```\n';

  for (const { name, flags, status, outputStart, error } of [
    { name: 'JSON success', flags: ['--json'], status: 0, outputStart: /^\{/, error: '' },
    {
      name: 'JSON strict failure with explanations',
      flags: ['--json', '--strict', '--explain'],
      status: 1,
      outputStart: /^\{/,
      error: '',
    },
    {
      name: 'GCC strict failure',
      flags: ['--strict'],
      status: 1,
      outputStart: /^<stdin>:2:1: L11 warn /,
      error: '<stdin>: 4096 warnings\n',
    },
    {
      name: 'GCC explanations on success',
      flags: ['--explain'],
      status: 0,
      outputStart: /^<stdin>:2: explain: framing block:/,
      error: '',
    },
  ]) {
    it(`drains complete ${name} output through a pipe`, (test) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-lint-streams-'));
      test.after(() => {
        fs.rmSync(dir, { recursive: true, force: true });
      });
      const stdoutPath = path.join(dir, 'stdout');
      const stderrPath = path.join(dir, 'stderr');
      const stdout = fs.openSync(stdoutPath, 'w');
      const stderr = fs.openSync(stderrPath, 'w');
      const args = [cli, ...flags, '-'];
      try {
        const redirected = spawnSync(process.execPath, args, {
          input,
          stdio: ['pipe', stdout, stderr],
        });
        assert.ifError(redirected.error);
        assert.equal(redirected.status, status);
      } finally {
        fs.closeSync(stdout);
        fs.closeSync(stderr);
      }

      const expected = fs.readFileSync(stdoutPath);
      assert.ok(expected.length > 256 * 1024, 'output must exceed the pipe buffer');
      assert.match(expected.toString('utf8'), outputStart);
      assert.equal(fs.readFileSync(stderrPath, 'utf8'), error);

      const piped = spawnSync(process.execPath, args, { input, maxBuffer: 8 * 1024 * 1024 });
      assert.ifError(piped.error);
      assert.equal(piped.status, status);
      assert.equal(piped.stderr.toString('utf8'), error);
      assert.ok(
        piped.stdout.equals(expected),
        `pipe captured ${piped.stdout.length} bytes, file captured ${expected.length}`,
      );
      if (flags.includes('--json')) {
        const report: unknown = JSON.parse(piped.stdout.toString('utf8'));
        assert.ok(report !== null && typeof report === 'object' && 'passed' in report);
        assert.equal(report.passed, status === 0);
        assert.ok('issues' in report && Array.isArray(report.issues));
        assert.equal(report.issues.length, 4096);
        if (flags.includes('--explain')) {
          assert.ok('explain' in report && Array.isArray(report.explain));
          assert.equal(report.explain.length, 2048);
        }
      }
    });
  }
});
