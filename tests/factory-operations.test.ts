import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { it } from 'node:test';
import type { TestContext } from 'node:test';
import { FactoryPlatform } from './helpers/night-factory-transport.ts';
import { record } from '../scripts/factory-protocol.ts';
import type { JsonRecord } from '../scripts/factory-protocol.ts';
import { loadFactoryPolicy, createFactoryContext } from '../scripts/factory-protocol.ts';
import { observeFactory, prepareTarget, stopFactory } from '../scripts/factory-operations.ts';
import {
  validateNativeWorkflow,
  validateWorkflowSchema,
} from '../scripts/check-factory-workflows.ts';

it('native factory workflow JSON boundaries reject malformed input without exposing bytes or writing outputs', async (test) => {
  const root = process.cwd();
  fs.mkdirSync(path.join(root, '.worktrees'), { recursive: true });
  const sentinel = 'SYNTHETIC_FACTORY_JSON_PRIVATE_MARKER_282';
  const malformed = `{"private":"${sentinel}", broken}`;
  for (const workflow of [
    'factory-control.yml',
    'factory-ingress.yml',
    'factory-operations.yml',
    'night-review.yml',
  ]) {
    const source = fs.readFileSync(path.join(root, '.github/workflows', workflow), 'utf8');
    const programs = [
      ...source.matchAll(
        /^[ \t]*node --input-type=module <<'NODE'\r?\n([\s\S]*?)^[ \t]*NODE\s*$/gm,
      ),
    ];
    assert.ok(programs.length > 0, `${workflow} must exercise native programs`);
    for (const [index, match] of programs.entries())
      await test.test(`${workflow} program ${index + 1}`, (subtest) => {
        const directory = fs.mkdtempSync(path.join(root, '.worktrees/factory-json-boundary-'));
        subtest.after(() => {
          fs.rmSync(directory, { recursive: true, force: true });
        });
        fs.symlinkSync(path.join(root, 'scripts'), path.join(directory, 'scripts'), 'dir');
        fs.mkdirSync(path.join(directory, 'factory'));
        const files = new Map([
          ['factory-input.json', malformed],
          ['factory-preflight.json', malformed],
          ['factory/receipt.json', malformed],
          ['factory/checkpoint.json', malformed],
          ['factory/checkpoint.json.transition', sentinel],
          ['github-output', ''],
        ]);
        for (const [file, bytes] of files) fs.writeFileSync(path.join(directory, file), bytes);
        const result = spawnSync(process.execPath, ['--input-type=module'], {
          cwd: directory,
          input: match[1],
          encoding: 'utf8',
          timeout: 10_000,
          env: {
            PATH: process.env['PATH'],
            FACTORY_INPUT: malformed,
            GITHUB_OUTPUT: path.join(directory, 'github-output'),
          },
        });
        assert.equal(result.error, undefined);
        assert.equal(result.signal, null);
        assert.notEqual(result.status, 0, 'malformed JSON must stop the native program');
        const output = result.stdout + result.stderr;
        assert.equal(
          output.includes(sentinel),
          false,
          'native diagnostics must not expose input bytes',
        );
        assert.match(output, /Invalid factory JSON; preserve work/);
        for (const [file, bytes] of files)
          assert.equal(
            fs.readFileSync(path.join(directory, file), 'utf8'),
            bytes,
            `${file} remains unchanged`,
          );
        assert.deepEqual(fs.readdirSync(directory).sort(), [
          'factory',
          'factory-input.json',
          'factory-preflight.json',
          'github-output',
          'scripts',
        ]);
        assert.deepEqual(fs.readdirSync(path.join(directory, 'factory')).sort(), [
          'checkpoint.json',
          'checkpoint.json.transition',
          'receipt.json',
        ]);
      });
  }
});

it('rejects unverified actionlint download bytes before creating any archive or executable', (test) => {
  const root = process.cwd();
  fs.mkdirSync(path.join(root, '.worktrees'), { recursive: true });
  const directory = fs.mkdtempSync(path.join(root, '.worktrees/factory-checksum-'));
  test.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(directory, 'scripts'));
  fs.copyFileSync(
    path.join(root, 'scripts/check-factory-workflows.ts'),
    path.join(directory, 'scripts/check-factory-workflows.ts'),
  );
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    cwd: directory,
    encoding: 'utf8',
    timeout: 30_000,
    input: `
      import assert from 'node:assert/strict';
      import { actionlintBinary } from './scripts/check-factory-workflows.ts';
      globalThis.fetch = async () => new Response('UNVERIFIED_ACTIONLINT_TEST_BYTES');
      await assert.rejects(actionlintBinary(), /Pinned upstream actionlint checksum mismatch/);
    `,
    env: { PATH: process.env['PATH'] },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(directory).sort(), ['node_modules', 'scripts']);
  assert.deepEqual(fs.readdirSync(path.join(directory, 'scripts')), ['check-factory-workflows.ts']);
});

