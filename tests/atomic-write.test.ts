import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWrite } from '../bin/adapters/fs.ts';

it('creates a private file by default', (test) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-atomic-'));
  test.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  const target = path.join(root, 'new.json');
  atomicWrite(target, 'original');
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
});

for (const mode of [0o640, 0o666]) {
  it(`preserves the symlink and destination permissions ${mode.toString(8)}`, (test) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-atomic-'));
    test.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });
    const target = path.join(root, 'target.json');
    const link = path.join(root, 'linked.json');
    const original = fs.openSync(target, 'wx');
    try {
      fs.fchmodSync(original, mode);
      fs.symlinkSync(target, link);
      atomicWrite(link, 'replacement');
      assert.equal(fs.fstatSync(original).nlink, 0);
    } finally {
      fs.closeSync(original);
    }
    const replacement = fs.openSync(link, 'r');
    try {
      assert.equal(fs.readFileSync(replacement, 'utf8'), 'replacement');
      assert.equal(fs.fstatSync(replacement).mode & 0o777, mode);
    } finally {
      fs.closeSync(replacement);
    }
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    assert.deepEqual(fs.readdirSync(root).sort(), ['linked.json', 'target.json']);
  });
}

it('preserves user bytes and cleans staging after write, sync, or rename failure', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-atomic-'));
  const target = path.join(root, 'hooks.json');
  const original = '{"unrelated":"keep"}';
  try {
    fs.writeFileSync(target, original);
    for (const method of ['writeFileSync', 'fsyncSync', 'renameSync'] as const) {
      const failure = mock.method(fs, method, () => {
        throw new Error('simulated disk failure');
      });
      try {
        assert.throws(() => {
          atomicWrite(target, '{"replacement":true}');
        }, /simulated disk failure/);
      } finally {
        failure.mock.restore();
      }
      assert.equal(fs.readFileSync(target, 'utf8'), original);
      assert.deepEqual(fs.readdirSync(root), ['hooks.json']);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
