#!/usr/bin/env node
// scripts/check-docs.ts — lint public markdown docs with feynman-lint,
// and guard against re-drift of the superseded toolchain contract (ADR 0001).

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const _ext = fs.existsSync(path.join(ROOT, 'bin', 'feynman-lint.ts')) ? '.ts' : '.js';
const LINT = path.join(ROOT, 'bin', `feynman-lint${_ext}`);

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
// itself holds them as the constants above. Everything else is a live surface.
export const DRIFT_EXCLUDED_PATHS: readonly string[] = [
  'docs/adr/',
  'CHANGELOG.md',
  'openspec/changes/',
  'scripts/check-docs.ts',
];

export const isDriftExcluded = (rel: string): boolean =>
  DRIFT_EXCLUDED_PATHS.some((p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p));

// Pure: given tracked {rel, content} entries, return one finding line per
// (live file, forbidden phrase) hit. Binary files (NUL byte) are skipped.
export function detectDrift(entries: ReadonlyArray<{ rel: string; content: string }>): string[] {
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

function listMarkdown(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter((name: string) => name.endsWith('.md'))
    .map((name: string) => path.join(dir, name))
    .sort();
}

function trackedFiles(): string[] {
  const result = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write('doc-drift guard: unable to list tracked files via git\n');
    process.exit(1);
  }
  return result.stdout.split('\0').filter(Boolean);
}

function main(): void {
  const files: string[] = [
    'README.md',
    'CONTRIBUTING.md',
    ...listMarkdown('docs'),
    ...listMarkdown('examples'),
  ];

  let failed = false;
  for (const file of files) {
    const result = spawnSync(process.execPath, [LINT, file], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    if (result.status !== 0) {
      failed = true;
      process.stderr.write(`docs lint failed: ${file}\n`);
      if (result.stdout) process.stderr.write(result.stdout);
      if (result.stderr) process.stderr.write(result.stderr);
    }
  }

  const publicText: string = [
    fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'bin', `feynman${_ext}`), 'utf8'),
  ].join('\n');

  if (publicText.includes('npx feynman ')) {
    failed = true;
    process.stderr.write('docs lint failed: public install examples must use npx @albinocrabs/feynman\n');
  }

  const entries = trackedFiles().flatMap((rel) => {
    try {
      return [{ rel, content: fs.readFileSync(path.join(ROOT, rel), 'utf8') }];
    } catch {
      return []; // unreadable or removed since `git ls-files`
    }
  });
  const driftFindings = detectDrift(entries);
  if (driftFindings.length > 0) {
    failed = true;
    process.stderr.write('docs lint failed: superseded toolchain contract on live surfaces (see ADR 0001)\n');
    for (const finding of driftFindings) process.stderr.write(`${finding}\n`);
  }

  if (failed) process.exit(1);
  console.log(`docs lint OK (${files.length} files)`);
}

// Run main() only when invoked directly, not when imported by a test.
// realpathSync on both sides handles macOS symlinked temp/bin paths.
const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
const modulePath = fs.realpathSync(url.fileURLToPath(import.meta.url));
if (invokedPath === modulePath) main();
