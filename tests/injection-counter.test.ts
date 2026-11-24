import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

it('bootstraps missing preferences and reconciles disabled preferences without backing them up', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-state-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  const { statePath, flagPath } = statePaths(root);

  assert.deepEqual(reconcileState(root), { state: DEFAULT_STATE, active: true });
  assert.equal(fs.readFileSync(flagPath, 'utf8'), 'full');
  const disabled = '{"enabled":false,"intensity":"lite"}\n';
  fs.writeFileSync(statePath, disabled);

  assert.equal(reconcileState(root).active, false);
  assert.equal(fs.readFileSync(statePath, 'utf8'), disabled);
  assert.equal(fs.existsSync(statePath + '.bak'), false);
  assert.equal(fs.existsSync(flagPath), false);
});

for (const { method, enabled, description } of [
  { method: 'readFileSync', enabled: false, description: 'preference read' },
  { method: 'lstatSync', enabled: false, description: 'preference stat' },
  { method: 'readFileSync', enabled: true, description: 'active flag access' },
] as const) {
  it(`preserves preference, flag and backup bytes after ${description} fails`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-state-fault-'));
    t.after(() => {
      fs.rmSync(root, { recursive: true, force: true });
    });
    const { statePath, flagPath } = statePaths(root);
    const faultPath = enabled ? flagPath : statePath;
    fs.mkdirSync(path.dirname(statePath));
    const files = [
      [statePath, `${JSON.stringify({ enabled, intensity: 'lite' })}\n`],
      [flagPath, 'ultra'],
      [statePath + '.bak', 'existing backup bytes'],
    ] as const;
    for (const [file, content] of files) fs.writeFileSync(file, content);

    const original = fs[method];
    const existsSync = fs.existsSync;
    // existsSync hides I/O errors and reports false.
    const flagProbe = t.mock.method(fs, 'existsSync', (file: fs.PathLike) =>
      enabled && file === flagPath ? false : existsSync(file),
    );
    const fault = Object.assign(new Error('simulated I/O failure'), { code: 'EIO' });
    const failAccess = t.mock.method(fs, method, (file: unknown, ...args: unknown[]) => {
      if (file === faultPath) throw fault;
      const result: unknown = Reflect.apply(original, fs, [file, ...args]);
      return result;
    });
    try {
      assert.throws(() => reconcileState(root), { code: 'EIO' });
    } finally {
      failAccess.mock.restore();
      flagProbe.mock.restore();
    }
    for (const [file, content] of files) assert.equal(fs.readFileSync(file, 'utf8'), content);

    const hookPath = path.resolve(import.meta.dirname, '../hooks/feynman-session-start.ts');
    const options = {
      input: '{"session_id":"test-session"}',
      encoding: 'utf8' as const,
      env: { ...process.env, FEYNMAN_HOME: root, FEYNMAN_RULES_PATH: '' },
      timeout: 10_000,
    };
    const hook = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import fs from 'node:fs';
        const [method, faultPath, flagPath, hookPath] = process.argv.slice(1);
        const original = fs[method];
        const existsSync = fs.existsSync;
        fs.existsSync = (file) => file === flagPath ? false : existsSync(file);
        fs[method] = (file, ...args) => {
          if (file === faultPath) throw Object.assign(new Error('simulated I/O failure'), { code: 'EIO' });
          return original(file, ...args);
        };
        await import(hookPath);`,
        method,
        faultPath,
        enabled ? flagPath : '',
        hookPath,
      ],
      options,
    );
    assert.equal(hook.status, 0, hook.stderr);
    assert.equal(hook.stdout, '');
    for (const [file, content] of files) assert.equal(fs.readFileSync(file, 'utf8'), content);

    const recovered = spawnSync(process.execPath, [hookPath], options);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(recovered.stdout !== '', enabled);
    assert.equal(fs.existsSync(flagPath), enabled);
    if (enabled) assert.equal(fs.readFileSync(flagPath, 'utf8'), 'lite');
    assert.equal(reconcileState(root).state.enabled, enabled);
    assert.equal(fs.readFileSync(statePath, 'utf8'), files[0][1]);
    assert.equal(fs.readFileSync(statePath + '.bak', 'utf8'), files[2][1]);
  });
}
