import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { readLimitedFile } from '../bin/adapters/fs.ts';

it('rejects both oversized files and unbounded input with a zero reported size', (test) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bounded-file-'));
  test.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  const file = path.join(root, 'input');
  const refuse = (): never => {
    throw new Error('too large');
  };
  fs.writeFileSync(file, 'abc');
  assert.equal(readLimitedFile(file, 3, refuse).toString(), 'abc');
  const read = test.mock.method(fs, 'readSync');
  assert.throws(() => readLimitedFile(file, 2, refuse), /too large/);
  assert.equal(read.mock.callCount(), 0);
  assert.throws(() => readLimitedFile('/dev/zero', 2, refuse), /too large/);
  assert.ok(read.mock.callCount() > 0);
});
