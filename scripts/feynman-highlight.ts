#!/usr/bin/env node
// Apply or remove the highlight convention in rules/feynman-contract.md.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { atomicWrite } from '../bin/adapters/fs.ts';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '..');
const RULES_RELATIVE_PATH = path.join('rules', 'feynman-contract.md');
const BUDGET = 4480;
const MARKER_LINE = '**bold** keys; ▲▼ priority; ✓✗ status.';

export interface HighlightOptions {
  readonly dryRun: boolean;
  readonly operation: 'apply' | 'revert';
}

export interface HighlightResult {
  readonly text: string;
  readonly added: number;
  readonly note: string;
}

export interface HighlightEnvironment {
  readonly root: string;
  readonly readFile: (filePath: string) => string;
  readonly writeFile: (filePath: string, contents: string) => void;
  readonly runTests: () => void;
  readonly log: (message: string) => void;
}

export interface HighlightCommandResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error: Error | undefined;
  readonly signal: NodeJS.Signals | null;
}

export type HighlightTestRunner = (root: string) => HighlightCommandResult;

export function parseHighlightArguments(argv: readonly string[]): HighlightOptions {
  return {
    dryRun: argv.includes('--dry-run'),
    operation: argv.includes('--revert') ? 'revert' : 'apply',
  };
}

export function applyHighlight(text: string): HighlightResult {
  if (text.includes(MARKER_LINE)) {
    return { text, added: 0, note: 'marker line already present — no change' };
  }
  const contractCount = Array.from(text.matchAll(/<\/contract>/g)).length;
  return {
    text: text.replace(/<\/contract>/g, `${MARKER_LINE}\n</contract>`),
    added: contractCount,
    note: `added marker to ${contractCount} <contract> blocks`,
  };
}

export function revertHighlight(text: string): HighlightResult {
  const escaped = MARKER_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markerPattern = new RegExp(`${escaped}\\n`, 'g');
  const removed = Array.from(text.matchAll(markerPattern)).length;
  return {
    text: text.replace(markerPattern, ''),
    added: -removed,
    note: `removed ${removed} marker lines`,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function checkBudget(text: string, label: string, log: (message: string) => void): number {
  const size = Buffer.byteLength(text, 'utf8');
  log(`  ${label}: ${size} bytes (budget ≤${BUDGET}, slack ${BUDGET - size})`);
  if (size > BUDGET) throw new Error(`size ${size} exceeds budget ${BUDGET} — refusing to write`);
  return size;
}

export function executeHighlight(
  options: HighlightOptions,
  environment: HighlightEnvironment,
): void {
  const rulesPath = path.join(environment.root, RULES_RELATIVE_PATH);
  const original = environment.readFile(rulesPath);
  checkBudget(original, 'before', environment.log);
  const result =
    options.operation === 'revert' ? revertHighlight(original) : applyHighlight(original);
  environment.log(`  ${result.note}`);

  if (result.text === original) {
    environment.log('no changes needed');
    return;
  }
  checkBudget(result.text, 'after', environment.log);
  if (options.dryRun) {
    environment.log(
      `  dry-run — not writing. ${result.added > 0 ? '+' : ''}${result.added} marker line(s) ${options.operation === 'revert' ? 'would be removed' : 'would be added'}.`,
    );
    return;
  }

  environment.writeFile(rulesPath, result.text);
  environment.log(`  wrote ${rulesPath}`);
  try {
    environment.runTests();
  } catch (testError) {
    try {
      environment.writeFile(rulesPath, original);
    } catch (restoreError) {
      throw new Error(
        `${errorMessage(testError)}; failed to restore ${rulesPath}: ${errorMessage(restoreError)}`,
      );
    }
    throw testError;
  }
  environment.log('  npm test: pass');
}

export function runSystemTestCommand(
  command: string,
  args: readonly string[],
  root: string,
): HighlightCommandResult {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8' });
  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error,
    signal: result.signal,
  };
}

function systemTestRunner(root: string): HighlightCommandResult {
  return runSystemTestCommand('npm', ['test', '--silent'], root);
}

function processFailure(result: HighlightCommandResult): string | null {
  if (result.error !== undefined) return result.error.message;
  if (result.signal !== null) return `terminated by signal ${result.signal}`;
  if (result.status !== 0) return `exit ${result.status ?? 'unavailable'}`;
  return null;
}

export function createHighlightEnvironment(
  root: string,
  testRunner: HighlightTestRunner = systemTestRunner,
): HighlightEnvironment {
  return {
    root,
    readFile: (filePath) => fs.readFileSync(filePath, 'utf8'),
    writeFile: (filePath, contents) => {
      atomicWrite(filePath, contents);
    },
    runTests: () => {
      const result = testRunner(root);
      const failure = processFailure(result);
      if (failure !== null) {
        process.stderr.write(result.stderr || result.stdout || '');
        throw new Error(`npm test failed after edit — reverting (${failure})`);
      }
    },
    log: (message) => {
      console.log(message);
    },
  };
}

export function highlightExitCode(
  argv: readonly string[] = process.argv.slice(2),
  environment: HighlightEnvironment = createHighlightEnvironment(DEFAULT_ROOT),
): number {
  try {
    executeHighlight(parseHighlightArguments(argv), environment);
    return 0;
  } catch (error) {
    console.error('error:', errorMessage(error));
    return 1;
  }
}

export function highlightMain(
  argv: readonly string[] = process.argv.slice(2),
  environment: HighlightEnvironment = createHighlightEnvironment(DEFAULT_ROOT),
): void {
  process.exitCode = highlightExitCode(argv, environment);
}

if (import.meta.main) highlightMain();
