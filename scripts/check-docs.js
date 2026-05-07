#!/usr/bin/env node
// scripts/check-docs.js — lint public markdown docs with feynman-lint.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const LINT = path.join(ROOT, 'bin', 'feynman-lint.js');

function listMarkdown(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs)
    .filter(name => name.endsWith('.md'))
    .map(name => path.join(dir, name))
    .sort();
}

const files = [
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

const publicText = [
  fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'),
  fs.readFileSync(path.join(ROOT, 'bin', 'feynman.js'), 'utf8'),
].join('\n');

if (publicText.includes('npx feynman ')) {
  failed = true;
  process.stderr.write('docs lint failed: public install examples must use npx @albinocrabs/feynman\n');
}

if (failed) process.exit(1);
console.log(`docs lint OK (${files.length} files)`);
