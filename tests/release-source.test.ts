import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { gitFixtureEnvironment } from './helpers/git-environment.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'release.yml');
const GIT_ENV = gitFixtureEnvironment();

function releaseSourceGate(workflow: string): string {
  const marker = '      - name: Validate release source\n';
  const stepStart = workflow.indexOf(marker);
  assert.notEqual(stepStart, -1, 'release workflow must contain the source gate');
  const runStart = workflow.indexOf('        run: |\n', stepStart);
  assert.notEqual(runStart, -1, 'source gate must contain an inline shell script');
  assert.doesNotMatch(
    workflow.slice(stepStart, runStart),
    /^\s+if:/m,
    'source gate must run for release and publishing dispatch events',
  );
  const bodyStart = runStart + '        run: |\n'.length;
  const nextStep = workflow.indexOf('\n      - name:', bodyStart);
  assert.notEqual(nextStep, -1, 'source gate must be followed by another step');

  return workflow
    .slice(bodyStart, nextStep)
    .split('\n')
    .map((line) => {
      assert.ok(
        line === '' || line.startsWith('          '),
        `unexpected gate indentation: ${line}`,
      );
      return line.slice(10);
    })
    .join('\n');
}

function git(cwd: string, args: readonly string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: GIT_ENV });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(tag: 'none' | 'matching' | 'mismatch' | 'annotated'): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-release-source-'));
  git(root, ['init', '--initial-branch=main']);
  git(root, ['config', 'user.name', 'Feynman Test']);
  git(root, ['config', 'user.email', 'feynman-test@example.invalid']);
  fs.writeFileSync(path.join(root, 'package.json'), '{"version":"3.4.5"}\n');
  git(root, ['add', 'package.json']);
  git(root, ['commit', '-m', 'release source']);

  if (tag === 'matching') git(root, ['tag', 'v3.4.5']);
  if (tag === 'annotated') git(root, ['tag', '-a', 'v3.4.5', '-m', 'release 3.4.5']);
  if (tag === 'mismatch') {
    git(root, ['tag', 'v3.4.5']);
    fs.writeFileSync(path.join(root, 'next.txt'), 'different source\n');
    git(root, ['add', 'next.txt']);
    git(root, ['commit', '-m', 'different source']);
  }
  return root;
}

function runGate(
  script: string,
  options: Readonly<{
    event: 'release' | 'workflow_dispatch';
    releaseTag?: string;
    tag: 'none' | 'matching' | 'mismatch' | 'annotated';
  }>,
): Readonly<{ status: number | null; output: string }> {
  const cwd = fixture(options.tag);
  try {
    const result = spawnSync('bash', ['-eu', '-o', 'pipefail', '-c', script], {
      cwd,
      encoding: 'utf8',
      env: {
        ...GIT_ENV,
        EVENT_NAME: options.event,
        RELEASE_TAG: options.releaseTag ?? '',
      },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

describe('release source gate', () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const gate = releaseSourceGate(workflow);

  it('runs before every external-write step', () => {
    const gatePosition = workflow.indexOf('- name: Validate release source');
    for (const step of [
      '- name: Upload package artifact',
      '- name: Update GitHub release notes',
      '- name: Publish to npm via OIDC',
    ]) {
      assert.ok(gatePosition < workflow.indexOf(step), `${step} must follow the source gate`);
    }
  });

  it('accepts matching lightweight and annotated tags for allowed publish events', () => {
    for (const tag of ['matching', 'annotated'] as const) {
      const result = runGate(gate, { event: 'release', releaseTag: 'v3.4.5', tag });
      assert.equal(result.status, 0, result.output);
    }
    const dispatch = runGate(gate, { event: 'workflow_dispatch', tag: 'matching' });
    assert.equal(dispatch.status, 0, dispatch.output);
  });

  it('rejects an existing version tag on another commit for both publish events', () => {
    for (const event of ['release', 'workflow_dispatch'] as const) {
      const result = runGate(gate, { event, releaseTag: 'v3.4.5', tag: 'mismatch' });
      assert.notEqual(result.status, 0);
      assert.match(result.output, /Release source mismatch/);
    }
  });

  it('rejects a release name that differs from package.json', () => {
    const result = runGate(gate, {
      event: 'release',
      releaseTag: 'v9.9.9',
      tag: 'matching',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.output, /Release tag mismatch/);
  });

  it('allows a dispatch without a tag so the workflow can create it', () => {
    const result = runGate(gate, { event: 'workflow_dispatch', tag: 'none' });
    assert.equal(result.status, 0, result.output);
  });

  it('rejects a release event whose fetched tag is missing', () => {
    const result = runGate(gate, { event: 'release', releaseTag: 'v3.4.5', tag: 'none' });
    assert.notEqual(result.status, 0);
    assert.match(result.output, /Release tag is missing/);
  });

  it('rejects a release event without a tag name', () => {
    const result = runGate(gate, { event: 'release', tag: 'matching' });
    assert.notEqual(result.status, 0);
    assert.match(result.output, /missing its tag name/);
  });
});
