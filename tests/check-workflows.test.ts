import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import {
  checkWorkflows,
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

it('accepts the queue diagnostic and rejects an unknown runner label', async (t) => {
  const version = spawnSync('actionlint', ['-version'], { encoding: 'utf8' });
  if (version.error && 'code' in version.error && version.error.code === 'ENOENT') {
    t.skip('Offline test requires actionlint 1.7.12 on PATH');
    return;
  }
  assert.ifError(version.error);
  assert.equal(version.status, 0, version.stderr);
  const [installed = 'unknown'] = version.stdout.trim().split('\n');
  if (installed !== '1.7.12') {
    t.skip(`Offline test requires actionlint 1.7.12 on PATH (found ${installed})`);
    return;
  }

  const name = 'queued.yml';
  const queued = workflow.replace('jobs:', 'concurrency:\n  group: test\n  queue: max\njobs:');
  await validateNativeWorkflow(queued, name, 'actionlint');

  const unknownRunner = queued.replace('ubuntu-latest', 'feynman-unknown-runner');
  validateWorkflowSchema(unknownRunner, name);
  await assert.rejects(
    validateNativeWorkflow(unknownRunner, name, 'actionlint'),
    /label "feynman-unknown-runner" is unknown\..*\[runner-label\]/,
  );
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
