import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it } from 'node:test';
import { checkWorkflows, validateWorkflowSchema } from '../scripts/check-workflows.ts';

const directory = path.resolve(import.meta.dirname, '..', '.github', 'workflows');

it('checks the official schema for every repository workflow', async () => {
  const checked = new Set<string>();
  await checkWorkflows(directory, (content, name) => {
    validateWorkflowSchema(content, name);
    checked.add(name);
  });
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml', 'scorecard.yml']) {
    assert.ok(checked.has(name), `missing workflow: ${name}`);
  }
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
    const original = fs.readFileSync(path.join(directory, 'codeql.yml'), 'utf8');
    fs.writeFileSync(path.join(fixture, 'additional.yml'), original.replace(before, after));
    await assert.rejects(checkWorkflows(fixture, validateWorkflowSchema), diagnostic);
  });
}

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
