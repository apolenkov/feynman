#!/usr/bin/env node
// scripts/check-docs.ts — lint public markdown docs with feynman-lint,
// and guard against re-drift of the superseded toolchain contract (ADR 0001).

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');

// --- doc-drift guard (capability: doc-drift-guard) ---------------------------
// ADR 0001 superseded the "CommonJS-only / Node >= 18 / no build step" contract.
// These phrases are correct ONLY inside decision records; on any live surface
// they are stale and must fail CI. See openspec/changes/refresh-deps-and-doc-drift-guard.
export const FORBIDDEN_PHRASES: readonly string[] = [
  'CommonJS-only',
  'CommonJS only',
  'Node >= 18',
  'Node.js >= 18',
  'no build step',
];

// Decision records legitimately quote the superseded phrases; the guard script
// itself holds them as the constants above; and the guard's own capability spec
// documents the phrases it forbids — on archive that spec is promoted from
// openspec/changes/ (excluded) to openspec/specs/, so it must stay excluded too.
// Everything else is a live surface.
export const DRIFT_EXCLUDED_PATHS: readonly string[] = [
  'docs/adr/',
  'CHANGELOG.md',
  'openspec/changes/',
  'scripts/check-docs.ts',
  'openspec/specs/doc-drift-guard/spec.md',
];

export const isDriftExcluded = (rel: string): boolean =>
  DRIFT_EXCLUDED_PATHS.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));

// Pure: given tracked {rel, content} entries, return one finding line per
// (live file, forbidden phrase) hit. Binary files (NUL byte) are skipped.
export function detectDrift(entries: readonly { rel: string; content: string }[]): string[] {
  return entries
    .filter((e) => !isDriftExcluded(e.rel))
    .flatMap((e) =>
      e.content.includes('\u0000')
        ? []
        : FORBIDDEN_PHRASES.filter((phrase) => e.content.includes(phrase)).map(
            (phrase) => `  ${e.rel}: superseded phrase "${phrase}"`,
          ),
    );
}

export interface DocsCheckResult {
  readonly files: readonly string[];
  readonly lintFailures: readonly {
    readonly file: string;
    readonly stdout: string;
    readonly stderr: string;
  }[];
  readonly hasInvalidPublicInstallExample: boolean;
  readonly driftFindings: readonly string[];
}

interface DocsCheckOutput {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
}

function sourceExtension(root: string): '.ts' | '.js' {
  return fs.existsSync(path.join(root, 'bin', 'feynman-lint.ts')) ? '.ts' : '.js';
}

function listMarkdown(root: string, dir: string): string[] {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((name: string) => name.endsWith('.md'))
    .map((name: string) => path.join(dir, name))
    .toSorted();
}

function trackedFiles(root: string): string[] {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) {
    const diagnostics = [
      result.error?.message,
      result.signal === null ? undefined : `signal ${result.signal}`,
      result.stderr.trim().length === 0 ? undefined : result.stderr.trim(),
    ].filter((diagnostic): diagnostic is string => diagnostic !== undefined);
    const detail = diagnostics.length === 0 ? '' : `: ${diagnostics.join('; ')}`;
    throw new Error(`doc-drift guard: unable to list tracked files via git${detail}`);
  }
  return result.stdout.split('\0').filter(Boolean);
}

export function checkDocs(root = ROOT): DocsCheckResult {
  const extension = sourceExtension(root);
  const lint = path.join(root, 'bin', `feynman-lint${extension}`);
  const files: string[] = [
    'README.md',
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    ...listMarkdown(root, 'docs'),
    ...listMarkdown(root, 'examples'),
  ];

  const lintFailures = files.flatMap((file) => {
    const result = spawnSync(process.execPath, [lint, file], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    return result.status === 0 ? [] : [{ file, stdout: result.stdout, stderr: result.stderr }];
  });
  const publicText: string = [
    fs.readFileSync(path.join(root, 'README.md'), 'utf8'),
    fs.readFileSync(path.join(root, 'bin', `feynman${extension}`), 'utf8'),
  ].join('\n');

  const hasInvalidPublicInstallExample = publicText.includes('npx feynman ');
  const entries = trackedFiles(root).flatMap((rel) => {
    try {
      return [{ rel, content: fs.readFileSync(path.join(root, rel), 'utf8') }];
    } catch {
      return []; // unreadable or removed since `git ls-files`
    }
  });
  const driftFindings = detectDrift(entries);

  return { files, lintFailures, hasInvalidPublicInstallExample, driftFindings };
}

export function runDocsCheck(
  root = ROOT,
  output: DocsCheckOutput = {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
): number {
  const result = checkDocs(root);
  for (const failure of result.lintFailures) {
    output.stderr(`docs lint failed: ${failure.file}\n`);
    if (failure.stdout.length > 0) output.stderr(failure.stdout);
    if (failure.stderr.length > 0) output.stderr(failure.stderr);
  }
  if (result.hasInvalidPublicInstallExample) {
    output.stderr('docs lint failed: public install examples must use npx @albinocrabs/feynman\n');
  }
  if (result.driftFindings.length > 0) {
    output.stderr(
      'docs lint failed: superseded toolchain contract on live surfaces (see ADR 0001)\n',
    );
    for (const finding of result.driftFindings) output.stderr(`${finding}\n`);
  }

  if (
    result.lintFailures.length > 0 ||
    result.hasInvalidPublicInstallExample ||
    result.driftFindings.length > 0
  ) {
    return 1;
  }
  output.stdout(`docs lint OK (${result.files.length} files)\n`);
  return 0;
}

// Run main() only when invoked directly, not when imported by a test.
// realpathSync on both sides handles macOS symlinked temp/bin paths.
const invokedPath = process.argv[1] === undefined ? '' : fs.realpathSync(process.argv[1]);
const modulePath = fs.realpathSync(url.fileURLToPath(import.meta.url));
if (invokedPath === modulePath) process.exit(runDocsCheck());
