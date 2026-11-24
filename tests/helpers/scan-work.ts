import assert from 'node:assert/strict';
import { analyse } from 'scslre';

function wrapMethod<T extends object, K extends keyof T>(
  object: T,
  key: K,
  wrap: (original: T[K]) => T[K],
): () => void {
  const original = object[key];
  Object.defineProperty(object, key, { value: wrap(original) });
  return () => {
    Object.defineProperty(object, key, { value: original });
  };
}

// One native exec can backtrack many times. Check the regexes that actually
// receive a run of the growing character, outside the operation measurement.
function checkRepeatedCharacter(run: () => unknown, ch: string): void {
  const patterns = new Map<string, RegExp>();
  const sample = ch.repeat(16);
  const restore = wrapMethod(
    RegExp.prototype,
    'exec',
    (exec) =>
      function (this: RegExp, subject: string) {
        if (!this.sticky && subject.includes(sample)) patterns.set(this.toString(), this);
        return exec.call(this, subject);
      },
  );
  try {
    run();
  } finally {
    restore();
  }
  for (const pattern of patterns.values()) {
    const reports = analyse(pattern).reports;
    assert.ok(
      !reports.some((report) => report.character.set.has(ch.charCodeAt(0))),
      `super-linear repetition of ${JSON.stringify(ch)} in ${pattern.toString()}`,
    );
  }
}

function measure(run: () => unknown) {
  const work = {
    regexUnits: 0,
    searchUnits: 0,
    substringChecks: 0,
    prefixChecks: 0,
    copiedRows: 0,
  };
  // Each test file has its own Node process. Wrap only synchronous entrypoint
  // calls and always restore the originals before running assertions.
  const restore = [
    wrapMethod(
      RegExp.prototype,
      'exec',
      (exec) =>
        function (this: RegExp, subject: string) {
          const start = this.global || this.sticky ? this.lastIndex : 0;
          const match = exec.call(this, subject);
          // A sticky miss checks one position (notably String.split's separator).
          const end = match ? match.index + match[0].length : this.sticky ? start : subject.length;
          work.regexUnits += 1 + Math.max(0, end - start);
          return match;
        },
    ),
    wrapMethod(
      String.prototype,
      'indexOf',
      (indexOf) =>
        function (this: string, token: string, from = 0) {
          const index = indexOf.call(this, token, from);
          // Charge the span searched, including a failed search to the end.
          const start = Math.min(this.length, Math.max(0, from));
          work.searchUnits += 1 + (index < 0 ? this.length : index + token.length) - start;
          return index;
        },
    ),
    wrapMethod(
      String.prototype,
      'includes',
      (includes) =>
        function (this: string, token: string, from?: number) {
          work.substringChecks++;
          return includes.call(this, token, from);
        },
    ),
    wrapMethod(
      String.prototype,
      'startsWith',
      (startsWith) =>
        function (this: string, token: string, from?: number) {
          work.prefixChecks++;
          return startsWith.call(this, token, from);
        },
    ),
    wrapMethod(
      Array.prototype,
      'slice',
      (slice) =>
        function (this: unknown[], from?: number, end?: number) {
          const result: unknown[] = slice.call(this, from, end);
          work.copiedRows += result.length;
          return result;
        },
    ),
  ];

  try {
    run();
  } finally {
    for (const undo of restore) undo();
  }
  return work;
}

export function assertBoundedWork(
  smallest: number,
  makeInput: (size: number) => string,
  run: (input: string) => unknown,
  repeated: readonly string[] = [],
): void {
  let previous: ReturnType<typeof measure> | undefined;
  for (const size of [smallest, smallest * 2, smallest * 4]) {
    const input = makeInput(size);
    if (size === smallest) {
      for (const ch of repeated) checkRepeatedCharacter(() => run(input), ch);
    }
    const work = measure(() => run(input));
    assert.ok(work.regexUnits + work.searchUnits > 0, 'expected to observe scan work');
    if (previous !== undefined) {
      for (const key of [
        'regexUnits',
        'searchUnits',
        'substringChecks',
        'prefixChecks',
        'copiedRows',
      ] as const) {
        assert.ok(
          work[key] <= 2.8 * previous[key],
          `${key} at sizes ${size / 2}/${size}: ${previous[key]} -> ${work[key]}`,
        );
      }
    }
    previous = work;
  }
}
