#!/usr/bin/env node
// scripts/check-coverage.ts — one coverage contract for local CI and GitHub.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const LCOV_PATH = path.join(ROOT, 'coverage', 'lcov.info');
export const MINIMUM_LINE_COVERAGE = 95;
const PRODUCTION_SOURCE_DIRECTORIES = ['bin', 'hooks', 'lib', 'scripts'] as const;
const EXECUTABLE_ROOT_SOURCES = ['eslint.config.mjs'] as const;

export interface LineCoverage {
  readonly hit: number;
  readonly found: number;
  readonly percentage: number;
}

export interface CoverageScope {
  readonly coverage: LineCoverage;
  readonly coverageFiles: readonly string[];
  readonly lcovFiles: readonly string[];
  readonly missingCoverageFiles: readonly string[];
  readonly lcovFilesOutsideCoverageInventory: readonly string[];
}

interface LcovRecord {
  readonly source: string;
  readonly hit: number;
  readonly found: number;
}

interface OpenLcovRecord {
  readonly source: string;
  readonly hit?: number;
  readonly found?: number;
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

function addLcovCount(record: OpenLcovRecord, label: 'LH' | 'LF', value: string): OpenLcovRecord {
  if (label === 'LH') {
    if (record.hit !== undefined) {
      throw malformedLcov(`record for ${record.source} has more than one LH`);
    }
    return { ...record, hit: lcovCount(value, label, record.source) };
  }
  if (record.found !== undefined) {
    throw malformedLcov(`record for ${record.source} has more than one LF`);
  }
  return { ...record, found: lcovCount(value, label, record.source) };
}

function* iterateLcovRecords(lcov: string): Generator<LcovRecord> {
  // A single mutable cursor keeps scanning linear; completed records are yielded once.
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
      yield closeLcovRecord(record);
      record = undefined;
      continue;
    }

    if (line.startsWith('LH:') || line.startsWith('LF:')) {
      if (record === undefined)
        throw malformedLcov(`${line.slice(0, 2)} at line ${lineNumber} has no source`);
      const label = line.startsWith('LH:') ? 'LH' : 'LF';
      record = addLcovCount(record, label, line.slice(3));
      continue;
    }

    if (record === undefined) throw malformedLcov(`record at line ${lineNumber} appears before SF`);
  }

  if (record !== undefined) {
    throw malformedLcov(`record for ${record.source} is missing end_of_record`);
  }
}

function lcovRecords(lcov: string): LcovRecord[] {
  return Array.from(iterateLcovRecords(lcov));
}

function calculateLineCoverage(records: readonly LcovRecord[]): LineCoverage {
  const { hit, found } = records.reduce(
    (totals, record) => ({ hit: totals.hit + record.hit, found: totals.found + record.found }),
    { hit: 0, found: 0 },
  );
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

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(filePath, root);
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
    return [path.relative(root, filePath).split(path.sep).join('/')];
  });
}

/** Enumerate first-party TypeScript sources whose coverage scope is reviewed by this gate. */
export function productionSourceFiles(root = ROOT): string[] {
  return PRODUCTION_SOURCE_DIRECTORIES.flatMap((directory) =>
    collectTypeScriptFiles(path.join(root, directory), root),
  ).toSorted();
}

/** Enumerate every executable source that contributes to the published line denominator. */
export function coverageSourceFiles(root = ROOT): string[] {
  const rootSources = EXECUTABLE_ROOT_SOURCES.filter((file) =>
    fs.existsSync(path.join(root, file)),
  );
  return [...productionSourceFiles(root), ...rootSources].toSorted();
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
 * Keep the existing LH/LF gate while reporting exactly which executable
 * sources the LCOV report does and does not enumerate.
 */
export function coverageScope(lcov: string, root = ROOT): CoverageScope {
  const records = lcovRecords(lcov);
  const coverageFiles = coverageSourceFiles(root);
  const lcovFiles = [
    ...new Set(records.map((record) => repositoryRelativePath(record.source, root))),
  ].toSorted();
  const lcovFileSet = new Set(lcovFiles);
  const coverageFileSet = new Set(coverageFiles);

  return {
    coverage: calculateLineCoverage(records),
    coverageFiles,
    lcovFiles,
    missingCoverageFiles: coverageFiles.filter((file) => !lcovFileSet.has(file)),
    lcovFilesOutsideCoverageInventory: lcovFiles.filter((file) => !coverageFileSet.has(file)),
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

export function assertCompleteCoverageScope(scope: CoverageScope): void {
  const failures = [
    scope.missingCoverageFiles.length === 0
      ? undefined
      : `coverage sources absent from LCOV: ${scope.missingCoverageFiles.join(', ')}`,
    scope.lcovFilesOutsideCoverageInventory.length === 0
      ? undefined
      : `LCOV records outside coverage inventory: ${scope.lcovFilesOutsideCoverageInventory.join(', ')}`,
  ].filter((failure): failure is string => failure !== undefined);
  if (failures.length > 0) throw new Error(`Incomplete coverage scope: ${failures.join('; ')}`);
}

function main(): void {
  const scope = coverageScope(fs.readFileSync(LCOV_PATH, 'utf8'));
  const { coverage } = scope;
  console.log(
    `Line coverage: ${coverage.percentage.toFixed(2)}% (${coverage.hit}/${coverage.found})`,
  );
  console.log(`Executable coverage inventory (${scope.coverageFiles.length}):`);
  for (const file of scope.coverageFiles) console.log(`  - ${file}`);
  console.log(`LCOV source records: ${scope.lcovFiles.length}`);
  if (scope.missingCoverageFiles.length === 0) {
    console.log('Coverage sources absent from LCOV: none');
  } else {
    console.log(`Coverage sources absent from LCOV (${scope.missingCoverageFiles.length}):`);
    for (const file of scope.missingCoverageFiles) console.log(`  - ${file}`);
  }
  if (scope.lcovFilesOutsideCoverageInventory.length > 0) {
    console.log('LCOV records outside the executable coverage inventory:');
    for (const file of scope.lcovFilesOutsideCoverageInventory) console.log(`  - ${file}`);
  }
  assertCompleteCoverageScope(scope);
  assertMinimumCoverage(coverage);
  console.log(`PASS: Coverage meets >=${MINIMUM_LINE_COVERAGE}% threshold`);
}

const invokedPath = process.argv[1] === undefined ? '' : fs.realpathSync(process.argv[1]);
const modulePath = fs.realpathSync(url.fileURLToPath(import.meta.url));
if (invokedPath === modulePath) {
  try {
    main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}
