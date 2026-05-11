'use strict';
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const files = fs.readdirSync(dir).filter(f => /^results-.*\.json$/.test(f)).sort();

if (files.length === 0) {
  console.log('no result files yet');
  process.exit(0);
}

const rows = [];

for (const file of files) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  } catch (e) {
    process.stderr.write('warning: skipping ' + file + ' — parse error: ' + e.message + '\n');
    continue;
  }
  if (!data.per_prompt || data.per_prompt.length === 0) {
    process.stderr.write('warning: skipping ' + file + ' — no per_prompt entries\n');
    continue;
  }
  const arm = data.arm || file.replace('.json', '');
  const prompts = data.per_prompt.length;
  const passCount = data.per_prompt.filter(p => p.passed === true).length;
  const diagCount = data.per_prompt.filter(p => p.response_has_diagram === true).length;
  const totalChars = data.per_prompt.reduce((s, p) => s + (p.response_chars || 0), 0);
  const avgChars = prompts > 0 ? Math.round(totalChars / prompts) : 0;
  const lintPassRate = prompts > 0 ? Math.round(passCount / prompts * 100) + '%' : 'n/a';
  const diagramRate = prompts > 0 ? Math.round(diagCount / prompts * 100) + '%' : 'n/a';
  rows.push({ arm, prompts, lintPassRate, diagramRate, avgChars, totalChars });
}

if (rows.length === 0) {
  console.log('no valid result files found');
  process.exit(0);
}

const C = { arm: 30, prompts: 8, lint: 10, diag: 13, avg: 10, total: 12 };
const header = [
  'arm'.padEnd(C.arm),
  'prompts'.padStart(C.prompts),
  'lint_pass'.padStart(C.lint),
  'diagram_rate'.padStart(C.diag),
  'avg_chars'.padStart(C.avg),
  'total_chars'.padStart(C.total),
].join('  ');
const sep = '-'.repeat(header.length);

console.log(header);
console.log(sep);
for (const r of rows) {
  const line = [
    r.arm.padEnd(C.arm),
    String(r.prompts).padStart(C.prompts),
    r.lintPassRate.padStart(C.lint),
    r.diagramRate.padStart(C.diag),
    String(r.avgChars).padStart(C.avg),
    String(r.totalChars).padStart(C.total),
  ].join('  ');
  console.log(line);
}
