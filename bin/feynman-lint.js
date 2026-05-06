#!/usr/bin/env node
// bin/feynman-lint.js — feynman diagram linter CLI
// Usage: feynman-lint <file.md>
//        feynman-lint -          (stdin)
//        feynman-lint --json <file>
//        feynman-lint --strict <file>
//        feynman-lint --help
// Exit codes: 0 = pass, 1 = lint failure, 2 = usage error
// Zero deps. CJS only.
'use strict';

const fs   = require('fs');
const path = require('path');
const { lint, format } = require('../lib/lint');

const USAGE = `Usage: feynman-lint <file.md>
       feynman-lint -          (read from stdin)
       feynman-lint --json <file>
       feynman-lint --strict <file>
       feynman-lint --help

Options:
  --json    Output issues as JSON object
  --strict  Treat warnings as errors (exit 1 on any issue)
  --help    Show this help message

Exit codes:
  0   No errors (or no issues in default mode)
  1   Lint failure (errors found, or warnings in --strict mode)
  2   Usage error (bad arguments, file not found)
`;

// Parse arguments
const argv = process.argv.slice(2);
let useJson   = false;
let useStrict = false;
let filePath  = null;
let useStdin  = false;

for (const arg of argv) {
  if (arg === '--json')   { useJson   = true; continue; }
  if (arg === '--strict') { useStrict = true; continue; }
  if (arg === '--help')   { process.stdout.write(USAGE); process.exit(0); }
  if (arg === '-')        { useStdin  = true; continue; }
  if (arg.startsWith('-') && arg !== '-') {
    process.stderr.write(`feynman-lint: unknown flag '${arg}'\n${USAGE}`);
    process.exit(2);
  }
  if (filePath) {
    process.stderr.write(`feynman-lint: too many file arguments\n${USAGE}`);
    process.exit(2);
  }
  filePath = arg;
}

if (!filePath && !useStdin) {
  process.stderr.write(USAGE);
  process.exit(2);
}

function run(markdown, displayName) {
  const result = lint(markdown);
  const { issues } = result;

  if (useJson) {
    const out = {
      file: displayName,
      passed: useStrict ? issues.length === 0 : result.passed,
      issues,
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    const failed = useStrict ? issues.length > 0 : !result.passed;
    process.exit(failed ? 1 : 0);
  }

  // gcc mode
  const isTTY = process.stdout.isTTY;
  const output = format(issues, 'gcc', displayName, isTTY);

  if (output) {
    process.stdout.write(output + '\n');
  }

  // Determine pass/fail
  const failed = useStrict
    ? issues.length > 0
    : !result.passed;

  if (failed) {
    const errCount  = issues.filter(i => i.severity === 'error').length;
    const warnCount = issues.filter(i => i.severity === 'warn').length;
    const parts = [];
    if (errCount)  parts.push(`${errCount} error${errCount  !== 1 ? 's' : ''}`);
    if (warnCount) parts.push(`${warnCount} warning${warnCount !== 1 ? 's' : ''}`);
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
  process.stdin.on('data', chunk => { buf += chunk; });
  process.stdin.on('end', () => run(buf, '<stdin>'));
} else {
  // File mode
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    process.stderr.write(`feynman-lint: file not found: ${filePath}\n`);
    process.exit(2);
  }
  let markdown;
  try {
    markdown = fs.readFileSync(absPath, 'utf8');
  } catch (e) {
    process.stderr.write(`feynman-lint: cannot read file: ${filePath}: ${e.message}\n`);
    process.exit(2);
  }
  run(markdown, filePath);
}
