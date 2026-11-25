#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { type FrameCost, estimateFrameCost } from '../lib/lint/rules.ts';
import { parseArguments, USAGE } from './cli/lint-arguments.ts';
import { autofix } from '../lib/lint/autofix.ts';
import { atomicWrite } from './adapters/fs.ts';
import { iterateFrames } from '../lib/lint/frames.ts';
import { lint, format } from '../lib/lint/index.ts';
export type { ArgumentParseResult } from './cli/lint-arguments.ts';
export { parseArguments } from './cli/lint-arguments.ts';

interface ExplainEntry {
  readonly line: number;
  readonly cost: FrameCost;
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

  function run(markdown: string, displayName: string): 0 | 1 {
    const result = lint(markdown);
    const { issues } = result;
    const explain = useExplain ? explainFrames(markdown) : null;
    const failed = useStrict ? issues.length > 0 : !result.passed;
    const status = failed ? 1 : 0;

    if (useJson) {
      const out = {
        file: displayName,
        passed: !failed,
        issues,
        ...(explain === null ? {} : { explain }),
      };
      process.stdout.write(JSON.stringify(out, null, 2) + '\n');
      return status;
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

    if (failed) {
      const errCount = issues.filter((i) => i.severity === 'error').length;
      const warnCount = issues.filter((i) => i.severity === 'warn').length;
      const parts = [
        errCount > 0 ? `${errCount} error${errCount !== 1 ? 's' : ''}` : null,
        warnCount > 0 ? `${warnCount} warning${warnCount !== 1 ? 's' : ''}` : null,
      ].filter((part): part is string => part !== null);
      process.stderr.write(`${displayName}: ${parts.join(', ')}\n`);
    }
    return status;
  }

  // Read input
  if (input.kind === 'stdin') {
    readStdin((contents) => {
      process.exitCode = run(contents, '<stdin>');
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
    process.exitCode = run(read.text, filePath);
  }
}

if (import.meta.main) main();
