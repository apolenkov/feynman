import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { LINT_HELP } from '../cli/help.ts';

// _hookExt resolves to the same value as in feynman.ts:
// prefer .ts (dev with strip-types); fall back to .js (installed npm package).
// From bin/commands/, repo root is ../../, so hooks/ is path.resolve(__dirname, '../../hooks').
const _hookExt = fs.existsSync(path.resolve(import.meta.dirname, '..', '..', 'hooks', 'feynman-activate.ts')) ? '.ts' : '.js';

export function cmdLint(args: string[]): void {
  const lintArgs = args.filter(a => a !== '--help');
  if (args.includes('--help') || lintArgs.length === 0) {
    console.log(LINT_HELP);
    process.exit(0);
  }

  const lintBin = path.resolve(import.meta.dirname, '..', `feynman-lint${_hookExt}`);
  const result = spawnSync(process.execPath, [lintBin, ...lintArgs], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}
