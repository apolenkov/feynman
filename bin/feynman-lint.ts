#!/usr/bin/env node
// bin/feynman-lint.ts — feynman diagram linter CLI
// Usage: feynman-lint <file.md>
//        feynman-lint -          (stdin)
//        feynman-lint --json <file>
//        feynman-lint --strict <file>
//        feynman-lint --help
// Exit codes: 0 = pass, 1 = lint failure, 2 = usage error
// ESM + TypeScript (Node.js v22.6+ strip-types, no build step).

import fs from 'node:fs';
import path from 'node:path';
import { lint, format } from '../lib/lint/index.ts';
import { autofix } from '../lib/lint/autofix.ts';
import { estimateFrameCost, type FrameCost } from '../lib/lint/rules.ts';

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
  line: number;
  cost: FrameCost;
}

// Parse arguments
const argv = process.argv.slice(2);
let useJson = false;
let useStrict = false;
let useFix = false;
let useExplain = false;
let filePath: string | null = null;
let useStdin = false;

for (const arg of argv) {
  if (arg === '--json') { useJson = true; continue; }
  if (arg === '--strict') { useStrict = true; continue; }
  if (arg === '--fix') { useFix = true; continue; }
  if (arg === '--explain') { useExplain = true; continue; }
  if (arg === '--help') { process.stdout.write(USAGE); process.exit(0); }
  if (arg === '-') { useStdin = true; continue; }
  if (arg.startsWith('-') && arg !== '-') {
    process.stderr.write(`feynman-lint: unknown flag '${arg}'\n${USAGE}`);
    process.exit(2);
  }
  if (filePath !== null) {
    process.stderr.write(`feynman-lint: too many file arguments\n${USAGE}`);
    process.exit(2);
  }
  filePath = arg;
}

if (filePath === null && !useStdin) {
  process.stderr.write(USAGE);
  process.exit(2);
}

// --fix mode: read file, run autofix, write back.
if (useFix) {
  if (useStdin || filePath === null) {
    process.stderr.write('feynman-lint: --fix requires a file path (not stdin)\n');
    process.exit(2);
  }
  let before: string;
  try {
    before = fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    process.stderr.write(`feynman-lint: cannot read ${filePath}: ${(e as NodeJS.ErrnoException).message}\n`);
    process.exit(2);
  }
  const after = autofix(before, { processFenced: true, convertL11: true, convertL15: true });
  if (after !== before) {
    fs.writeFileSync(filePath, after);
  }
  process.exit(0);
}

function explainFrames(text: string): ExplainEntry[] {
  if (!text || !text.includes('┌')) return [];
  const lines = text.split('\n');
  const out: ExplainEntry[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const topMatch = line.match(/^(\s*)┌─+┐\s*$/);
    if (!topMatch) { i++; continue; }
    const indent = topMatch[1] ?? '';
    let closeIdx = -1;
    const inner: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j] ?? '';
      const botMatch = next.match(/^(\s*)└─+┘\s*$/);
      if (botMatch !== null && (botMatch[1] ?? '') === indent) { closeIdx = j; break; }
      if (/^\s*│.*│\s*$/.test(next)) inner.push(next);
    }
    if (closeIdx === -1) { i++; continue; }
    const cost = estimateFrameCost({
      top: line,
      inner,
      bottom: lines[closeIdx] ?? '',
    });
    out.push({ line: i + 1, cost });
    i = closeIdx + 1;
  }
  return out;
}

function run(markdown: string, displayName: string): void {
  const result = lint(markdown);
  const { issues } = result;
  const explain = useExplain ? explainFrames(markdown) : null;

  if (useJson) {
    const out: Record<string, unknown> = {
      file: displayName,
      passed: useStrict ? issues.length === 0 : result.passed,
      issues,
    };
    if (explain !== null) out['explain'] = explain;
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    const failed = useStrict ? issues.length > 0 : !result.passed;
    process.exit(failed ? 1 : 0);
  }

  // gcc mode
  const isTTY = process.stdout.isTTY === true;
  const output = format(issues, 'gcc', displayName, isTTY);

  if (explain !== null && explain.length > 0) {
    const explainLines = explain.map(e =>
      `${displayName}:${e.line}: explain: framing block: ~${e.cost.framing_chars} chars (border: ${e.cost.border_chars}, padding: ${e.cost.padding_chars}, content: ${e.cost.content_chars})\n` +
      `${displayName}:${e.line}: explain: equivalent dot-leader: ~${e.cost.dotleader_equivalent} chars\n` +
      `${displayName}:${e.line}: explain: saving: -${e.cost.saving} chars`
    );
    process.stdout.write(explainLines.join('\n') + '\n');
  }

  if (output) {
    process.stdout.write(output + '\n');
  }

  const failed = useStrict ? issues.length > 0 : !result.passed;

  if (failed) {
    const errCount = issues.filter(i => i.severity === 'error').length;
    const warnCount = issues.filter(i => i.severity === 'warn').length;
    const parts: string[] = [];
    if (errCount > 0) parts.push(`${errCount} error${errCount !== 1 ? 's' : ''}`);
    if (warnCount > 0) parts.push(`${warnCount} warning${warnCount !== 1 ? 's' : ''}`);
    process.stderr.write(`${displayName}: ${parts.join(', ')}\n`);
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Read input
if (useStdin) {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => { buf += chunk; });
  process.stdin.on('end', () => { run(buf, '<stdin>'); });
} else {
  const absPath = path.resolve(filePath!);
  if (!fs.existsSync(absPath)) {
    process.stderr.write(`feynman-lint: file not found: ${filePath!}\n`);
    process.exit(2);
  }
  let markdown: string;
  try {
    markdown = fs.readFileSync(absPath, 'utf8');
  } catch (e) {
    process.stderr.write(`feynman-lint: cannot read file: ${filePath!}: ${(e as NodeJS.ErrnoException).message}\n`);
    process.exit(2);
  }
  run(markdown, filePath!);
}
