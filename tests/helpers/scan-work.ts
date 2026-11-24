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

// eslint-disable-next-line @typescript-eslint/unbound-method -- replay the native search with an explicit string receiver
const nativeIndexOf = String.prototype.indexOf;

type Alternative = ReturnType<typeof analyse>['parsed']['pattern']['alternatives'][number];

// On a miss, exec hides the partial match. For a single starting position,
// replay sticky prefixes and measure the furthest character they reach.
function rejectionProbes(pattern: RegExp): RegExp[] | undefined {
  if (!pattern.sticky && (pattern.multiline || !pattern.source.startsWith('^'))) return;
  const { alternatives } = analyse(pattern, { maxReports: 0 }).parsed.pattern;
  if (!pattern.sticky && !alternatives.every((alt) => alt.elements[0]?.raw === '^')) return;
  const prefixes = new Set<string>();
  function visit(branches: readonly Alternative[], prefix: string): void {
    for (const branch of branches) {
      let before = prefix;
      for (const part of branch.elements) {
        const atom = part.type === 'Quantifier' ? part.element : part;
        // A failed repetition can consume fewer than its minimum, including
        // some complete iterations followed by a partial final iteration.
        if (part.type === 'Quantifier' && part.max === 0) continue;
        const repeat = (max: number) => `(?:${atom.raw}){0,${max === Infinity ? '' : max}}`;
        if ('alternatives' in atom) {
          const prior = part.type === 'Quantifier' ? repeat(part.max - 1) : '';
          visit(atom.alternatives, before + prior);
        }
        if (part.type === 'Quantifier') prefixes.add(before + repeat(part.max));
        else if (atom.type !== 'Assertion') prefixes.add(before + atom.raw);
        before += part.raw;
      }
    }
  }
  visit(alternatives, '');
  const flags = pattern.flags.replace(/[gy]/g, '') + 'y';
  return Array.from(prefixes, (source) => new RegExp(source, flags));
}

function missSpan(
  exec: RegExp['exec'],
  probes: RegExp[] | undefined,
  subject: string,
  start: number,
): number {
  if (!probes) return Math.max(0, subject.length - start);
  let end = start;
  for (const probe of probes) {
    probe.lastIndex = start;
    if (exec.call(probe, subject)) end = Math.max(end, probe.lastIndex);
  }
  return end - start;
}

// scslre reports a character that permits another search attempt. For a
// repeated line the quantifier must also be able to consume the whole line.
function checkRepetition(pattern: RegExp, unit: string): void {
  const reports = analyse(pattern).reports;
  for (const report of reports) {
    if (!Array.from(unit).some((ch) => report.character.set.has(ch.codePointAt(0) ?? -1))) continue;
    if (unit.length > 1 && report.type === 'Move') {
      const flags = pattern.flags.replace(/[gmy]/g, '');
      const consumesUnit = new RegExp(`^(?:${report.quant.element.raw})+(?![\\s\\S])`, flags);
      if (!consumesUnit.test(unit)) continue;
    }
    assert.fail(`super-linear repetition of ${JSON.stringify(unit)} in ${pattern.toString()}`);
  }
}

function preparePatterns(run: () => unknown, repeated: readonly string[]) {
  const patterns = new Map<string, RegExp>();
  const lastSubjects = new Map<string, string>();
  const samples = repeated.map((unit) => ({
    unit,
    sample: unit.repeat(16),
    seen: new Set<string>(),
  }));
  const restore = wrapMethod(
    RegExp.prototype,
    'exec',
    (exec) =>
      function (this: RegExp, subject: string) {
        const key = this.toString();
        patterns.set(key, this);
        // split calls the same sticky expression at successive offsets of one subject.
        if (samples.length > 0 && lastSubjects.get(key) !== subject) {
          lastSubjects.set(key, subject);
          for (const { sample, seen } of samples) {
            if (!seen.has(key) && subject.includes(sample)) seen.add(key);
          }
        }
        return exec.call(this, subject);
      },
  );
  try {
    run();
  } finally {
    restore();
  }
  const probes = new Map<string, RegExp[] | undefined>();
  for (const [key, pattern] of patterns) {
    for (const { unit, seen } of samples) {
      if (seen.has(key)) checkRepetition(pattern, unit);
    }
    probes.set(key, rejectionProbes(pattern));
  }
  return probes;
}

function offset(value: number, length: number): number {
  return Math.min(length, Math.max(0, Math.trunc(value) || 0));
}

function measure(run: () => unknown, repeated: readonly string[]) {
  const probes = preparePatterns(run, repeated);
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
          const start = this.global || this.sticky ? offset(this.lastIndex, subject.length) : 0;
          const match = exec.call(this, subject);
          work.regexUnits +=
            1 +
            (match
              ? Math.max(0, match.index + match[0].length - start)
              : missSpan(exec, probes.get(this.toString()), subject, start));
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
          const start = offset(from, this.length);
          work.searchUnits += 1 + (index < 0 ? this.length : index + token.length) - start;
          return index;
        },
    ),
    wrapMethod(
      String.prototype,
      'includes',
      (includes) =>
        function (this: string, token: string, from = 0) {
          const found = includes.call(this, token, from);
          const start = offset(from, this.length);
          const end = found ? nativeIndexOf.call(this, token, start) + token.length : this.length;
          work.substringChecks += 1 + end - start;
          return found;
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
    wrapMethod(
      Array.prototype,
      'push',
      (push) =>
        function (this: unknown[], ...items: unknown[]) {
          work.copiedRows += items.length;
          return push.apply(this, items);
        },
    ),
    wrapMethod(
      Array.prototype,
      'reverse',
      (reverse) =>
        function (this: unknown[]): unknown[] {
          work.copiedRows += this.length;
          reverse.call(this);
          return this;
        },
    ),
    wrapMethod(
      Array.prototype,
      'toReversed',
      (toReversed) =>
        function (this: unknown[]) {
          work.copiedRows += this.length;
          const copy: unknown[] = toReversed.call(this);
          return copy;
        },
    ),
    wrapMethod(
      Array.prototype,
      'shift',
      (shift) =>
        function (this: unknown[]): unknown {
          work.copiedRows += Math.max(0, this.length - 1);
          return shift.call(this);
        },
    ),
    wrapMethod(
      Array.prototype,
      'unshift',
      (unshift) =>
        function (this: unknown[], ...items: unknown[]) {
          if (items.length) work.copiedRows += this.length + items.length;
          return unshift.apply(this, items);
        },
    ),
    wrapMethod(
      Array.prototype,
      'splice',
      (splice) =>
        function (this: unknown[], ...args: Parameters<typeof splice>) {
          const length = this.length;
          const from = Math.trunc(args[0]);
          const start = offset(from < 0 ? length + from : from, length);
          const removed: unknown[] = splice.apply(this, args);
          const inserted = Math.max(0, args.length - 2);
          const shifted = inserted === removed.length ? 0 : length - start - removed.length;
          work.copiedRows += removed.length + inserted + shifted;
          return removed;
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
    const work = measure(() => run(input), size === smallest ? repeated : []);
    assert.ok(
      Object.values(work).some((units) => units > 0),
      'expected to observe scan work',
    );
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
