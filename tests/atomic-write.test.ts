import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWrite } from '../bin/adapters/fs.ts';

it('atomically replaces contents while preserving mode and symlink destinations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-atomic-'));
  try {
    const target = path.join(root, 'target.json');
    atomicWrite(target, 'original');
    assert.equal(fs.statSync(target).mode & 0o777, 0o600);
    fs.chmodSync(target, 0o640);
    const link = path.join(root, 'linked.json');
    fs.symlinkSync(target, link);
    atomicWrite(link, 'replacement');
    assert.equal(fs.readFileSync(target, 'utf8'), 'replacement');
    assert.equal(fs.statSync(target).mode & 0o777, 0o640);
    assert.ok(fs.lstatSync(link).isSymbolicLink());
    fs.chmodSync(target, 0o666);
    atomicWrite(link, 'preserve explicitly granted permissions');
    assert.equal(fs.statSync(target).mode & 0o777, 0o666);
    assert.deepEqual(fs.readdirSync(root).sort(), ['linked.json', 'target.json']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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
