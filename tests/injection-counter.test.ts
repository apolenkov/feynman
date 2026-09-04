import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  readState,
  writeState,
  recordInjection,
  statePaths,
  reconcileState,
  changeState,
  removeActiveFlag,
} from '../bin/adapters/state-store.ts';
import { DEFAULT_STATE } from '../lib/state/model.ts';

it('late hook bookkeeping cannot overwrite a completed preference change', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-counter-'));
  try {
    recordInjection(root);
    assert.deepEqual(fs.readdirSync(root), []);
    writeState(root, DEFAULT_STATE);
    const observedByHook = readState(root);
    assert.equal(observedByHook?.['enabled'], true);
    changeState(root, { enabled: false });
    const disabledBytes = fs.readFileSync(statePaths(root).statePath, 'utf8');
    recordInjection(root);
    assert.equal(fs.readFileSync(statePaths(root).statePath, 'utf8'), disabledBytes);
    assert.equal(readState(root)?.['enabled'], false);
    assert.equal(readState(root)?.['injections'], 0);
    changeState(root, { enabled: true, intensity: 'lite', injections: 7 });
    recordInjection(root);
    assert.equal(readState(root)?.['intensity'], 'lite');
    assert.equal(readState(root)?.['injections'], 8);
    recordInjection(root);
    assert.equal(readState(root)?.['injections'], 9);
    fs.writeFileSync(statePaths(root).injectionsPath, 'broken');
    assert.equal(readState(root)?.['injections'], 7);
    fs.writeFileSync(statePaths(root).injectionsPath, String(Number.MAX_SAFE_INTEGER));
    recordInjection(root);
    assert.equal(readState(root)?.['injections'], Number.MAX_SAFE_INTEGER);
    removeActiveFlag(root);
    removeActiveFlag(root);
    const failure = mock.method(fs, 'unlinkSync', () => {
      throw new Error('flag removal denied');
    });
    try {
      assert.throws(() => {
        removeActiveFlag(root);
      }, /flag removal denied/);
    } finally {
      failure.mock.restore();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('reconciles stale flag content and preserves corrupt bytes if the backup fails', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-state-recovery-'));
  try {
    writeState(root, { ...DEFAULT_STATE, intensity: 'lite' });
    const paths = statePaths(root);
    fs.writeFileSync(paths.flagPath, 'full');
    assert.equal(reconcileState(root).active, true);
    assert.equal(fs.readFileSync(paths.flagPath, 'utf8'), 'lite');
    fs.writeFileSync(paths.statePath, '{ original corrupt bytes');
    const failure = mock.method(fs, 'renameSync', () => {
      throw new Error('backup denied');
    });
    try {
      assert.throws(() => reconcileState(root), /backup denied/);
    } finally {
      failure.mock.restore();
    }
    assert.equal(fs.readFileSync(paths.statePath, 'utf8'), '{ original corrupt bytes');
    assert.equal(reconcileState(root).state.intensity, 'full');
    assert.equal(fs.readFileSync(paths.statePath + '.bak', 'utf8'), '{ original corrupt bytes');
    assert.equal(fs.readFileSync(paths.flagPath, 'utf8'), 'full');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
