import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function assertManifestBytes(output: string, fixture: string, entry: string): void {
  const file = new URL(`../fixtures/${fixture}.txt`, import.meta.url);
  const runner = fs.readFileSync(new URL(`../../scripts/${entry}.ts`, import.meta.url));
  const fields = {
    runnerHash: createHash('sha256').update(runner).digest('hex'),
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