// AC20–22/25–26 primary owner; no window start or additional target is synthesized.
it('keeps unassigned provider and stop identities Prepared/Waiting despite a valid secret name', () => {
  const policy = loadFactoryPolicy();
  const result = prepareTarget(policy);
  assert.equal(result.state, 'prepared-not-enabled');
  assert.equal(result.eligible, false);
  assert.deepEqual(result.required_checks, [
    { context: 'Test (Node 22 on ubuntu-latest)', app_id: null },
    { context: 'Test (Node 22 on macos-latest)', app_id: null },
  ]);
  assert.equal(result.strict, true);
  assert.deepEqual(result.new_targets, []);
});

it('validates native single/max queue and rejects max cancellation without masking any other actionlint error', async () => {
  const workflow = (
    queue: string,
    cancel: string,
    runner = 'ubuntu-latest',
  ): string => `name: Queue control
on: workflow_dispatch
permissions: {}
concurrency:
  group: factory-control-v1
  queue: ${queue}
  cancel-in-progress: ${cancel}
jobs:
  test:
    runs-on: ${runner}
    steps:
      - run: echo ready
`;
  await validateNativeWorkflow(workflow('single', 'false'), 'single.yml');
  await validateNativeWorkflow(workflow('max', 'false'), 'max.yml');
  assert.throws(() => {
    validateWorkflowSchema(workflow('max', 'true'), 'invalid.yml');
  }, /queue:max/);
  await assert.rejects(
    validateNativeWorkflow(workflow('max', 'false', 'definitely-not-a-runner'), 'other-error.yml'),
    /actionlint rejected/,
  );
});

it('does not manufacture a fourteen-day window or infer a successful stop from unknown registry', async () => {
  const policy = loadFactoryPolicy();
  const context = createFactoryContext(policy, '');
  assert.equal((await stopFactory(context)).status, 'Waiting');
  const result = observeFactory(
    policy,
    { components: [], updates: [], incidents: null },
    '2026-10-26T00:00:00Z',
  );
  assert.equal(result.eligible, false);
  assert.equal(result.window_start, null);
});

const BASE = '/repos/apolenkov/feynman';
function stopPlatform(test: TestContext): {
  platform: FactoryPlatform;
  activation: JsonRecord;
  context: ReturnType<FactoryPlatform['context']>;
  state: string;
} {
  const platform = new FactoryPlatform(test);
  const activation = platform.activation({
    activation: false,
    provider_transport: null,
    token_budget: null,
    timeout_seconds: null,
  });
  const context = platform.context(activation, '904', 'stop', 3);
  platform.runs.push({
    id: 905,
    workflow_id: 701,
    repository: { id: 1230959148 },
    status: 'queued',
  });
  platform.runs.push({
    id: 906,
    workflow_id: 272235418,
    repository: { id: 1230959148 },
    status: 'in_progress',
  });
  platform.pulls.push({
    number: 42,
    node_id: 'PR_42',
    head: { ref: 'factory/fix-42', repo: { id: 1230959148 } },
    base: { repo: { id: 1230959148 } },
    auto_merge: { enabled_by: { login: 'github-actions[bot]' } },
  });
  platform.pulls.push({
    number: 43,
    node_id: 'PR_43',
    head: { ref: 'feature/human', repo: { id: 1230959148 } },
    base: { repo: { id: 1230959148 } },
    auto_merge: { enabled_by: { login: 'apolenkov' } },
  });
  const state = platform.commitFiles(
    new Map([
      ['lineages/consumed.json', Buffer.from('{"repair_reservations":2,"unknown_consumed":true}')],
    ]),
    [],
  );
  platform.git(['update-ref', 'refs/heads/factory-state', state]);
  return { platform, activation, context, state };
}

