import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const scripts = path.resolve(import.meta.dirname, '../../scripts');

function digest(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function expectedRunnerHash(entry: string): string {
  const runner = path.join(scripts, entry + '.ts');
  // Before the ASCII runner was split, its manifest hashed only the entrypoint.
  if (entry !== 'evaluate-ascii' || !fs.existsSync(path.join(scripts, 'ascii-evidence.ts'))) {
    return digest(runner);
  }

  // Derive the expected set independently so a new local import or re-export
  // fails the manifest comparison until its source is covered by runnerHash.
  const modules = new Set([runner]);
  for (const file of modules) {
    const { importedFiles } = ts.preProcessFile(fs.readFileSync(file, 'utf8'));
    for (const { fileName } of importedFiles) {
      if (fileName.startsWith('.')) modules.add(path.resolve(path.dirname(file), fileName));
    }
  }
  return createHash('sha256')
    .update([...modules].sort().map(digest).join(''))
    .digest('hex');
}

export function assertManifestBytes(output: string, fixture: string, entry: string): void {
  const file = new URL(`../fixtures/${fixture}.txt`, import.meta.url);
  const fields = {
    runnerHash: expectedRunnerHash(entry),
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    release: os.release(),
  };
  const actual = fs.readFileSync(path.join(output, 'manifest.json'), 'utf8');
  const expected = Object.entries(fields).reduce(
    (bytes, [key, value]) => bytes.replace(`"<${key}>"`, JSON.stringify(value)),
    fs.readFileSync(file, 'utf8'),
  );
  assert.equal(actual, expected);
}
