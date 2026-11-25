import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import {
  actionlintBinary,
  checkWorkflows,
  disposeActionlint,
  validateNativeWorkflow,
  validateWorkflowSchema,
} from '../scripts/check-workflows.ts';

const directory = path.resolve(import.meta.dirname, '..', '.github', 'workflows');
const workflow = `on: push
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - run: echo ok
`;

it('checks the official schema for every repository workflow', async () => {
  const checked = new Set<string>();
  await checkWorkflows(directory, (content, name) => {
    validateWorkflowSchema(content, name);
    checked.add(name);
  });
  const workflows = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ['.yml', '.yaml'].includes(path.extname(entry.name)))
    .map((entry) => entry.name);
  assert.ok(workflows.length > 0, 'Expected at least one .yml or .yaml workflow file');
  assert.deepEqual(checked, new Set(workflows));
});

for (const [description, before, after, diagnostic] of [
  ['misspelled job key', 'runs-on:', 'runz-on:', /runz-on/],
  [
    'conflicting workflow queue',
    'jobs:',
    'concurrency:\n  group: test\n  queue: max\n  cancel-in-progress: true\njobs:',
    /queue:max requires cancel-in-progress:false/,
  ],
  [
    'conflicting job queue',
    '    runs-on:',
    '    concurrency:\n      group: test\n      queue: max\n      cancel-in-progress: true\n    runs-on:',
    /queue:max requires cancel-in-progress:false/,
  ],
] as const) {
  it(`rejects a new workflow with a ${description}`, async (t) => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-workflows-'));
    t.after(() => {
      fs.rmSync(fixture, { recursive: true, force: true });
    });
    fs.writeFileSync(path.join(fixture, 'additional.yml'), workflow.replace(before, after));
    await assert.rejects(checkWorkflows(fixture, validateWorkflowSchema), diagnostic);
  });
}

it('accepts the queue diagnostic and rejects unknown runner labels even when they contain queue', async (t) => {
  t.after(disposeActionlint);
  const name = 'queued.yml';
  const queued = workflow.replace('jobs:', 'concurrency:\n  group: test\n  queue: max\njobs:');
  try {
    await actionlintBinary();
  } catch (error: unknown) {
    if (
      process.env['CI'] !== 'true' &&
      error instanceof TypeError &&
      error.cause instanceof Error &&
      'code' in error.cause &&
      ['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH'].includes(String(error.cause.code))
    ) {
      t.skip('Offline: the pinned actionlint release is unreachable');
      return;
    }
    throw error;
  }
  await validateNativeWorkflow(queued, name);

  for (const [label, diagnostic] of [
    ['feynman-unknown-runner', /label "feynman-unknown-runner" is unknown\..*\[runner-label\]/],
    ['feynman-queue-runner', /label "feynman-queue-runner" is unknown\..*\[runner-label\]/],
  ] as const) {
    await assert.rejects(
      validateNativeWorkflow(queued.replace('ubuntu-latest', label), name),
      diagnostic,
    );
  }
});

it('exits unsuccessfully when the downloaded actionlint archive fails its checksum', () => {
  const fetchStub = "globalThis.fetch = async () => new Response('invalid archive')";
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(fetchStub)}`,
      path.resolve(import.meta.dirname, '../scripts/check-workflows.ts'),
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Pinned upstream actionlint checksum mismatch/);
});
