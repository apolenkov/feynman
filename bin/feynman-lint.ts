#!/usr/bin/env node
// bin/feynman-lint.ts — feynman diagram linter CLI
// Usage: feynman-lint <file.md>
//        feynman-lint -          (stdin)
//        feynman-lint --json <file>
//        feynman-lint --strict <file>
//        feynman-lint --help
// Exit codes: 0 = pass, 1 = lint failure, 2 = usage error
// ESM + TypeScript (Node.js v22.18+ strips types by default — runs .ts directly).

import fs from 'node:fs';
import path from 'node:path';
import { lint, format } from '../lib/lint/index.ts';
import { autofix } from '../lib/lint/autofix.ts';
import { estimateFrameCost, type FrameCost } from '../lib/lint/rules.ts';
import { iterateFrames } from '../lib/lint/frames.ts';
import { atomicWrite } from './adapters/fs.ts';

const USAGE = `Usage: feynman-lint <file.md>
       feynman-lint -          (read from stdin)
       feynman-lint --json <file>
       feynman-lint --strict <file>
       feynman-lint --fix <file>
       feynman-lint --explain <file>
       feynman-lint --help

Options:
  --json     Output issues as JSON object
  --strict   Treat warnings as errors (exit 1 on any issue)
  --fix      Repair misaligned ASCII frames in-place; exit 0 on success
  --explain  Annotate each frame with token-cost breakdown (read-only)
  --help     Show this help message

Exit codes:
  0   No errors (or no issues in default mode)
  1   Lint failure (errors found, or warnings in --strict mode)
  2   Usage error (bad arguments, file not found)
`;

interface ExplainEntry {
  readonly line: number;
  readonly cost: FrameCost;
}

interface LintArguments {
  readonly useJson: boolean;
  readonly useStrict: boolean;
  readonly useFix: boolean;
  readonly useExplain: boolean;
  readonly filePath: string | null;
  readonly useStdin: boolean;
}

interface LintInputFile {
  readonly kind: 'file';
  readonly path: string;
}

interface LintInputStdin {
  readonly kind: 'stdin';
}

interface ParsedLintArguments {
  readonly kind: 'lint';
  readonly useJson: boolean;
  readonly useStrict: boolean;
  readonly useExplain: boolean;
  readonly input: LintInputFile | LintInputStdin;
}

interface ParsedFixArguments {
  readonly kind: 'fix';
  readonly filePath: string;
}

interface HelpArguments {
  readonly kind: 'help';
}

interface InvalidArguments {
  readonly kind: 'error';
  readonly message: string;
}

export type ArgumentParseResult =
  ParsedLintArguments | ParsedFixArguments | HelpArguments | InvalidArguments;

const DEFAULT_ARGUMENTS: LintArguments = {
  useJson: false,
  useStrict: false,
  useFix: false,
  useExplain: false,
  filePath: null,
  useStdin: false,
};

type ScanResult = LintArguments | HelpArguments | InvalidArguments;

function isTerminal(result: ScanResult): result is HelpArguments | InvalidArguments {
  return 'kind' in result;
}

export function parseArguments(argv: readonly string[]): ArgumentParseResult {
  const scanned = argv.reduce<ScanResult>((current, arg) => {
    if (isTerminal(current)) return current;
    if (arg === '--json') return { ...current, useJson: true };
    if (arg === '--strict') return { ...current, useStrict: true };
    if (arg === '--fix') return { ...current, useFix: true };
    if (arg === '--explain') return { ...current, useExplain: true };
    if (arg === '--help') return { kind: 'help' };
    if (arg === '-') return { ...current, useStdin: true };
    if (arg.startsWith('-')) {
      return {
        kind: 'error',
        message: `feynman-lint: unknown flag '${arg}'\n${USAGE}`,
      };
    }
    if (current.filePath !== null) {
      return {
        kind: 'error',
        message: `feynman-lint: too many file arguments\n${USAGE}`,
      };
    }
    return { ...current, filePath: arg };
  }, DEFAULT_ARGUMENTS);

  if (isTerminal(scanned)) return scanned;
  if (scanned.filePath === null) {
    if (!scanned.useStdin) return { kind: 'error', message: USAGE };
    if (!scanned.useFix) {
      return {
        kind: 'lint',
        useJson: scanned.useJson,
        useStrict: scanned.useStrict,
        useExplain: scanned.useExplain,
        input: { kind: 'stdin' },
      };
    }
    return {
      kind: 'error',
      message: 'feynman-lint: --fix requires a file path (not stdin)\n',
    };
  }
  if (scanned.useFix && scanned.useStdin) {
    return {
      kind: 'error',
      message: 'feynman-lint: --fix requires a file path (not stdin)\n',
    };
  }
  if (scanned.useFix) return { kind: 'fix', filePath: scanned.filePath };
  return {
    kind: 'lint',
    useJson: scanned.useJson,
    useStrict: scanned.useStrict,
    useExplain: scanned.useExplain,
    input: scanned.useStdin ? { kind: 'stdin' } : { kind: 'file', path: scanned.filePath },
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type TextFileRead =
  | { readonly kind: 'contents'; readonly text: string }
  | { readonly kind: 'error'; readonly message: string };

function readTextFile(filePath: string): TextFileRead {
  try {
    return { kind: 'contents', text: fs.readFileSync(filePath, 'utf8') };
  } catch (error) {
    return { kind: 'error', message: getErrorMessage(error) };
  }
}

function readStdin(onEnd: (contents: string) => void): void {
  let inputBuffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    inputBuffer += chunk;
  });
  process.stdin.on('end', () => {
    onEnd(inputBuffer);
  });
}

