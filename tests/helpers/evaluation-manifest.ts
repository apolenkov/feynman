import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function assertManifestBytes(output: string, fixture: string, entry: string): void {
  const file = new URL(`../fixtures/${fixture}.txt`, import.meta.url);
  const sourceDigest = (name: string): string =>
    createHash('sha256')
      .update(fs.readFileSync(new URL(`../../scripts/${name}.ts`, import.meta.url)))
      .digest('hex');
  const asciiModules = [
    'evaluate-ascii',
    'ascii-app-server',
    'ascii-call-plan',
    'ascii-delivery',
    'ascii-evidence',
    'evaluation-tasks',
  ];
  const fields = {
    runnerHash:
      entry === 'evaluate-ascii'
        ? createHash('sha256').update(asciiModules.map(sourceDigest).join('')).digest('hex')
        : sourceDigest(entry),
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
