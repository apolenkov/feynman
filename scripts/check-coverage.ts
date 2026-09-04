#!/usr/bin/env node
// scripts/check-coverage.ts — one coverage contract for local CI and GitHub.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const LCOV_PATH = path.join(ROOT, 'coverage', 'lcov.info');
export const MINIMUM_LINE_COVERAGE = 95;
const PRODUCTION_SOURCE_DIRECTORIES = ['bin', 'hooks', 'lib', 'scripts'] as const;

export interface LineCoverage {
  hit: number;
  found: number;
  percentage: number;
}

export interface CoverageScope {
  coverage: LineCoverage;
  productionFiles: string[];
  lcovFiles: string[];
  missingProductionFiles: string[];
  lcovFilesOutsideProductionInventory: string[];
}

interface LcovRecord {
  source: string;
  hit: number;
  found: number;
}

interface OpenLcovRecord {
  source: string;
  hit?: number;
  found?: number;
}

function malformedLcov(message: string): Error {
  return new Error(`coverage/lcov.info has malformed LCOV: ${message}`);
}

function lcovCount(value: string, label: 'LH' | 'LF', source: string): number {
  if (!/^\d+$/.test(value)) {
    throw malformedLcov(`${label} for ${source} is not a non-negative integer`);
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count)) {
    throw malformedLcov(`${label} for ${source} is outside the safe integer range`);
  }
  return count;
}

function closeLcovRecord(record: OpenLcovRecord): LcovRecord {
  if (record.hit === undefined || record.found === undefined) {
    throw malformedLcov(`record for ${record.source} must contain one LH and one LF`);
  }
  if (record.hit > record.found) {
    throw malformedLcov(`LH exceeds LF for ${record.source}`);
  }
  return { source: record.source, hit: record.hit, found: record.found };
}

function lcovRecords(lcov: string): LcovRecord[] {
  const records: LcovRecord[] = [];
  let record: OpenLcovRecord | undefined;

  for (const [index, line] of lcov.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    if (line === '' || line.startsWith('TN:')) continue;

    if (line.startsWith('SF:')) {
      if (record !== undefined) {
        throw malformedLcov(
          `record for ${record.source} is missing end_of_record before line ${lineNumber}`,
        );
      }
      const source = line.slice(3);
      if (source.length === 0) throw malformedLcov(`SF at line ${lineNumber} has no source path`);
      record = { source };
      continue;
    }

    if (line === 'end_of_record') {
      if (record === undefined)
        throw malformedLcov(`end_of_record at line ${lineNumber} has no source`);
      records.push(closeLcovRecord(record));
      record = undefined;
      continue;
    }

    if (line.startsWith('LH:') || line.startsWith('LF:')) {
      if (record === undefined)
        throw malformedLcov(`${line.slice(0, 2)} at line ${lineNumber} has no source`);
      const label = line.slice(0, 2) as 'LH' | 'LF';
      const property = label === 'LH' ? 'hit' : 'found';
      if (record[property] !== undefined) {
        throw malformedLcov(`record for ${record.source} has more than one ${label}`);
      }
      record[property] = lcovCount(line.slice(3), label, record.source);
      continue;
    }

    if (record === undefined) throw malformedLcov(`record at line ${lineNumber} appears before SF`);
  }

  if (record !== undefined) {
    throw malformedLcov(`record for ${record.source} is missing end_of_record`);
  }
  return records;
}

function calculateLineCoverage(records: readonly LcovRecord[]): LineCoverage {
  let hit = 0;
  let found = 0;
  for (const record of records) {
    hit += record.hit;
    found += record.found;
  }
  if (
    !Number.isSafeInteger(hit) ||
    !Number.isSafeInteger(found) ||
    found <= 0 ||
    hit < 0 ||
    hit > found
  ) {
    throw new Error('coverage/lcov.info has invalid or empty line totals');
  }
  return { hit, found, percentage: (100 * hit) / found };
}

/** Read only LH/LF records so the result matches the published CI contract. */
export function lineCoverage(lcov: string): LineCoverage {
  return calculateLineCoverage(lcovRecords(lcov));
}

function collectTypeScriptFiles(directory: string, root: string): string[] {
  if (!fs.existsSync(directory)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(filePath, root));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path.relative(root, filePath).split(path.sep).join('/'));
    }
  }
  return files;
}

/** Enumerate first-party TypeScript sources whose coverage scope is reviewed by this gate. */
export function productionSourceFiles(root = ROOT): string[] {
  return PRODUCTION_SOURCE_DIRECTORIES.flatMap((directory) =>
    collectTypeScriptFiles(path.join(root, directory), root),
  ).sort();
}

function repositoryRelativePath(source: string, root: string): string {
  const absolutePath = path.isAbsolute(source) ? source : path.resolve(root, source);
  const relativePath = path.relative(root, absolutePath);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return source;
  }
  return relativePath.split(path.sep).join('/');
}

/**
 * Keep the existing LH/LF gate while reporting exactly which first-party
 * TypeScript sources the LCOV report does and does not enumerate.
 */
export function coverageScope(lcov: string, root = ROOT): CoverageScope {
  const records = lcovRecords(lcov);
  const productionFiles = productionSourceFiles(root);
  const lcovFiles = [
    ...new Set(records.map((record) => repositoryRelativePath(record.source, root))),
  ].sort();
  const lcovFileSet = new Set(lcovFiles);
  const productionFileSet = new Set(productionFiles);

  return {
    coverage: calculateLineCoverage(records),
    productionFiles,
    lcovFiles,
    missingProductionFiles: productionFiles.filter((file) => !lcovFileSet.has(file)),
    lcovFilesOutsideProductionInventory: lcovFiles.filter((file) => !productionFileSet.has(file)),
  };
}

export function assertMinimumCoverage(
  coverage: LineCoverage,
  minimum = MINIMUM_LINE_COVERAGE,
): void {
  if (coverage.percentage < minimum) {
    throw new Error(`Coverage ${coverage.percentage.toFixed(2)}% is below ${minimum}% threshold`);
  }
}

function main(): void {
  const scope = coverageScope(fs.readFileSync(LCOV_PATH, 'utf8'));
  const { coverage } = scope;
  console.log(
    `Line coverage: ${coverage.percentage.toFixed(2)}% (${coverage.hit}/${coverage.found})`,
  );
  console.log(`Production TypeScript inventory (${scope.productionFiles.length}):`);
  for (const file of scope.productionFiles) console.log(`  - ${file}`);
  console.log(`LCOV source records: ${scope.lcovFiles.length}`);
  if (scope.missingProductionFiles.length === 0) {
    console.log('Production files absent from LCOV: none');
  } else {
    console.log(`Production files absent from LCOV (${scope.missingProductionFiles.length}):`);
    for (const file of scope.missingProductionFiles) console.log(`  - ${file}`);
  }
  if (scope.lcovFilesOutsideProductionInventory.length > 0) {
    console.log('LCOV records outside the production TypeScript inventory:');
    for (const file of scope.lcovFilesOutsideProductionInventory) console.log(`  - ${file}`);
  }
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