it('AC20 stops complete registered mutators, reads terminal effects and retains consumed quota in real Git', async (test) => {
  const { platform, context, state } = stopPlatform(test);
  const result = await stopFactory(context);
  assert.equal(result.status, 'STOPPED', result.reason);
  assert.deepEqual(
    platform.requests.filter((request) => request.method === 'PUT').map((request) => request.path),
    ['701', '702', '703', '704'].map((id) => `${BASE}/actions/workflows/${id}/disable`),
  );
  assert.deepEqual(
    platform.requests
      .filter((request) => request.path.endsWith('/cancel'))
      .map((request) => request.path),
    [`${BASE}/actions/runs/904/cancel`, `${BASE}/actions/runs/905/cancel`],
  );
  assert.equal(record(platform.pulls[0])['auto_merge'], null);
  assert.notEqual(record(platform.pulls[1])['auto_merge'], null);
  assert.equal(record(platform.runs.find((run) => run['id'] === 906))['status'], 'in_progress');
  assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), state);
  assert.equal(
    platform.git(['show', `${state}:lineages/consumed.json`]),
    '{"repair_reservations":2,"unknown_consumed":true}',
  );
  assert.equal(
    platform.requests.some((request) => request.method !== 'GET' && request.path.includes('/git/')),
    false,
  );
});

it('AC20 denies unknown, incomplete, foreign and retired initial inventory before any stop effect', async (test) => {
  for (const failure of [
    'missing-workflow',
    'foreign-path',
    'unknown-writer',
    'retired-writer',
    'null-identity',
    'foreign-pr',
    'foreign-run',
    'unknown-auto-merge',
    'unknown-workflow-metadata',
    'unknown-run-workflow',
  ])
    await test.test(failure, async (subtest) => {
      const { platform, activation, context, state } = stopPlatform(subtest);
      const workflows = record(platform.facts.get(`${BASE}/actions/workflows`));
      const entries = Array.isArray(workflows['workflows'])
        ? workflows['workflows'].map(record)
        : [];
      let inputContext = context;
      switch (failure) {
        case 'missing-workflow':
          entries.pop();
          break;
        case 'unknown-workflow-metadata':
          entries.push({});
          break;
        case 'unknown-run-workflow':
          platform.runs.push({
            id: 907,
            workflow_id: null,
            repository: { id: 1230959148 },
            status: 'queued',
          });
          break;
        case 'foreign-path':
          entries[0] = { ...record(entries[0]), path: '.github/workflows/foreign.yml' };
          break;
        case 'unknown-writer':
          entries.push({
            id: 799,
            path: '.github/workflows/factory-unregistered.yml',
            state: 'active',
          });
          break;
        case 'retired-writer':
          entries.push({ id: 375253262, path: '.github/workflows/night-fix.yml', state: 'active' });
          break;
        case 'null-identity':
          inputContext = platform.context(
            {
              ...activation,
              workflow_registry: entries.map((entry, index) => ({
                id: index === 0 ? null : String(entry['id']),
                path: entry['path'],
                mutating: entry['mutating'],
              })),
            },
            '904',
            'stop',
            3,
          );
          break;
        case 'foreign-pr':
          platform.pulls[0] = {
            ...record(platform.pulls[0]),
            head: { ref: 'factory/fix-42', repo: { id: 999 } },
          };
          break;
        case 'foreign-run':
          platform.runs[1] = { ...record(platform.runs[1]), repository: { id: 999 } };
          break;
        case 'unknown-auto-merge': {
          const pr = { ...record(platform.pulls[0]) };
          delete pr['auto_merge'];
          platform.pulls[0] = pr;
          break;
        }
      }
      platform.facts.set(`${BASE}/actions/workflows`, {
        workflows: entries,
        total_count: entries.length,
      });
      assert.equal((await stopFactory(inputContext)).status, 'Waiting');
      assert.equal(
        platform.requests.some((request) => request.method !== 'GET'),
        false,
      );
      assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), state);
    });
});

