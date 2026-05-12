#!/usr/bin/env node
// scripts/check-docs.ts — lint public markdown docs with feynman-lint.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const _ext = fs.existsSync(path.join(ROOT, 'bin', 'feynman-lint.ts')) ? '.ts' : '.js';
const LINT = path.join(ROOT, 'bin', `feynman-lint${_ext}`);

function listMarkdown(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter((name: string) => name.endsWith('.md'))
    .map((name: string) => path.join(dir, name))
    .sort();
}

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

if (failed) process.exit(1);
console.log(`docs lint OK (${files.length} files)`);
