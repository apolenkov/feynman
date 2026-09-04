import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { LINT_HELP } from '../cli/help.ts';

// _hookExt resolves to the same value as in feynman.ts:
// prefer .ts (dev with strip-types); fall back to .js (installed npm package).
// From bin/commands/, repo root is ../../, so hooks/ is path.resolve(__dirname, '../../hooks').
const _hookExt = fs.existsSync(
  path.resolve(import.meta.dirname, '..', '..', 'bin', 'feynman-lint.ts'),
)
  ? '.ts'
  : '.js';

export interface LintProcessResult {
  readonly status: number | null;
  readonly error: Error | undefined;
  readonly signal: NodeJS.Signals | null;
}

export type LintRunner = (executable: string, args: readonly string[]) => LintProcessResult;

export function runLintProcess(executable: string, args: readonly string[]): LintProcessResult {
  const result = spawnSync(executable, args, { stdio: 'inherit' });
  return { status: result.status, error: result.error, signal: result.signal };
}

export function cmdLint(args: readonly string[], runner: LintRunner = runLintProcess): void {
  const lintArgs = args.filter((a) => a !== '--help');
  if (args.includes('--help') || lintArgs.length === 0) {
    console.log(LINT_HELP);
    process.exit(0);
  }

  const lintBin = path.resolve(import.meta.dirname, '..', `feynman-lint${_hookExt}`);
  const result = runner(process.execPath, [lintBin, ...lintArgs]);
  if (result.error !== undefined) {
    process.stderr.write(`feynman lint: failed to start linter: ${result.error.message}\n`);
    process.exit(1);
  }
  if (result.signal !== null) {
    process.stderr.write(`feynman lint: linter terminated by signal ${result.signal}\n`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
