import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { TestContext } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitFixtureEnvironment } from './helpers/git-environment.ts';
import { preserveOrRemoveWorktree } from '../scripts/factory-preservation.ts';
import type { JsonRecord } from '../scripts/factory-protocol.ts';

// AC23–24 primary owner: native Git objects/worktree state, not fixture decisions.
function localFixture(t: TestContext): {
  readonly root: string;
  readonly worktree: string;
  readonly head: string;
  readonly proof: JsonRecord;
  readonly git: (args: readonly string[], cwd?: string) => string;
  readonly commit: (cwd: string) => string;
} {
  fs.mkdirSync(path.join(process.cwd(), '.worktrees'), { recursive: true });
  const root = fs.mkdtempSync(path.join(process.cwd(), '.worktrees/factory-keep-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  const env = gitFixtureEnvironment();
  const git = (args: readonly string[], cwd = root): string =>
    execFileSync('git', args, {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const commit = (cwd: string): string => {
    git(['add', '--', 'content.txt'], cwd);
    git(
      [
        '-c',
        'user.name=Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '--allow-empty',
        '-qm',
        'test: fixture',
      ],
      cwd,
    );
    return git(['rev-parse', 'HEAD'], cwd);
  };
  git(['init', '-qb', 'main']);
  fs.writeFileSync(path.join(root, 'content.txt'), 'seed\n');
  const head = commit(root);
  const worktree = path.join(root, '.worktrees', 'owned');
  git(['worktree', 'add', '-qb', 'factory-owned', worktree]);
  const proof = {
    repository_path: root,
    worktree_path: worktree,
    branch: 'factory-owned',
    expected_head: head,
    owner_released: true,
    delivered: true,
    ownership_complete: true,
    other_unmerged: false,
    squash: false,
    delivered_head: head,
  };
  return { root, worktree, head, proof, git, commit };
}

it('preserves dirty tracked, untracked and ignored evidence in real worktrees', async (t) => {
  for (const kind of ['tracked', 'untracked', 'ignored'] as const) {
    await t.test(kind, (child) => {
      const fixture = localFixture(child);
      const file = path.join(
        fixture.worktree,
        kind === 'tracked' ? 'content.txt' : kind === 'ignored' ? 'check.receipt' : 'untracked.txt',
      );
      if (kind === 'ignored')
        fs.writeFileSync(path.join(fixture.root, '.git', 'info', 'exclude'), '*.receipt\n');
      fs.writeFileSync(file, 'preserve this evidence\n');
      const result = preserveOrRemoveWorktree(fixture.proof);
      assert.equal(result.status, 'preserved');
      assert.equal(fs.readFileSync(file, 'utf8'), 'preserve this evidence\n');
      assert.equal(fixture.git(['rev-parse', 'factory-owned']), fixture.head);
    });
  }
});

it('preserves unknown ownership, unreleased owners and other unmerged work', async (t) => {
  const cases = [
    { owner_released: false },
    { ownership_complete: false },
    { delivered: false },
    { other_unmerged: true },
    { other_unmerged: null },
  ];
  for (const override of cases) {
    await t.test(JSON.stringify(override), (child) => {
      const fixture = localFixture(child);
      const result = preserveOrRemoveWorktree({ ...fixture.proof, ...override });
      assert.equal(result.status, 'preserved');
      assert.equal(fs.existsSync(fixture.worktree), true);
      assert.equal(fixture.git(['rev-parse', 'factory-owned']), fixture.head);
    });
  }
});

it('preserves a unique local commit even when the input calls that same commit delivered', (t) => {
  const fixture = localFixture(t);
  fs.writeFileSync(path.join(fixture.worktree, 'content.txt'), 'unique unpublished work\n');
  const unique = fixture.commit(fixture.worktree);
  const result = preserveOrRemoveWorktree({
    ...fixture.proof,
    expected_head: unique,
    delivered_head: unique,
  });
  assert.equal(result.status, 'preserved');
  assert.equal(
    fs.readFileSync(path.join(fixture.worktree, 'content.txt'), 'utf8'),
    'unique unpublished work\n',
  );
  assert.equal(fixture.git(['rev-parse', 'factory-owned']), unique);
});

it('preserves moved heads, wrong branches and paths outside registered worktrees', async (t) => {
  const cases = [
    { expected_head: 'a'.repeat(40) },
    { branch: 'someone-else' },
    { delivered_head: 'unknown-revision' },
  ];
  for (const override of cases) {
    await t.test(JSON.stringify(override), (child) => {
      const fixture = localFixture(child);
      const result = preserveOrRemoveWorktree({ ...fixture.proof, ...override });
      assert.equal(result.status, 'preserved');
      assert.equal(fs.existsSync(fixture.worktree), true);
      assert.equal(fixture.git(['rev-parse', 'factory-owned']), fixture.head);
    });
  }
  const fixture = localFixture(t);
  assert.equal(
    preserveOrRemoveWorktree({ ...fixture.proof, worktree_path: fixture.root }).status,
    'preserved',
  );
  assert.equal(fs.existsSync(fixture.root), true);
});

it('retains equal-tree squash history when ordinary branch deletion cannot prove ancestry', (t) => {
  const fixture = localFixture(t);
  const unique = fixture.commit(fixture.worktree);
  assert.notEqual(unique, fixture.head);
  const tree = fixture.git(['rev-parse', `${fixture.head}^{tree}`]);
  assert.equal(fixture.git(['rev-parse', `${unique}^{tree}`]), tree);
  const result = preserveOrRemoveWorktree({
    ...fixture.proof,
    expected_head: unique,
    squash: true,
    content_tree: tree,
  });
  assert.equal(result.status, 'preserved');
  assert.equal(fs.existsSync(fixture.worktree), true);
  assert.equal(fixture.git(['rev-parse', 'factory-owned']), unique);
});

it('removes only a clean released worktree and branch already delivered to canonical HEAD', (t) => {
  const fixture = localFixture(t);
  const result = preserveOrRemoveWorktree(fixture.proof);
  assert.equal(result.status, 'accepted');
  assert.equal(fs.existsSync(fixture.worktree), false);
  assert.throws(() => fixture.git(['show-ref', '--verify', 'refs/heads/factory-owned']));
  assert.equal(fixture.git(['rev-parse', 'HEAD']), fixture.head);
  assert.equal(fs.readFileSync(path.join(fixture.root, 'content.txt'), 'utf8'), 'seed\n');
});

import { FactoryPlatform } from './helpers/night-factory-transport.ts';
import { runController } from '../scripts/factory-control.ts';
import { produceReceipt, record, sha256, stringField } from '../scripts/factory-protocol.ts';
import type { FactoryContext } from '../scripts/factory-protocol.ts';
import { preserveOrRemoveBranch } from '../scripts/factory-preservation.ts';

async function remoteFixture(t: TestContext): Promise<{
  readonly platform: FactoryPlatform;
  readonly context: FactoryContext;
  readonly input: JsonRecord;
  readonly branch: string;
  readonly head: string;
  readonly delivered: string;
}> {
  const platform = new FactoryPlatform(t);
  const bootstrapPolicy = platform.activation({
    activation: false,
    bootstrap_completed: false,
    genesis_head: null,
    genesis_receipt_sha256: null,
    legacy_inventory_sha256: null,
    provider_transport: null,
    token_budget: null,
    timeout_seconds: null,
  });
  const bootstrapContext = platform.context(bootstrapPolicy, '901', 'bootstrap');
  const prepared = await runController(bootstrapContext, {
    command: 'bootstrap',
    bootstrap_ticket: bootstrapPolicy['bootstrap_ticket'],
  });
  assert.equal(prepared.status, 'accepted', prepared.reason);
  const genesisReceipt = record(record(prepared.record)['receipt']);
  const created = await runController(bootstrapContext, {
    command: 'bootstrap',
    bootstrap_ticket: bootstrapPolicy['bootstrap_ticket'],
    envelope: platform.upload(
      genesisReceipt,
      'receipt',
      stringField(genesisReceipt, 'transition_id'),
      'bootstrap',
    ),
  });
  assert.equal(created.status, 'accepted', created.reason);
  const anchors = record(created.record);
  const activation = platform.activation({
    genesis_head: anchors['genesis_head'],
    genesis_receipt_sha256: anchors['genesis_receipt_sha256'],
    legacy_inventory_sha256: anchors['legacy_inventory_sha256'],
    bootstrap_completed: true,
  });
  const checkpoint = await runController(bootstrapContext, { command: 'checkpoint' });
  assert.equal(checkpoint.status, 'accepted', checkpoint.reason);
  platform.upload(
    record(checkpoint.record),
    'checkpoint',
    stringField(genesisReceipt, 'transition_id'),
    'checkpoint',
  );
  const context = (runId: string): FactoryContext => {
    const ctx = platform.context(activation, runId);
    const route = `/repos/apolenkov/feynman/actions/runs/${runId}`;
    const run = { ...record(platform.facts.get(route)), run_started_at: '2026-10-12T00:03:00Z' };
    platform.facts.set(route, run);
    platform.facts.set(`${route}/attempts/1`, run);
    return ctx;
  };
  const identity = {
    repository_id: '1230959148',
    fingerprint_policy_revision: 'reviewed-v1',
    fingerprint: 'd'.repeat(64),
    issue_node_id: 'I_KEEP',
  };
  const lineage = sha256(identity);
  const marker = {
    repository_id: identity.repository_id,
    fingerprint_policy_revision: identity.fingerprint_policy_revision,
    fingerprint: identity.fingerprint,
  };
  const issue = {
    number: 42,
    node_id: 'I_KEEP',
    user: { id: 41898282, login: 'github-actions[bot]' },
    state: 'open',
    labels: [{ name: 'factory-fix' }],
    body: `<!-- factory-finding-v1 ${JSON.stringify(marker)} -->`,
    created_at: '2026-10-12T00:00:00Z',
  };
  platform.issues.push(issue);
  platform.facts.set('/repos/apolenkov/feynman/issues/42', issue);
  platform.facts.set('/repos/apolenkov/feynman/issues/42/events', [
    {
      id: 12,
      event: 'labeled',
      label: { name: 'factory-fix' },
      actor: { id: 23296915, login: 'apolenkov' },
    },
  ]);
  const registrationContext = context('902');
  const fields = {
    epoch_id: activation['epoch_id'],
    sequence: 1,
    parent_head: anchors['genesis_head'],
    parent_checkpoint_head: anchors['genesis_head'],
    repository_id: identity.repository_id,
    repository_full_name: 'apolenkov/feynman',
    workflow_id: '703',
    workflow_path: '.github/workflows/factory-control.yml',
    workflow_source_sha: platform.release,
    control_release_sha: platform.release,
    control_manifest_sha256: sha256(platform.manifest),
    default_ref: 'refs/heads/main',
    default_head: platform.release,
    run_id: '902',
    run_attempt: 1,
    event: 'workflow_dispatch',
    actor_id: '23296915',
    actor_login: 'apolenkov',
    actor_decision: 'approved-publisher',
    producer_phase: 'publication',
    request_key: sha256(marker),
    lineage_id: lineage,
    issue_node_id: identity.issue_node_id,
    issue_number: 42,
    fingerprint_policy_revision: identity.fingerprint_policy_revision,
    fingerprint: identity.fingerprint,
    baseline_sha: platform.release,
    current_source_head: platform.release,
    expected_transition: 'eligible',
    reservation_number: null,
    operation: null,
    aliases: [{ kind: 'issue', id: '42', head: null, original_identity_sha256: lineage }],
    outcome: 'confirmed',
    evidence: { scan: null, verifier: null },
  };
  const evidence = (phase: 'scan' | 'verifier', target: string): JsonRecord => {
    const core = produceReceipt({
      ...fields,
      producer_phase: phase,
      request_key: sha256({ phase, target }),
      lineage_id: null,
      issue_node_id: null,
      issue_number: null,
      fingerprint_policy_revision: null,
      fingerprint: null,
      baseline_sha: null,
      current_source_head: null,
      aliases: [],
      operation: {
        initial_claimed: true,
        retry_claimed: false,
        status: 'succeeded',
        payload_sha256: sha256(marker),
        target_id: target,
        expected_head: platform.release,
        result_id: null,
        reason: null,
      },
      outcome: phase === 'scan' ? 'complete' : 'confirmed',
    });
    const envelope = platform.upload(core, 'receipt', stringField(core, 'transition_id'), phase);
    const transport = record(envelope['transport']);
    return {
      artifact_id: transport['artifact_id'],
      archive_sha256: transport['archive_sha256'],
      receipt_sha256: envelope['receipt_sha256'],
      run_id: core['run_id'],
      run_attempt: core['run_attempt'],
      producer_job_id: transport['producer_job_id'],
      source_sha: core['workflow_source_sha'],
    };
  };
  const publication = produceReceipt({
    ...fields,
    evidence: {
      scan: evidence('scan', identity.fingerprint_policy_revision),
      verifier: evidence('verifier', identity.fingerprint),
    },
  });
  const register = await runController(registrationContext, {
    command: 'register',
    publication_authority: platform.upload(
      publication,
      'receipt',
      stringField(publication, 'transition_id'),
      'publication',
    ),
  });
  assert.equal(register.status, 'accepted', register.reason);
  const registerCore = record(register.record);
  const registered = await runController(registrationContext, {
    command: 'append',
    envelope: platform.upload(
      registerCore,
      'receipt',
      stringField(registerCore, 'transition_id'),
      'register',
    ),
  });
  assert.equal(registered.status, 'accepted', registered.reason);
  const reserveContext = context('903');
  const registrationCheckpoint = await runController(reserveContext, { command: 'checkpoint' });
  assert.equal(registrationCheckpoint.status, 'accepted', registrationCheckpoint.reason);
  platform.upload(
    record(registrationCheckpoint.record),
    'checkpoint',
    stringField(registerCore, 'transition_id'),
    'checkpoint',
  );
  const reserve = await runController(reserveContext, {
    command: 'reserve',
    issue_number: 42,
    event_id: '12',
    evidence: { scan: null, verifier: null },
  });
  assert.equal(reserve.status, 'accepted', reserve.reason);
  const reservation = record(reserve.record);
  const reserved = await runController(reserveContext, {
    command: 'append',
    envelope: platform.upload(
      reservation,
      'receipt',
      stringField(reservation, 'transition_id'),
      'reserve',
    ),
  });
  assert.equal(reserved.status, 'accepted', reserved.reason);
  const writerContext = context('904');
  const reservationCheckpoint = await runController(writerContext, { command: 'checkpoint' });
  assert.equal(reservationCheckpoint.status, 'accepted', reservationCheckpoint.reason);
  platform.upload(
    record(reservationCheckpoint.record),
    'checkpoint',
    stringField(reservation, 'transition_id'),
    'checkpoint',
  );
  const files = new Map(
    platform.manifest.map((entry) => [
      stringField(entry, 'path'),
      execFileSync(
        'git',
        ['--git-dir', platform.repository, 'cat-file', 'blob', stringField(entry, 'blob_sha')],
        { env: gitFixtureEnvironment() },
      ),
    ]),
  );
  files.set('application.ts', Buffer.from('export const repaired = true;\n'));
  const head = platform.commitFiles(files, [platform.release]);
  const delivered = platform.commitFiles(files, [head]);
  const branch = `factory/${lineage}/1`;
  platform.git(['update-ref', `refs/heads/${branch}`, head]);
  platform.git(['update-ref', 'refs/heads/main', delivered]);
  const patch = produceReceipt({
    ...reservation,
    producer_phase: 'patch',
    run_id: '904',
    sequence: 3,
    parent_head: record(reserved.record)['state_head'],
    parent_checkpoint_head: record(reserved.record)['state_head'],
    current_source_head: head,
    expected_transition: 'patch-ready',
    outcome: 'patch-ready',
  });
  const authority = platform.upload(patch, 'receipt', stringField(patch, 'transition_id'), 'patch');
  platform.pulls.push({
    number: 7,
    node_id: 'PR_KEEP',
    merged: true,
    merged_at: '2026-10-12T00:10:00Z',
    merge_commit_sha: delivered,
    body: `Fixes #42\n\nFactory lineage: ${lineage}`,
    head: { ref: branch, sha: head, repo: { id: 1230959148 } },
    base: { ref: 'main', repo: { id: 1230959148 } },
  });
  return {
    platform,
    context: context('905'),
    branch,
    head,
    delivered,
    input: {
      authority,
      branch,
      expected_head: head,
      delivered_head: delivered,
      lineage_id: lineage,
      pr_number: 7,
      delivered: true,
    },
  };
}

it('removes an authenticated merged remote branch only after real Git delivery and verifies its absence', async (t) => {
  const fixture = await remoteFixture(t);
  const result = await preserveOrRemoveBranch(fixture.context, fixture.input);
  assert.equal(result.status, 'accepted', result.reason);
  assert.throws(() =>
    fixture.platform.git(['show-ref', '--verify', `refs/heads/${fixture.branch}`]),
  );
  assert.equal(fixture.platform.git(['rev-parse', 'refs/heads/main']), fixture.delivered);
});

it('preserves unique, moved, open and unproved remote ownership while allowing no DELETE', async (t) => {
  for (const kind of [
    'unique',
    'moved',
    'open',
    'foreign',
    'missing-authority',
    'extra-pr',
    'revoked-label',
  ] as const) {
    await t.test(kind, async (child) => {
      const fixture = await remoteFixture(child);
      const pr = fixture.platform.pulls[0];
      assert.ok(pr);
      if (kind === 'unique')
        fixture.platform.git(['update-ref', 'refs/heads/main', fixture.platform.release]);
      if (kind === 'moved')
        fixture.platform.git(['update-ref', `refs/heads/${fixture.branch}`, fixture.delivered]);
      if (kind === 'open')
        fixture.platform.pulls.splice(0, 1, { ...pr, merged: false, merged_at: null });
      if (kind === 'foreign')
        fixture.platform.pulls.splice(0, 1, {
          ...pr,
          head: { ref: fixture.branch, sha: fixture.head, repo: { id: 99 } },
        });
      if (kind === 'extra-pr') fixture.platform.pulls.push({ ...pr, number: 8 });
      if (kind === 'revoked-label')
        fixture.platform.facts.set('/repos/apolenkov/feynman/issues/42', {
          ...record(fixture.platform.facts.get('/repos/apolenkov/feynman/issues/42')),
          labels: [],
        });
      const expected = fixture.platform.git(['rev-parse', `refs/heads/${fixture.branch}`]);
      const result = await preserveOrRemoveBranch(
        fixture.context,
        kind === 'missing-authority' ? { ...fixture.input, authority: null } : fixture.input,
      );
      assert.equal(result.status, 'preserved', result.reason);
      assert.equal(fixture.platform.git(['rev-parse', `refs/heads/${fixture.branch}`]), expected);
      assert.equal(
        fixture.platform.requests.some((request) => request.method === 'DELETE'),
        false,
      );
    });
  }
});

it('preserves a squash-delivered branch: squash history has no ancestry to the branch head, so no DELETE is attempted', async (t) => {
  const fixture = await remoteFixture(t);
  const files = new Map(
    fixture.platform.manifest.map((entry) => [
      stringField(entry, 'path'),
      fs.readFileSync(stringField(entry, 'path')),
    ]),
  );
  files.set('application.ts', Buffer.from('export const repaired = true;\n'));
  // A squash on the release with the branch's exact tree in the same second would be the branch head itself.
  files.set('SQUASHED', Buffer.from('squash\n'));
  const squash = fixture.platform.commitFiles(files, [fixture.platform.release]);
  assert.notEqual(squash, fixture.head);
  fixture.platform.git(['update-ref', 'refs/heads/main', squash]);
  const pr = fixture.platform.pulls[0];
  assert.ok(pr);
  fixture.platform.pulls.splice(0, 1, { ...pr, merge_commit_sha: squash });
  const result = await preserveOrRemoveBranch(fixture.context, {
    ...fixture.input,
    delivered_head: squash,
  });
  assert.equal(result.status, 'preserved', result.reason);
  assert.match(result.reason, /unproven squash delivery/);
  assert.equal(fixture.platform.git(['rev-parse', `refs/heads/${fixture.branch}`]), fixture.head);
  assert.equal(
    fixture.platform.requests.some((request) => request.method === 'DELETE'),
    false,
  );
});

it('preserves a remote head moved by another writer after the delivery check', async (t) => {
  const fixture = await remoteFixture(t);
  const fetch = fixture.platform.fetch.bind(fixture.platform);
  t.mock.method(
    fixture.platform,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input);
      const response = await fetch(input, init);
      if (url.pathname.endsWith(`/compare/${fixture.head}...${fixture.delivered}`))
        fixture.platform.git(['update-ref', `refs/heads/${fixture.branch}`, fixture.delivered]);
      return response;
    },
  );
  const result = await preserveOrRemoveBranch(fixture.context, fixture.input);
  assert.equal(result.status, 'preserved', result.reason);
  assert.equal(
    fixture.platform.git(['rev-parse', `refs/heads/${fixture.branch}`]),
    fixture.delivered,
  );
  assert.equal(
    fixture.platform.requests.some((request) => request.method === 'DELETE'),
    false,
  );
});

it('reports ambiguous deletion acknowledgement and unavailable post-delete readback without retrying', async (t) => {
  for (const kind of ['acknowledgement', 'readback'] as const) {
    await t.test(kind, async (child) => {
      const fixture = await remoteFixture(child);
      const fetch = fixture.platform.fetch.bind(fixture.platform);
      let deleted = false;
      child.mock.method(
        fixture.platform,
        'fetch',
        async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
          const url = new URL(input instanceof Request ? input.url : input);
          if (
            deleted &&
            kind === 'readback' &&
            url.pathname.endsWith(`/git/ref/heads/${fixture.branch}`)
          )
            return new Response('{}', { status: 503 });
          const response = await fetch(input, init);
          if (init?.method === 'DELETE') {
            deleted = true;
            if (kind === 'acknowledgement') return new Response('{}', { status: 503 });
          }
          return response;
        },
      );
      const result = await preserveOrRemoveBranch(fixture.context, fixture.input);
      assert.equal(result.status, 'needs-human', result.reason);
      assert.equal(
        fixture.platform.requests.filter((request) => request.method === 'DELETE').length,
        1,
      );
      assert.throws(() =>
        fixture.platform.git(['show-ref', '--verify', `refs/heads/${fixture.branch}`]),
      );
      assert.equal(fixture.platform.git(['rev-parse', 'refs/heads/main']), fixture.delivered);
    });
  }
});