it('AC20 requires exact complete workflow, run and PR readback after accepted stop effects', async (test) => {
  for (const failure of [
    'missing-workflow',
    'foreign-path',
    'retired-writer',
    'lost-run',
    'lost-pr',
    'pending-run',
    'armed-pr',
    'readback-unavailable',
  ])
    await test.test(failure, async (subtest) => {
      const { platform, context, state } = stopPlatform(subtest);
      const fetch = platform.fetch.bind(platform);
      let workflowReads = 0;
      const cancel = `${BASE}/actions/runs/905/cancel`;
      if (failure === 'pending-run') platform.overrides.set(`${cancel}#nonterminal`, true);
      subtest.mock.method(
        platform,
        'fetch',
        async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
          const url = new URL(input instanceof Request ? input.url : input);
          if (url.pathname === `${BASE}/actions/workflows` && ++workflowReads === 2) {
            if (failure === 'readback-unavailable') return new Response('{}', { status: 503 });
            const inventory = record(platform.facts.get(url.pathname));
            const entries = Array.isArray(inventory['workflows'])
              ? inventory['workflows'].map(record)
              : [];
            if (failure === 'missing-workflow') entries.pop();
            if (failure === 'foreign-path')
              entries[0] = { ...record(entries[0]), path: '.github/workflows/substituted.yml' };
            if (failure === 'retired-writer')
              entries.push({
                id: 375253262,
                path: '.github/workflows/night-fix.yml',
                state: 'active',
              });
            platform.facts.set(url.pathname, { workflows: entries, total_count: entries.length });
            if (failure === 'lost-run')
              platform.runs.splice(
                platform.runs.findIndex((run) => run['id'] === 905),
                1,
              );
            if (failure === 'lost-pr') platform.pulls.splice(0, 1);
            if (failure === 'armed-pr')
              platform.pulls[0] = {
                ...record(platform.pulls[0]),
                auto_merge: { enabled_by: { login: 'github-actions[bot]' } },
              };
          }
          return await fetch(input, init);
        },
      );
      assert.equal((await stopFactory(context)).status, 'Waiting');
      assert.equal(platform.requests.filter((request) => request.method === 'PUT').length, 4);
      assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), state);
    });
});

function observation(): JsonRecord {
  return {
    components: [
      { name: 'policy', fingerprint: 'reviewed-policy-v1', applied_at: '2026-10-01T00:00:00Z' },
      { name: 'workflow', fingerprint: 'reviewed-workflow-v1', applied_at: '2026-10-02T00:00:00Z' },
    ],
    updates: [101, 102, 103].map((number) => ({
      pr_number: number,
      kind: 'registry-update',
      bot: 'dependabot[bot]',
      merged: true,
      merged_at: `2026-10-${String(number - 98).padStart(2, '0')}T00:00:00Z`,
      head_sha: number.toString(16).padStart(40, '0'),
      human_intervention: false,
      trace_complete: true,
      timeline_complete: true,
      checks_complete: true,
      checks: [
        {
          context: 'Test (Node 22 on ubuntu-latest)',
          app_id: null,
          head_sha: number.toString(16).padStart(40, '0'),
          conclusion: 'success',
        },
        {
          context: 'Test (Node 22 on macos-latest)',
          app_id: null,
          head_sha: number.toString(16).padStart(40, '0'),
          conclusion: 'success',
        },
      ],
    })),
    incidents: [],
    incident_inventory_complete: true,
    target_contract_verified: true,
  };
}

it('AC21–22 computes a synthetic full stable window and three distinct genuine registered updates without claiming elapsed deployment', () => {
  const result = observeFactory(loadFactoryPolicy(), observation(), '2026-10-16T00:00:00Z');
  assert.equal(result.eligible, true);
  assert.equal(result.window_start, '2026-10-02T00:00:00.000Z');
  assert.equal(result.qualifying_updates, 3);
});

it('AC21–22 independently excludes false and missing timeline, checks and genuine-update evidence', () => {
  const policy = loadFactoryPolicy();
  const original = observation();
  const updates = Array.isArray(original['updates']) ? original['updates'].map(record) : [];
  const first = record(updates[0]);
  const controls: readonly [string, JsonRecord][] = [
    ['human-probe', { bot: 'apolenkov' }],
    ['source-pr', { kind: 'source-pr' }],
    ['night-fix', { kind: 'night-fix' }],
    ['closed-unmerged', { merged: false }],
    ['human-repair', { human_intervention: true }],
    ['missing-no-human-proof', { human_intervention: undefined }],
    ['false-trace', { trace_complete: false }],
    ['missing-trace', { trace_complete: undefined }],
    ['false-timeline', { timeline_complete: false }],
    ['missing-timeline', { timeline_complete: undefined }],
    ['false-check-inventory', { checks_complete: false }],
    ['missing-check-inventory', { checks_complete: undefined }],
    ['missing-check', { checks: [] }],
    [
      'wrong-head',
      {
        checks: Array.isArray(first['checks'])
          ? first['checks'].map((check) => ({ ...record(check), head_sha: 'f'.repeat(40) }))
          : [],
      },
    ],
    [
      'failed-check',
      {
        checks: Array.isArray(first['checks'])
          ? first['checks'].map((check) => ({ ...record(check), conclusion: 'failure' }))
          : [],
      },
    ],
    [
      'wrong-app',
      {
        checks: Array.isArray(first['checks'])
          ? first['checks'].map((check) => ({ ...record(check), app_id: 999 }))
          : [],
      },
    ],
    ['invalid-merge-date', { merged_at: 'not-a-date' }],
    ['before-window', { merged_at: '2026-10-01T00:00:00Z' }],
    ['future-merge', { merged_at: '2026-10-17T00:00:00Z' }],
    ['missing-head', { head_sha: undefined }],
    ['duplicate-pr', { pr_number: 102 }],
  ];
  for (const [name, patch] of controls) {
    const result = observeFactory(
      policy,
      { ...original, updates: [{ ...first, ...patch }, ...updates.slice(1)] },
      '2026-10-16T00:00:00Z',
    );
    assert.equal(result.eligible, false, name);
    assert.equal(result.qualifying_updates, 2, name);
  }
});