// Exporting the entrypoint keeps the CLI testable without spawning a second
// process (which Node's coverage collector cannot merge).
export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const parsed = parseArguments(argv);
  if (parsed.kind === 'help') {
    process.stdout.write(USAGE);
    process.exit(0);
  }
  if (parsed.kind === 'error') {
    process.stderr.write(parsed.message);
    process.exit(2);
  }
  // --fix mode: read file, run autofix, write back.
  if (parsed.kind === 'fix') {
    const { filePath } = parsed;
    const read = readTextFile(filePath);
    if (read.kind === 'error') {
      process.stderr.write(`feynman-lint: cannot read ${filePath}: ${read.message}\n`);
      process.exit(2);
    }
    const before = read.text;
    const after = autofix(before, {
      processFenced: true,
      convertL11: true,
      convertL15: true,
    });
    if (after !== before) {
      try {
        atomicWrite(filePath, after);
      } catch (error) {
        process.stderr.write(`feynman-lint: cannot write ${filePath}: ${getErrorMessage(error)}\n`);
        process.exit(2);
      }
    }
    process.exit(0);
  }

  const { useJson, useStrict, useExplain, input } = parsed;

  function explainFrames(text: string): ExplainEntry[] {
    if (!text.includes('┌')) return [];
    const lines = text.split('\n');
    return Array.from(iterateFrames(lines))
      .filter(({ closeLi }) => closeLi >= 0)
      .map(({ topLi, closeLi, inner }) => ({
        line: topLi + 1,
        cost: estimateFrameCost({
          top: lines[topLi] ?? '',
          inner,
          bottom: lines[closeLi] ?? '',
        }),
      }));
  }

  function run(markdown: string, displayName: string): void {
    const result = lint(markdown);
    const { issues } = result;
    const explain = useExplain ? explainFrames(markdown) : null;

    if (useJson) {
      const out = {
        file: displayName,
        passed: useStrict ? issues.length === 0 : result.passed,
        issues,
        ...(explain === null ? {} : { explain }),
      };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      const failed = useStrict ? issues.length > 0 : !result.passed;
      process.exit(failed ? 1 : 0);
    }

    // gcc mode
    const isTTY = process.stdout.isTTY;
    const output = format(issues, 'gcc', displayName, isTTY);

    if (explain !== null && explain.length > 0) {
      const explainLines = explain.map(
        (e) =>
          `${displayName}:${e.line}: explain: framing block: ~${e.cost.framing_chars} chars (border: ${e.cost.border_chars}, padding: ${e.cost.padding_chars}, content: ${e.cost.content_chars})\n` +
          `${displayName}:${e.line}: explain: equivalent dot-leader: ~${e.cost.dotleader_equivalent} chars\n` +
          `${displayName}:${e.line}: explain: saving: -${e.cost.saving} chars`,
      );
      process.stdout.write(explainLines.join('\n') + '\n');
    }

    if (output) {
      process.stdout.write(output + '\n');
    }

    const failed = useStrict ? issues.length > 0 : !result.passed;

    if (failed) {
      const errCount = issues.filter((i) => i.severity === 'error').length;
      const warnCount = issues.filter((i) => i.severity === 'warn').length;
      const parts = [
        errCount > 0 ? `${errCount} error${errCount !== 1 ? 's' : ''}` : null,
        warnCount > 0 ? `${warnCount} warning${warnCount !== 1 ? 's' : ''}` : null,
      ].filter((part): part is string => part !== null);
      process.stderr.write(`${displayName}: ${parts.join(', ')}\n`);
      process.exit(1);
    } else {
      process.exit(0);
    }
  }

  // Read input
  if (input.kind === 'stdin') {
    readStdin((contents) => {
      run(contents, '<stdin>');
    });
  } else {
    const filePath = input.path;
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      process.stderr.write(`feynman-lint: file not found: ${filePath}\n`);
      process.exit(2);
    }
    const read = readTextFile(absPath);
    if (read.kind === 'error') {
      process.stderr.write(`feynman-lint: cannot read file: ${filePath}: ${read.message}\n`);
      process.exit(2);
    }
    run(read.text, filePath);
  }
}

if (import.meta.main) main();
