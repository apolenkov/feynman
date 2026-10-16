import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { it } from 'node:test';
import {
  createFactoryContext,
  loadFactoryPolicy,
  parseFactoryJson,
} from '../scripts/factory-protocol.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

it('repair CLI denies effect commands, malformed arguments and unauthenticated preparation', () => {
  const dir = fs.mkdtempSync(path.join(ROOT, '.factory-repair-test-'));
  try {
    const input = path.join(dir, 'request.json');
    fs.writeFileSync(input, JSON.stringify({ issue_number: 42, event_id: '12' }));
    for (const args of [
      ['publish'],
      ['execute'],
      ['provider'],
      ['write'],
      ['unknown-secret-marker'],
      [],
      ['prepare'],
      ['prepare', input, '--override'],
      ['prepare', '--input', input, '--override'],
      ['prepare', input],
      ['prepare', '--input', input],
    ]) {
      const result = spawnSync(process.execPath, ['scripts/factory-repair.ts', ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          FACTORY_ROLE_CONTROL_PIN: '',
          FACTORY_ACTIVATION_POLICY_PIN: '',
          GITHUB_TOKEN: 'secret-marker-test-token',
        },
      });
      assert.equal(result.error, undefined);
      assert.equal(result.status, 1);
      assert.match(result.stdout, /"status":"denied"/);
      const decision = parseFactoryJson(result.stdout);
      assert.deepEqual(decision['record'], {
        effects: 'HOLD',
        provider_allowed: false,
        writer_allowed: false,
      });
      assert.equal(result.stderr, '');
      assert.doesNotMatch(result.stdout, /secret-marker/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it('repair rejects malformed and effect requests before authentication or network', async (test) => {
  const { runRepair } = await import('../scripts/factory-repair.ts');
  const network = test.mock.method(globalThis, 'fetch', () => {
    throw new Error('Unexpected network request');
  });
  const context = createFactoryContext(loadFactoryPolicy(), '');
  const prepare = { command: 'prepare', issue_number: 42, event_id: '12' };
  for (const input of [
    null,
    [],
    {},
    ...['execute', 'publish', 'provider', 'write', 'release', 'stop', 'unknown'].map((command) => ({
      ...prepare,
      command,
    })),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '42'].map((issue_number) => ({
      ...prepare,
      issue_number,
    })),
    ...['', '0', '01', '-1', '12\n', 12].map((event_id) => ({ ...prepare, event_id })),
    ...['context', 'reservation', 'role_control_pin', 'provider_allowed', 'override'].map(
      (field) => ({ ...prepare, [field]: 'secret-marker' }),
    ),
  ]) {
    const result = await runRepair(context, input);
    assert.equal(result.status, 'denied');
    assert.deepEqual(result.record, {
      effects: 'HOLD',
      provider_allowed: false,
      writer_allowed: false,
    });
    assert.doesNotMatch(JSON.stringify(result), /secret-marker/);
  }
  assert.equal(network.mock.callCount(), 0);
});