it('AC21 restarts the window at material component application and denies day13, incident or incomplete target evidence', () => {
  const policy = loadFactoryPolicy();
  const input = observation();
  assert.equal(observeFactory(policy, input, '2026-10-15T00:00:00Z').eligible, false);
  const components = Array.isArray(input['components']) ? input['components'].map(record) : [];
  const changed = observeFactory(
    policy,
    {
      ...input,
      components: [
        {
          ...record(components[0]),
          fingerprint: 'reviewed-policy-v2',
          applied_at: '2026-10-15T00:00:00Z',
        },
        ...components.slice(1),
      ],
    },
    '2026-10-16T00:00:00Z',
  );
  assert.equal(changed.eligible, false);
  assert.equal(changed.window_start, '2026-10-15T00:00:00.000Z');
  assert.notEqual(
    changed.fingerprint,
    observeFactory(policy, input, '2026-10-16T00:00:00Z').fingerprint,
  );
  for (const patch of [
    { incidents: [{ kind: 'factory-incident' }] },
    { incidents: undefined },
    { incident_inventory_complete: false },
    { incident_inventory_complete: undefined },
    { target_contract_verified: false },
    { target_contract_verified: undefined },
    { components: [] },
  ])
    assert.equal(
      observeFactory(policy, { ...input, ...patch }, '2026-10-16T00:00:00Z').eligible,
      false,
    );
  assert.equal(observeFactory(policy, input, 'invalid-now').eligible, false);
});

it('AC25–26 preserves exact null check tuples, strict mode and unassigned target template without treating names as readiness', () => {
  const policy = loadFactoryPolicy();
  for (const patch of [
    {},
    { provider_transport: 'named-but-unverified', token_budget: 0, timeout_seconds: -1 },
    { activation: true },
    { security_gate_complete: true },
  ]) {
    const result = prepareTarget({ ...policy, ...patch });
    assert.equal(result.eligible, false);
    assert.equal(result.state, 'prepared-not-enabled');
    assert.equal(result.strict, true);
    assert.deepEqual(result.required_checks, policy['required_checks']);
    assert.deepEqual(result.new_targets, []);
  }
});

it('AC21–22 native observe CLI refuses to certify supplied synthetic qualifying candidates without independent provenance', (test) => {
  const input = observation();
  const candidates = {
    ...input,
    components: [
      { name: 'policy', fingerprint: 'synthetic-only', applied_at: '2000-01-01T00:00:00Z' },
    ],
    updates: Array.isArray(input['updates'])
      ? input['updates'].map((update) => ({ ...record(update), merged_at: '2000-01-02T00:00:00Z' }))
      : [],
  };
  assert.equal(
    observeFactory(loadFactoryPolicy(), candidates, new Date().toISOString()).eligible,
    true,
  );
  fs.mkdirSync(path.resolve('.worktrees'), { recursive: true });
  const directory = fs.mkdtempSync(path.resolve('.worktrees', 'factory-observation-cli-'));
  test.after(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const request = path.join(directory, 'request.json');
  fs.writeFileSync(request, JSON.stringify(candidates));
  const output = execFileSync(
    process.execPath,
    ['scripts/factory-operations.ts', 'observe', request],
    {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: '', FACTORY_ACTIVATION_POLICY_PIN: '' },
    },
  );
  const parsed: unknown = JSON.parse(output);
  const decision = record(parsed);
  assert.equal(decision['status'], 'prepared');
  const result = record(decision['record']);
  assert.equal(result['qualifying_updates'], 3);
  assert.equal(result['eligible'], false);
  assert.match(
    String(result['reason']),
    /independent timeline\/component provenance not established/,
  );
});
