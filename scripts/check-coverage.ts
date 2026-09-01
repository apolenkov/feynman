#!/usr/bin/env node
// scripts/check-coverage.ts — one coverage contract for local CI and GitHub.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const LCOV_PATH = path.join(ROOT, 'coverage', 'lcov.info');
export const MINIMUM_LINE_COVERAGE = 95;

export interface LineCoverage {
  hit: number;
  found: number;
  percentage: number;
}

/** Read only LH/LF records so the result matches the published CI contract. */
export function lineCoverage(lcov: string): LineCoverage {
  let hit = 0;
  let found = 0;
  for (const line of lcov.split(/\r?\n/)) {
    if (line.startsWith('LH:')) hit += Number(line.slice(3));
    if (line.startsWith('LF:')) found += Number(line.slice(3));
  }
  if (!Number.isSafeInteger(hit) || !Number.isSafeInteger(found) || found <= 0 || hit < 0 || hit > found) {
    throw new Error('coverage/lcov.info has invalid or empty line totals');
  }
  return { hit, found, percentage: (100 * hit) / found };
}

export function assertMinimumCoverage(coverage: LineCoverage, minimum = MINIMUM_LINE_COVERAGE): void {
  if (coverage.percentage < minimum) {
    throw new Error(`Coverage ${coverage.percentage.toFixed(2)}% is below ${minimum}% threshold`);
  }
}

function main(): void {
  const coverage = lineCoverage(fs.readFileSync(LCOV_PATH, 'utf8'));
  console.log(`Line coverage: ${coverage.percentage.toFixed(2)}% (${coverage.hit}/${coverage.found})`);
  assertMinimumCoverage(coverage);
  console.log(`PASS: Coverage meets >=${MINIMUM_LINE_COVERAGE}% threshold`);
}

const invokedPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
const modulePath = fs.realpathSync(url.fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL: ${(error as Error).message}`);
    process.exit(1);
  }
}
