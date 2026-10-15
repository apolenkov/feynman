import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  canonicalBytes,
  parseProtocol,
  loadFactoryPolicy,
  createFactoryContext,
} from '../scripts/factory-protocol.ts';
import { runController, submitIngress } from '../scripts/factory-control.ts';

// AC06–13 primary owner. NEW CONTRACT absence is not behavioral baseline RED.
it('implements RFC8785 finite-number ordering without normalizing Unicode and rejects lone surrogates', () => {
  assert.equal(canonicalBytes({ z: 1e30, a: 'e\u0301' }).toString(), '{"a":"é","z":1e+30}');
  assert.throws(() => canonicalBytes({ a: Number.NaN }), /finite/);
  assert.throws(() => canonicalBytes({ a: '\ud800' }), /surrogate/);
});

it('enforces closed canonical protocol records including genesis-only null bindings', () => {
  const ticket = {
    schema: 'factory/v1',
    repository_id: '1230959148',
    epoch_id: 'epoch-1',
    control_release_sha: 'a'.repeat(40),
    legacy_mode: 'quarantine',
    legacy_cutoff_sha: 'b'.repeat(40),
    legacy_cutoff_at: '2026-10-12T00:00:00Z',
  };
  assert.deepEqual(parseProtocol(canonicalBytes(ticket), 'ticket'), ticket);
  assert.throws(
    () => parseProtocol(canonicalBytes({ ...ticket, future_policy: null }), 'ticket'),
    /fields/,
  );
  assert.throws(
    () => parseProtocol(Buffer.from('{"schema":"factory/v1","schema":"factory/v1"}'), 'ticket'),
    /canonical/,
  );
  assert.throws(
    () => parseProtocol(Buffer.from(JSON.stringify(ticket, null, 2)), 'ticket'),
    /canonical/,
  );
});

it('denies all manual, ingress, reservation and recovery effects under the reviewed disabled policy', async () => {
  const context = createFactoryContext(loadFactoryPolicy(), '');
  for (const command of ['admit', 'reserve', 'recover', 'outcome', 'bootstrap', 'effect-gate']) {
    const result = await runController(context, { command, issue_number: 1, run_attempt: 1 });
    assert.equal(result.status, 'denied');
    assert.match(result.reason, /disabled/);
  }
  assert.equal((await submitIngress(context, { issue_number: 1 })).status, 'denied');
});

import { FactoryPlatform } from './helpers/night-factory-transport.ts';
import {
  record,
  stringField,
  arrayField,
  sha256,
  produceReceipt,
  resolveFactoryContext,
  verifyControlSource,
  githubRequest,
  githubPages,
  verifyAuthority,
  readAuthorityArchive,
  resolveReceipt,
  producerActor,
  parseFactoryJson,
} from '../scripts/factory-protocol.ts';
import type { JsonRecord } from '../scripts/factory-protocol.ts';
import type { TestContext } from 'node:test';

async function bootstrapped(test: TestContext): Promise<{
  platform: FactoryPlatform;
  activation: JsonRecord;
  genesis: JsonRecord;
  receipt: JsonRecord;
}> {
  const platform = new FactoryPlatform(test);
  const reviewed = platform.activation({
    activation: false,
    bootstrap_completed: false,
    genesis_head: null,
    genesis_receipt_sha256: null,
    legacy_inventory_sha256: null,
    provider_transport: null,
    token_budget: null,
    timeout_seconds: null,
  });
  const context = platform.context(reviewed, '901', 'bootstrap');
  const prepared = await runController(context, {
    command: 'bootstrap',
    bootstrap_ticket: reviewed['bootstrap_ticket'],
  });
  assert.equal(prepared.status, 'accepted', prepared.reason);
  const receipt = record(record(prepared.record)['receipt']);
  const committed = await runController(context, {
    command: 'bootstrap',
    bootstrap_ticket: reviewed['bootstrap_ticket'],
    envelope: platform.upload(
      receipt,
      'receipt',
      stringField(receipt, 'transition_id'),
      'bootstrap',
    ),
  });
  assert.equal(committed.status, 'accepted', committed.reason);
  const genesis = record(committed.record);
  const checkpoint = await runController(context, { command: 'checkpoint' });
  assert.equal(checkpoint.status, 'accepted', checkpoint.reason);
  platform.upload(
    record(checkpoint.record),
    'checkpoint',
    stringField(receipt, 'transition_id'),
    'checkpoint',
  );
  // Data-only reviewed A has no extra output fields from the bootstrap result.
  const { bootstrap_completed: _completed, ...anchors } = genesis;
  return {
    platform,
    activation: platform.activation({ ...anchors, bootstrap_completed: true }),
    genesis,
    receipt,
  };
}
function laterContext(platform: FactoryPlatform, activation: JsonRecord, runId: string) {
  const context = platform.context(activation, runId);
  const route = `/repos/apolenkov/feynman/actions/runs/${runId}`;
  const run = { ...record(platform.facts.get(route)), run_started_at: '2026-10-12T00:03:00Z' };
  platform.facts.set(route, run);
  platform.facts.set(`${route}/attempts/1`, run);
  return context;
}
function findingReceipt(
  platform: FactoryPlatform,
  activation: JsonRecord,
  genesis: JsonRecord,
  runId: string,
  phase: string,
  overrides: JsonRecord = {},
): JsonRecord {
  const identity = {
    repository_id: '1230959148',
    fingerprint_policy_revision: 'reviewed-v1',
    fingerprint: 'd'.repeat(64),
    issue_node_id: 'I_CANONICAL',
  };
  const publicationProof =
    phase === 'publication'
      ? publicationEvidence(platform, activation, genesis)
      : { scan: null, verifier: null };
  return produceReceipt({
    epoch_id: activation['epoch_id'],
    sequence: 1,
    parent_head: genesis['genesis_head'],
    parent_checkpoint_head: genesis['genesis_head'],
    repository_id: '1230959148',
    repository_full_name: 'apolenkov/feynman',
    workflow_id: '703',
    workflow_path: '.github/workflows/factory-control.yml',
    workflow_source_sha: platform.release,
    control_release_sha: platform.release,
    control_manifest_sha256: sha256(platform.manifest),
    default_ref: 'refs/heads/main',
    default_head: platform.release,
    run_id: runId,
    run_attempt: 1,
    event: 'workflow_dispatch',
    actor_id: '23296915',
    actor_login: 'apolenkov',
    actor_decision: ['scan', 'verifier', 'publication'].includes(phase)
      ? 'approved-publisher'
      : 'owner',
    producer_phase: phase,
    request_key: sha256({ phase, runId }),
    lineage_id: sha256(identity),
    issue_node_id: 'I_CANONICAL',
    issue_number: 42,
    fingerprint_policy_revision: 'reviewed-v1',
    fingerprint: 'd'.repeat(64),
    baseline_sha: platform.release,
    current_source_head: platform.release,
    expected_transition: 'eligible',
    reservation_number: null,
    operation: null,
    aliases: [{ kind: 'issue', id: '42', head: null, original_identity_sha256: sha256(identity) }],
    outcome: 'confirmed',
    evidence: publicationProof,
    ...overrides,
  });
}

function publicationEvidence(
  platform: FactoryPlatform,
  activation: JsonRecord,
  genesis: JsonRecord,
): JsonRecord {
  const cached = platform.facts.get('fixture:publication-evidence');
  if (cached !== undefined) return record(cached);
  const references: Record<string, unknown> = {};
  for (const [phase, runId, target] of [
    ['scan', '9101', 'reviewed-v1'],
    ['verifier', '9102', 'd'.repeat(64)],
  ] as const) {
    platform.context(activation, runId);
    const detached = findingReceipt(platform, activation, genesis, runId, phase, {
      lineage_id: null,
      issue_node_id: null,
      issue_number: null,
      fingerprint_policy_revision: null,
      fingerprint: null,
      baseline_sha: null,
      current_source_head: null,
      reservation_number: null,
      aliases: [],
      operation: {
        initial_claimed: true,
        retry_claimed: false,
        status: 'succeeded',
        payload_sha256: sha256({ fingerprint: 'd'.repeat(64), source_sha: platform.release }),
        target_id: target,
        expected_head: platform.release,
        result_id: null,
        reason: null,
      },
      outcome: phase === 'verifier' ? 'confirmed' : 'complete',
    });
    const envelope = platform.upload(
      detached,
      'receipt',
      stringField(detached, 'transition_id'),
      phase,
    );
    const transport = record(envelope['transport']);
    references[phase] = {
      artifact_id: transport['artifact_id'],
      archive_sha256: transport['archive_sha256'],
      receipt_sha256: envelope['receipt_sha256'],
      run_id: runId,
      run_attempt: 1,
      producer_job_id: transport['producer_job_id'],
      source_sha: platform.release,
    };
  }
  platform.facts.set('fixture:publication-evidence', references);
  return references;
}
it('creates one real Git genesis with null G/P, authentic external checkpoint and public-source positive recovery', async (test) => {
  const { platform, activation, genesis } = await bootstrapped(test);
  const context = laterContext(platform, activation, '902');
  const recovered = await runController(context, { command: 'recover' });
  assert.equal(recovered.status, 'accepted', recovered.reason);
  assert.equal(record(recovered.record)['state_head'], genesis['genesis_head']);
  assert.equal(platform.git(['show', '-s', '--format=%P', String(genesis['genesis_head'])]), '');
  const denied = await runController(
    platform.context(
      platform.activation({
        activation: false,
        bootstrap_completed: false,
        genesis_head: null,
        genesis_receipt_sha256: null,
        legacy_inventory_sha256: null,
      }),
      '903',
      'bootstrap',
    ),
    { command: 'bootstrap', bootstrap_ticket: activation['bootstrap_ticket'] },
  );
  assert.equal(denied.status, 'denied');
  assert.match(denied.reason, /already exists/);
  const policy = await resolveFactoryContext(context);
  await verifyControlSource(policy);
  for (const visibility of ['private', 'internal', null]) {
    platform.overrides.set('/repos/apolenkov/feynman', {
      ...record(platform.facts.get('/repos/apolenkov/feynman')),
      visibility,
    });
    await assert.rejects(verifyControlSource(policy), /public visibility/);
  }
  platform.overrides.clear();
  const requestCount = platform.requests.length;
  for (const route of [
    'https://evil.example.invalid/repos/apolenkov/feynman',
    '/repos/apolenkov/feynman/../../someone/else',
    '/repos/apolenkov/feynman/%2e%2e/other',
    '/repos/apolenkov/feynman%2f..%2felse',
  ])
    await assert.rejects(githubRequest(policy, route), /Foreign/);
  assert.equal(
    platform.requests.length,
    requestCount,
    'No authenticated request escapes normalized fixed repository',
  );
});

it('registers a provably new confirmed issue, consumes two immutable reservations, refuses a third and preserves aliases', async (test) => {
  const { platform, activation, genesis } = await bootstrapped(test);
  const identity = {
    repository_id: '1230959148',
    fingerprint_policy_revision: 'reviewed-v1',
    fingerprint: 'd'.repeat(64),
  };
  const issue = {
    number: 42,
    node_id: 'I_CANONICAL',
    user: { id: 23296915, login: 'apolenkov' },
    state: 'open',
    labels: [{ name: 'factory-fix' }],
    body: `<!-- factory-finding-v1 ${JSON.stringify(identity)} -->`,
    created_at: '2026-10-12T00:00:00Z',
  };
  platform.issues.push(issue);
  platform.facts.set('/repos/apolenkov/feynman/issues/42', issue);
  platform.facts.set(
    '/repos/apolenkov/feynman/issues/42/events',
    [12, 13].map((id) => ({
      id,
      event: 'labeled',
      label: { name: 'factory-fix' },
      actor: { id: 23296915, login: 'apolenkov' },
    })),
  );
  const context = laterContext(platform, activation, '902');
  const publication = findingReceipt(platform, activation, genesis, '902', 'publication');
  const registration = await runController(context, {
    command: 'register',
    publication_authority: platform.upload(
      publication,
      'receipt',
      stringField(publication, 'transition_id'),
      'publication',
    ),
  });
  assert.equal(registration.status, 'accepted', registration.reason);
  const registerCore = record(registration.record);
  const append = await runController(context, {
    command: 'append',
    envelope: platform.upload(
      registerCore,
      'receipt',
      stringField(registerCore, 'transition_id'),
      'register',
    ),
  });
  assert.equal(append.status, 'accepted', append.reason);
  let head = stringField(record(append.record), 'state_head');
  platform.facts.set('/repos/apolenkov/feynman/issues/42', { ...issue, labels: [] });
  const removed = await runController(context, {
    command: 'reserve',
    issue_number: 42,
    event_id: '12',
  });
  assert.equal(removed.status, 'denied');
  assert.match(removed.reason, /Current owner opt-in/);
  assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), head);
  platform.facts.set('/repos/apolenkov/feynman/issues/42', issue);
  for (const runId of ['903', '904']) {
    const current = laterContext(platform, activation, runId);
    const checkpoint = await runController(current, { command: 'checkpoint' });
    assert.equal(checkpoint.status, 'accepted', checkpoint.reason);
    const checkpointFile = JSON.parse(platform.git(['show', `${head}:checkpoint.json`])) as unknown;
    platform.upload(
      record(checkpoint.record),
      'checkpoint',
      stringField(record(checkpointFile), 'last_transition_id'),
      'checkpoint',
    );
    const reserve = await runController(current, {
      command: 'reserve',
      issue_number: 42,
      event_id: runId === '903' ? '12' : '13',
      evidence: { scan: null, verifier: null },
    });
    assert.equal(reserve.status, 'accepted', reserve.reason);
    const core = record(reserve.record);
    const reserved = await runController(current, {
      command: 'append',
      envelope: platform.upload(core, 'receipt', stringField(core, 'transition_id'), 'reserve'),
    });
    assert.equal(reserved.status, 'accepted', reserved.reason);
    head = stringField(record(reserved.record), 'state_head');
  }
  const third = await runController(laterContext(platform, activation, '905'), {
    command: 'reserve',
    issue_number: 42,
    event_id: '12',
    evidence: { scan: null, verifier: null },
  });
  assert.equal(third.status, 'denied');
  assert.match(third.reason, /exhausted/);
  const lineage = parseProtocol(
    Buffer.from(
      platform.git(['show', `${head}:lineages/${String(publication['lineage_id'])}.json`]),
    ),
    'lineage',
  );
  assert.equal(arrayField(lineage, 'reservations').length, 2);
  assert.equal(arrayField(lineage, 'aliases').length, 1);
  assert.equal(
    platform.git(['rev-list', '--count', String(genesis['genesis_head']) + '..' + head]),
    '3',
  );
  const duplicate = await runController(laterContext(platform, activation, '906'), {
    command: 'register',
    publication_authority: platform.upload(
      findingReceipt(platform, activation, genesis, '906', 'publication'),
      'receipt',
      stringField(
        findingReceipt(platform, activation, genesis, '906', 'publication'),
        'transition_id',
      ),
      'publication',
    ),
  });
  assert.equal(duplicate.status, 'denied');
  assert.match(duplicate.reason, /aliased identity/);
});

it('authenticates actual receipt transport before trusting core fields and counts authoritative unappended reservations as spent', async (test) => {
  const { platform, activation, genesis } = await bootstrapped(test);
  const context = laterContext(platform, activation, '902');
  const core = findingReceipt(platform, activation, genesis, '902', 'reserve', {
    reservation_number: 1,
    expected_transition: 'reserved',
    outcome: 'consumed',
  });
  const envelope = platform.upload(core, 'receipt', stringField(core, 'transition_id'), 'reserve');
  const resolved = await resolveFactoryContext(context);
  assert.deepEqual(await verifyAuthority(resolved, envelope), core);
  const recovered = await runController(context, { command: 'recover' });
  assert.equal(recovered.status, 'denied');
  assert.match(recovered.reason, /orphan reservation/);
  assert.throws(() => produceReceipt({ ...core, run_attempt: 2 }), /run_attempt/);
  for (const mutation of [
    { workflow_id: '704' },
    { workflow_source_sha: 'f'.repeat(40) },
    { control_manifest_sha256: 'e'.repeat(64) },
  ]) {
    const corrupt = produceReceipt({ ...core, ...mutation });
    const transported = platform.upload(
      corrupt,
      'receipt',
      stringField(corrupt, 'transition_id'),
      'reserve',
    );
    await assert.rejects(verifyAuthority(resolved, transported), /./);
  }
  assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), genesis['genesis_head']);
});

it('uses complete Link pagination and rejects terminal count mismatch', async (test) => {
  const platform = new FactoryPlatform(test);
  const context = platform.context(platform.activation());
  platform.facts.set('/repos/apolenkov/feynman/example', {
    total_count: 101,
    records: Array.from({ length: 101 }, (_, id) => ({ id })),
  });
  assert.equal(
    (await githubPages(context, '/repos/apolenkov/feynman/example', 'records')).length,
    101,
  );
  platform.overrides.set('/repos/apolenkov/feynman/example', {
    total_count: 2,
    records: [{ id: 1 }],
  });
  await assert.rejects(
    githubPages(context, '/repos/apolenkov/feynman/example', 'records'),
    /Incomplete pagination count/,
  );
});

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';
import { gitFixtureEnvironment } from './helpers/git-environment.ts';
import { authorityMarker, emitAuthority } from '../scripts/factory-protocol.ts';

it('binds every checkpoint marker and core field to independent Git and actual run facts after legitimate transport rehash', async (test) => {
  const { platform, activation, genesis, receipt } = await bootstrapped(test);
  const context = laterContext(platform, activation, '902');
  const artifact = platform.artifacts.find((candidate) =>
    String(candidate['name']).includes('-checkpoint-'),
  );
  assert.ok(artifact !== undefined);
  const artifactId = String(artifact['id']);
  const jobs = record(
    platform.facts.get('/repos/apolenkov/feynman/actions/runs/901/attempts/1/jobs'),
  )['jobs'];
  assert.ok(Array.isArray(jobs));
  const job = jobs
    .map(record)
    .find((candidate) => candidate['name'] === 'factory-authority-checkpoint');
  assert.ok(job !== undefined);
  const jobId = String(job['id']);
  const originalLog = platform.logs.get(jobId);
  assert.ok(originalLog !== undefined);
  const originalMarker = authorityMarker(originalLog);
  const originalCore = parseProtocol(
    execFileSync('bsdtar', ['-xOf', '-', 'checkpoint.json'], {
      input: platform.archives.get(artifactId),
    }),
    'checkpoint-core',
  );
  const rewrite = (core: JsonRecord, markerChanges: JsonRecord = {}) => {
    const directory = path.join(platform.root, 'checkpoint-corruption');
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'checkpoint.json'), canonicalBytes(core));
    const zip = execFileSync('bsdtar', [
      '--format=zip',
      '-cf',
      '-',
      '-C',
      directory,
      'checkpoint.json',
    ]);
    const archiveDigest = sha256(zip);
    platform.archives.set(artifactId, zip);
    const actualArtifact = { ...artifact, digest: `sha256:${archiveDigest}` };
    platform.artifacts.splice(
      platform.artifacts.findIndex((item) => String(item['id']) === artifactId),
      1,
      actualArtifact,
    );
    platform.facts.set(`/repos/apolenkov/feynman/actions/artifacts/${artifactId}`, actualArtifact);
    const marker = {
      ...originalMarker,
      archive_sha256: archiveDigest,
      receipt_sha256: sha256(core),
      ...markerChanges,
    };
    platform.logs.set(jobId, Buffer.from(`2026-10-12T00:01:01Z ${emitAuthority(marker)}\n`));
  };
  assert.equal((await runController(context, { command: 'recover' })).status, 'accepted');
  const markerCases: readonly [string, JsonRecord, RegExp][] = [
    ['kind', { kind: 'receipt' }, /Checkpoint actual output/],
    ['phase', { phase: 'reserve' }, /Checkpoint actual output/],
    ['artifact_id', { artifact_id: '77777' }, /Checkpoint actual output/],
    ['run_attempt', { run_attempt: 2 }, /Checkpoint actual output/],
    ['transition_id', { transition_id: 'e'.repeat(64) }, /independent Git/],
    ['receipt_sha256', { receipt_sha256: 'e'.repeat(64) }, /Upload output\/core/],
    ['run_id', { run_id: '999' }, /Marker replay/],
    ['workflow_id', { workflow_id: '704' }, /Marker replay/],
    ['workflow_source_sha', { workflow_source_sha: 'e'.repeat(40) }, /Marker replay/],
    ['control_release_sha', { control_release_sha: 'e'.repeat(40) }, /Marker replay/],
    ['archive_sha256', { archive_sha256: 'e'.repeat(64) }, /Archive digest/],
  ];
  for (const [field, changes, reason] of markerCases)
    await test.test(`marker.${field}: ${reason.source}`, async () => {
      rewrite(originalCore, changes);
      const result = await runController(context, { command: 'recover' });
      assert.equal(result.status, 'denied');
      assert.match(result.reason, reason);
    });
  const coreCases: readonly [string, JsonRecord, RegExp][] = [
    ['epoch_id', { epoch_id: 'foreign-epoch' }, /epoch\/sequence\/predecessor/],
    [
      'sequence',
      { sequence: 1, previous_checkpoint_head: genesis['genesis_head'] },
      /epoch\/sequence\/predecessor/,
    ],
    ['checkpoint_file_sha256', { checkpoint_file_sha256: 'e'.repeat(64) }, /file\/payload/],
    ['state_payload_sha256', { state_payload_sha256: 'e'.repeat(64) }, /file\/payload/],
    ['receipt_sha256', { receipt_sha256: 'e'.repeat(64) }, /referenced receipt/],
    ['state_head', { state_head: 'e'.repeat(40) }, /status 404/],
    ['run_id', { run_id: '999' }, /status 404/],
    ['workflow_id', { workflow_id: '704' }, /Foreign authority release/],
    ['workflow_source_sha', { workflow_source_sha: 'e'.repeat(40) }, /attempt provenance/],
    ['control_release_sha', { control_release_sha: 'e'.repeat(40) }, /Foreign authority release/],
    [
      'control_manifest_sha256',
      { control_manifest_sha256: 'e'.repeat(64) },
      /Foreign authority release/,
    ],
  ];
  for (const [field, changes, reason] of coreCases)
    await test.test(`core.${field}: ${reason.source}`, async () => {
      rewrite({ ...originalCore, ...changes });
      const result = await runController(context, { command: 'recover' });
      assert.equal(result.status, 'denied');
      assert.match(result.reason, reason);
    });
  for (const [field, value] of [
    ['kind', 'receipt'],
    ['schema', 'factory/v2'],
    ['run_attempt', 2],
    ['previous_checkpoint_head', genesis['genesis_head']],
  ] as const) {
    rewrite({ ...originalCore, [field]: value });
    const result = await runController(context, { command: 'recover' });
    assert.equal(result.status, 'denied');
    assert.match(result.reason, /Invalid protocol|Checkpoint predecessor/);
  }
  rewrite(originalCore);
  const final = await runController(context, { command: 'recover' });
  assert.equal(final.status, 'accepted', final.reason);
  assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), genesis['genesis_head']);
  assert.equal(originalCore['receipt_sha256'], sha256(receipt));
  assert.notEqual(
    originalMarker['receipt_sha256'],
    originalCore['receipt_sha256'],
    'Outer digest hashes checkpoint core; inner digest refers to preceding receipt',
  );
});

it('accepts exactly 100 intervening attempts despite older history and refuses the 101st including old queued attempts', async (test) => {
  const { platform, activation } = await bootstrapped(test);
  const context = laterContext(platform, activation, '902');
  const current = record(platform.facts.get('/repos/apolenkov/feynman/actions/runs/902'));
  const add = (id: string, started: string, updated: string, status: string) => {
    const run = {
      ...current,
      id: Number(id),
      run_started_at: started,
      updated_at: updated,
      status,
      run_attempt: 1,
    };
    platform.runs.push(run);
    platform.facts.set(`/repos/apolenkov/feynman/actions/runs/${id}/attempts/1`, run);
    platform.facts.set(`/repos/apolenkov/feynman/actions/runs/${id}/attempts/1/jobs`, {
      jobs: [],
      total_count: 0,
    });
  };
  for (let index = 0; index < 120; index++)
    add(String(2000 + index), '2026-10-11T00:00:00Z', '2026-10-11T00:01:00Z', 'completed');
  for (let index = 0; index < 99; index++)
    add(
      String(3000 + index),
      index === 0 ? '2026-10-11T00:00:00Z' : '2026-10-12T00:03:00Z',
      '2026-10-12T00:04:00Z',
      'completed',
    );
  const hundred = await runController(context, { command: 'recover' });
  assert.equal(hundred.status, 'accepted', hundred.reason);
  add('4000', '2026-10-11T00:00:00Z', '2026-10-11T00:01:00Z', 'queued');
  const hundredOne = await runController(context, { command: 'recover' });
  assert.equal(hundredOne.status, 'denied');
  assert.match(hundredOne.reason, /100 intervening controller attempts/);
});

it('rejects pinned malformed activation registries and unknown budgets independently of the positive public source', async (test) => {
  const platform = new FactoryPlatform(test);
  const activation = platform.activation();
  const registry = arrayField(activation, 'workflow_registry').map(record);
  for (const [name, value] of [
    ['duplicate paths', [registry[0], registry[0], registry[2], registry[3]]],
    [
      'duplicate IDs',
      registry.map((entry, index) => (index === 1 ? { ...entry, id: registry[0]?.['id'] } : entry)),
    ],
    [
      'controller role',
      registry.map((entry, index) => (index === 2 ? { ...entry, id: '999' } : entry)),
    ],
  ] as const) {
    await assert.rejects(
      resolveFactoryContext(platform.context({ ...activation, workflow_registry: value })),
      /executable workflow/,
      name,
    );
  }
  for (const key of ['token_budget', 'timeout_seconds', 'provider_transport']) {
    const result = await runController(
      platform.context({ ...activation, [key]: null }, String(950 + platform.runs.length)),
      { command: 'source-preflight' },
    );
    assert.equal(result.status, 'denied');
    assert.match(result.reason, /Unknown|Invalid integer/);
  }
});

async function registeredFactory(test: TestContext, additionalIssues: readonly JsonRecord[] = []) {
  const fixture = await bootstrapped(test);
  const { platform, activation, genesis } = fixture;
  const identity = {
    repository_id: '1230959148',
    fingerprint_policy_revision: 'reviewed-v1',
    fingerprint: 'd'.repeat(64),
  };
  const issue = {
    number: 42,
    node_id: 'I_CANONICAL',
    user: { id: 23296915, login: 'apolenkov' },
    state: 'open',
    labels: [{ name: 'factory-fix' }],
    body: `<!-- factory-finding-v1 ${JSON.stringify(identity)} -->`,
    created_at: '2026-10-12T00:00:00Z',
  };
  platform.issues.push(issue, ...additionalIssues);
  platform.facts.set('/repos/apolenkov/feynman/issues/42', issue);
  platform.facts.set('/repos/apolenkov/feynman/issues/42/events', [
    {
      id: 12,
      event: 'labeled',
      label: { name: 'factory-fix' },
      actor: { id: 23296915, login: 'apolenkov' },
    },
  ]);
  const registrationContext = laterContext(platform, activation, '902');
  const publication = findingReceipt(platform, activation, genesis, '902', 'publication');
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
  const context = laterContext(platform, activation, '903');
  const checkpoint = await runController(context, { command: 'checkpoint' });
  assert.equal(checkpoint.status, 'accepted', checkpoint.reason);
  platform.upload(
    record(checkpoint.record),
    'checkpoint',
    stringField(registerCore, 'transition_id'),
    'checkpoint',
  );
  const reserve = await runController(context, {
    command: 'reserve',
    issue_number: 42,
    event_id: '12',
  });
  assert.equal(reserve.status, 'accepted', reserve.reason);
  return {
    ...fixture,
    context,
    reserve: record(reserve.record),
    head: stringField(record(registered.record), 'state_head'),
  };
}

it('AC09 preserves both native Git siblings when an external writer wins between append preflight and ordinary fast-forward publication', async (test) => {
  const fixture = await registeredFactory(test);
  const { platform, context, reserve, head } = fixture;
  const envelope = platform.upload(
    reserve,
    'receipt',
    stringField(reserve, 'transition_id'),
    'reserve',
  );
  const tree = platform.git(['rev-parse', `${head}^{tree}`]);
  const sibling = execFileSync(
    'git',
    ['--git-dir', platform.repository, 'commit-tree', tree, '-p', head],
    {
      env: {
        ...gitFixtureEnvironment(),
        GIT_AUTHOR_NAME: 'Sibling writer',
        GIT_AUTHOR_EMAIL: 'sibling@example.invalid',
        GIT_COMMITTER_NAME: 'Sibling writer',
        GIT_COMMITTER_EMAIL: 'sibling@example.invalid',
      },
      input: 'fixture: independent sibling\n',
      encoding: 'utf8',
    },
  ).trim();
  const fetch = platform.fetch.bind(platform);
  const observed: { candidate: string | null } = { candidate: null };
  test.mock.method(
    platform,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (
        init?.method === 'PATCH' &&
        url.pathname === '/repos/apolenkov/feynman/git/refs/heads/factory-state'
      ) {
        const payload: unknown = JSON.parse(typeof init.body === 'string' ? init.body : '{}');
        observed.candidate = stringField(record(payload), 'sha');
        assert.equal(record(payload)['force'], false);
        execFileSync(
          'git',
          [
            '--git-dir',
            platform.repository,
            'update-ref',
            'refs/heads/factory-state',
            sibling,
            head,
          ],
          { env: gitFixtureEnvironment() },
        );
      }
      return await fetch(input, init);
    },
  );
  const result = await runController(context, { command: 'append', envelope });
  assert.equal(result.status, 'denied');
  assert.match(result.reason, /Append ambiguous\/conflicting/);
  assert.ok(
    observed.candidate !== null,
    'Native sibling action occurred at the production publication boundary',
  );
  assert.notEqual(observed.candidate, sibling);
  assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), sibling);
  for (const commit of [observed.candidate, sibling]) {
    assert.equal(platform.git(['cat-file', '-t', commit]), 'commit');
    assert.equal(platform.git(['show', '-s', '--format=%P', commit]), head);
  }
  assert.equal(
    (await runController(context, { command: 'effect-gate', issue_number: 42, event_id: '12' }))
      .status,
    'denied',
  );
});

it('AC08 interrupts a real Node append at observed Git publication and retains authenticated orphan consumption without refund', async (test) => {
  const { platform, activation, context, reserve, head } = await registeredFactory(test);
  const envelope = platform.upload(
    reserve,
    'receipt',
    stringField(reserve, 'transition_id'),
    'reserve',
  );
  const controllerUrl = pathToFileURL(path.resolve('scripts/factory-control.ts')).href;
  const script = `import { runController } from ${JSON.stringify(controllerUrl)};
const pending = new Map(); let serial = 0;
process.on('message', message => {
  const resolve = pending.get(message.id);
  if (resolve === undefined) return;
  pending.delete(message.id);
  resolve(new Response([204, 205, 304].includes(message.status) ? null : Buffer.from(message.body, 'base64'), { status: message.status, headers: message.headers }));
});
globalThis.fetch = (input, init = {}) => new Promise(resolve => {
  const id = serial++; pending.set(id, resolve);
  process.send({ type: 'request', id, url: String(input), method: init.method ?? 'GET', body: init.body });
});
const result = await runController(${JSON.stringify(context)}, ${JSON.stringify({ command: 'append', envelope })});
process.send({ type: 'result', result }); process.disconnect();
`;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: process.cwd(),
    env: {
      PATH: process.env['PATH'],
      HOME: platform.root,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_NOSYSTEM: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  test.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  let output = '';
  child.stdout?.on('data', (bytes: Buffer) => {
    output += bytes.toString();
  });
  child.stderr?.on('data', (bytes: Buffer) => {
    output += bytes.toString();
  });
  const observed: { candidate: string | null } = { candidate: null };
  const responses: Promise<void>[] = [];
  child.on('message', (value: unknown) => {
    const message = record(value);
    if (message['type'] === 'result') {
      output += JSON.stringify(message['result']);
      return;
    }
    if (message['type'] !== 'request') return;
    const url = stringField(message, 'url');
    const method = stringField(message, 'method');
    if (
      method === 'PATCH' &&
      new URL(url).pathname === '/repos/apolenkov/feynman/git/refs/heads/factory-state'
    ) {
      const parsed: unknown = JSON.parse(stringField(message, 'body'));
      observed.candidate = stringField(record(parsed), 'sha');
      child.kill('SIGKILL');
      return;
    }
    responses.push(
      (async (): Promise<void> => {
        const response = await platform.fetch(url, {
          method,
          ...(typeof message['body'] === 'string' ? { body: message['body'] } : {}),
        });
        const body = Buffer.from(await response.arrayBuffer()).toString('base64');
        if (child.connected)
          child.send({
            id: message['id'],
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body,
          });
      })(),
    );
  });
  const closed = await once(child, 'close');
  await Promise.all(responses);
  assert.equal(closed[0], null, output);
  assert.equal(closed[1], 'SIGKILL', output);
  assert.ok(
    observed.candidate !== null,
    'Actual production ref request was observed before killing the process',
  );
  assert.equal(platform.git(['cat-file', '-t', observed.candidate]), 'commit');
  assert.equal(platform.git(['show', '-s', '--format=%P', observed.candidate]), head);
  assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), head);
  const authenticated = await verifyAuthority(await resolveFactoryContext(context), envelope);
  assert.equal(authenticated['reservation_number'], 1);
  const restarted = laterContext(platform, activation, '904');
  const recovery = await runController(restarted, { command: 'recover' });
  assert.equal(recovery.status, 'denied');
  assert.match(recovery.reason, /orphan reservation/);
  assert.equal(
    (await runController(restarted, { command: 'reserve', issue_number: 42, event_id: '12' }))
      .status,
    'denied',
  );
  assert.equal(
    (await runController(restarted, { command: 'effect-gate', issue_number: 42, event_id: '12' }))
      .status,
    'denied',
  );
  assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), head);
  assert.equal(
    platform.artifacts.some(
      (artifact) => String(artifact['id']) === record(envelope['transport'])['artifact_id'],
    ),
    true,
  );
});

it('AC10 durably permits one initial transport claim and one identical retry without granting a third or a fresh-run allowance', async (test) => {
  const { platform, activation, context, reserve } = await registeredFactory(test);
  const reserved = await runController(context, {
    command: 'append',
    envelope: platform.upload(reserve, 'receipt', stringField(reserve, 'transition_id'), 'reserve'),
  });
  assert.equal(reserved.status, 'accepted', reserved.reason);
  const checkpoint = async (runId: string) => {
    const current = laterContext(platform, activation, runId);
    const result = await runController(current, { command: 'checkpoint' });
    assert.equal(result.status, 'accepted', result.reason);
    const head = platform.git(['rev-parse', 'refs/heads/factory-state']);
    const parsed: unknown = JSON.parse(platform.git(['show', `${head}:checkpoint.json`]));
    platform.upload(
      record(result.record),
      'checkpoint',
      stringField(record(parsed), 'last_transition_id'),
      'checkpoint',
    );
    return current;
  };
  const append = async (current: ReturnType<typeof laterContext>, core: JsonRecord) => {
    const envelope = platform.upload(
      core,
      'receipt',
      stringField(core, 'transition_id'),
      stringField(core, 'producer_phase'),
    );
    const result = await runController(current, { command: 'append', envelope });
    assert.equal(result.status, 'accepted', result.reason);
    return envelope;
  };
  const initialContext = await checkpoint('904');
  const branch = `factory/${stringField(reserve, 'lineage_id')}/1`;
  const payload = sha256({ repository_id: '1230959148', branch, head: platform.release });
  const patch = produceReceipt({
    ...reserve,
    run_id: '904',
    producer_phase: 'patch',
    sequence: 3,
    parent_head: record(reserved.record)['state_head'],
    parent_checkpoint_head: record(reserved.record)['state_head'],
    request_key: sha256({ stage: 'patch', run_id: '904' }),
    expected_transition: 'patch-ready',
    outcome: 'patch-ready',
    operation: {
      initial_claimed: false,
      retry_claimed: false,
      status: 'succeeded',
      payload_sha256: payload,
      expected_head: platform.release,
      target_id: branch,
      result_id: null,
      reason: null,
    },
  });
  const patchAuthority = platform.upload(
    patch,
    'receipt',
    stringField(patch, 'transition_id'),
    'patch',
  );
  const request = { issue_number: 42, event_id: '12', stage: 'expected-head-push' };
  const intent = await runController(initialContext, {
    ...request,
    command: 'operation-intent',
    operation_authority: patchAuthority,
  });
  assert.equal(intent.status, 'accepted', intent.reason);
  const intentCore = record(intent.record);
  const before = await runController(initialContext, {
    ...request,
    command: 'operation-gate',
    operation_authority: patchAuthority,
  });
  assert.equal(
    before.status,
    'denied',
    'An authenticated candidate alone has no durable operation allowance',
  );
  const initialAuthority = await append(initialContext, intentCore);
  const foreignContext = await checkpoint('905');
  const gate = await runController(initialContext, {
    ...request,
    command: 'operation-gate',
    operation_authority: initialAuthority,
  });
  assert.equal(gate.status, 'accepted', gate.reason);
  assert.equal(record(gate.record)['retry'], false);
  assert.equal(record(gate.record)['payload_sha256'], payload);
  assert.equal(
    (
      await runController(foreignContext, {
        ...request,
        command: 'operation-gate',
        operation_authority: initialAuthority,
      })
    ).status,
    'denied',
    'A fresh run cannot adopt the durable initial claim',
  );
  const resultContext = laterContext(platform, activation, '906');
  const resultCore = produceReceipt({
    ...patch,
    run_id: '906',
    sequence: 4,
    parent_head: platform.git(['rev-parse', 'refs/heads/factory-state']),
    parent_checkpoint_head: platform.git(['rev-parse', 'refs/heads/factory-state']),
    request_key: intentCore['request_key'],
    operation: {
      ...record(intentCore['operation']),
      status: 'retryable-failure',
      reason: 'Definitive unchanged-head transport rejection',
    },
  });
  const resultAuthority = platform.upload(
    resultCore,
    'receipt',
    stringField(resultCore, 'transition_id'),
    'patch',
  );
  const outcome = await runController(resultContext, {
    ...request,
    command: 'operation-outcome',
    operation_authority: resultAuthority,
  });
  assert.equal(outcome.status, 'accepted', outcome.reason);
  const outcomeAuthority = await append(resultContext, record(outcome.record));
  const retryContext = await checkpoint('907');
  const retry = await runController(retryContext, {
    ...request,
    command: 'retry-claim',
    operation_authority: outcomeAuthority,
  });
  assert.equal(retry.status, 'accepted', retry.reason);
  const retryCore = record(retry.record);
  assert.equal(record(retryCore['operation'])['payload_sha256'], payload);
  assert.equal(record(retryCore['operation'])['retry_claimed'], true);
  const retryAuthority = await append(retryContext, retryCore);
  const thirdContext = await checkpoint('908');
  const retryGate = await runController(retryContext, {
    ...request,
    command: 'operation-gate',
    operation_authority: retryAuthority,
  });
  assert.equal(retryGate.status, 'accepted', retryGate.reason);
  assert.equal(record(retryGate.record)['retry'], true);
  const third = await runController(thirdContext, {
    ...request,
    command: 'retry-claim',
    operation_authority: outcomeAuthority,
  });
  assert.equal(third.status, 'denied');
  assert.match(third.reason, /Retry denied/);
  assert.equal(
    (
      await runController(thirdContext, {
        ...request,
        command: 'operation-gate',
        operation_authority: retryAuthority,
      })
    ).status,
    'denied',
  );
  const lineage = parseProtocol(
    Buffer.from(
      platform.git([
        'show',
        `refs/heads/factory-state:lineages/${stringField(reserve, 'lineage_id')}.json`,
      ]),
    ),
    'lineage',
  );
  assert.equal(arrayField(lineage, 'reservations').length, 1);
  const operation = record(record(lineage['operations'])[stringField(intentCore, 'request_key')]);
  assert.equal(operation['initial_claimed'], true);
  assert.equal(operation['retry_claimed'], true);
  assert.equal(operation['payload_sha256'], payload);
});

it('AC07–09 bootstraps actual legacy issue and PR inventories into quarantine rather than a new zero-usage repair allowance', async (test) => {
  const platform = new FactoryPlatform(test);
  const finding = {
    repository_id: '1230959148',
    fingerprint_policy_revision: 'legacy-v1',
    fingerprint: 'a'.repeat(64),
  };
  const issue = {
    number: 42,
    node_id: 'I_LEGACY',
    user: { id: 23296915, login: 'apolenkov' },
    state: 'open',
    labels: [{ name: 'factory-fix' }],
    body: `<!-- factory-finding-v1 ${JSON.stringify(finding)} -->`,
    created_at: '2026-10-10T00:00:00Z',
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
  platform.pulls.push({
    number: 7,
    node_id: 'PR_LEGACY',
    state: 'open',
    head: { ref: 'factory/legacy', sha: platform.release, repo: { id: 1230959148 } },
    base: { ref: 'main', repo: { id: 1230959148 } },
  });
  const reviewed = platform.activation({
    activation: false,
    bootstrap_completed: false,
    genesis_head: null,
    genesis_receipt_sha256: null,
    legacy_inventory_sha256: null,
  });
  const context = platform.context(reviewed, '9850', 'bootstrap');
  const prepared = await runController(context, {
    command: 'bootstrap',
    bootstrap_ticket: reviewed['bootstrap_ticket'],
  });
  assert.equal(prepared.status, 'accepted', prepared.reason);
  const receipt = record(record(prepared.record)['receipt']);
  const created = await runController(context, {
    command: 'bootstrap',
    bootstrap_ticket: reviewed['bootstrap_ticket'],
    envelope: platform.upload(
      receipt,
      'receipt',
      stringField(receipt, 'transition_id'),
      'bootstrap',
    ),
  });
  assert.equal(created.status, 'accepted', created.reason);
  const anchors = record(created.record);
  const head = stringField(anchors, 'genesis_head');
  const inventory = parseProtocol(
    Buffer.from(platform.git(['show', `${head}:legacy-inventory.json`])),
    'inventory',
  );
  const entries = arrayField(inventory, 'lineages').map(record);
  assert.equal(entries.length, 2);
  const aliases: string[] = [];
  for (const entry of entries) {
    const bytes = Buffer.from(
      platform.git(['show', `${head}:lineages/${stringField(entry, 'lineage_id')}.json`]),
    );
    const lineage = parseProtocol(bytes, 'lineage');
    assert.equal(entry['file_sha256'], sha256(bytes));
    assert.equal(lineage['history_status'], 'unknown');
    assert.equal(lineage['repair_state'], 'needs-human');
    assert.equal(lineage['confidence'], 'unknown');
    aliases.push(
      ...arrayField(lineage, 'aliases').map((alias) => stringField(record(alias), 'kind')),
    );
  }
  assert.deepEqual(aliases.toSorted(), ['issue', 'pr']);
  const checkpoint = await runController(context, { command: 'checkpoint' });
  assert.equal(checkpoint.status, 'accepted', checkpoint.reason);
  platform.upload(
    record(checkpoint.record),
    'checkpoint',
    stringField(receipt, 'transition_id'),
    'checkpoint',
  );
  const activation = platform.activation({ ...anchors, bootstrap_completed: true });
  const current = laterContext(platform, activation, '9851');
  for (const command of ['admit', 'reserve', 'effect-gate']) {
    const result = await runController(current, { command, issue_number: 42, event_id: '12' });
    assert.equal(result.status, 'denied', command);
    assert.match(result.reason, /unknown history cannot repair/);
  }
  assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), head);
});

it('AC07–09 refuses malformed or foreign legacy finding identity before creating any bootstrap state', async (test) => {
  for (const kind of ['malformed-marker', 'foreign-repository'])
    await test.test(kind, async (subtest) => {
      const platform = new FactoryPlatform(subtest);
      const marker =
        kind === 'malformed-marker'
          ? '<!-- factory-finding-v1 not-an-object -->'
          : `<!-- factory-finding-v1 ${JSON.stringify({ repository_id: '999', fingerprint_policy_revision: 'legacy-v1', fingerprint: 'a'.repeat(64) })} -->`;
      platform.issues.push({
        number: 42,
        node_id: 'I_UNKNOWN_LEGACY',
        user: { id: 23296915, login: 'apolenkov' },
        state: 'open',
        body: marker,
      });
      const reviewed = platform.activation({
        activation: false,
        bootstrap_completed: false,
        genesis_head: null,
        genesis_receipt_sha256: null,
        legacy_inventory_sha256: null,
      });
      const context = platform.context(reviewed, '9850', 'bootstrap');
      const result = await runController(context, {
        command: 'bootstrap',
        bootstrap_ticket: reviewed['bootstrap_ticket'],
      });
      assert.equal(result.status, 'denied');
      assert.match(
        result.reason,
        kind === 'malformed-marker'
          ? /Unidentifiable legacy canonical issue/
          : /Foreign legacy finding/,
      );
      assert.equal(
        platform.requests.some((request) => request.method !== 'GET'),
        false,
      );
      assert.throws(() => platform.git(['show-ref', '--verify', 'refs/heads/factory-state']));
    });
});

it('AC08–09 denies native Git state substitutions with valid outer checkpoint hashes but a payload outside the authenticated transition recipe', async (test) => {
  for (const corruption of [
    'unrelated-lineage',
    'confidence-change',
    'history-change',
    'unauthorized-observation',
    'unknown-path',
  ])
    await test.test(corruption, async (subtest) => {
      const fixture = await registeredFactory(subtest);
      const { platform, activation, context, reserve, head: parent } = fixture;
      const envelope = platform.upload(
        reserve,
        'receipt',
        stringField(reserve, 'transition_id'),
        'reserve',
      );
      const appended = await runController(context, { command: 'append', envelope });
      assert.equal(appended.status, 'accepted', appended.reason);
      const valid = stringField(record(appended.record), 'state_head');
      const recoveryContext = laterContext(platform, activation, '9860');
      const ordinary = await runController(recoveryContext, { command: 'recover' });
      assert.equal(ordinary.status, 'accepted', ordinary.reason);
      const files = new Map(
        platform
          .git(['ls-tree', '-r', '--name-only', valid])
          .split('\n')
          .map((file) => {
            const value: unknown = JSON.parse(platform.git(['show', `${valid}:${file}`]));
            return [file, record(value)] as const;
          }),
      );
      const lineagePath = `lineages/${stringField(reserve, 'lineage_id')}.json`;
      const lineage = record(files.get(lineagePath));
      if (corruption === 'confidence-change')
        files.set(lineagePath, { ...lineage, confidence: 'disputed' });
      if (corruption === 'history-change')
        files.set(lineagePath, { ...lineage, history_status: 'unknown' });
      if (corruption === 'unrelated-lineage') {
        const identity = {
          ...record(lineage['identity']),
          fingerprint: 'f'.repeat(64),
          issue_node_id: 'I_UNRELATED',
        };
        const id = sha256(identity);
        files.set(`lineages/${id}.json`, {
          ...lineage,
          lineage_id: id,
          identity,
          aliases: [{ kind: 'issue', id: '999', head: null, original_identity_sha256: id }],
        });
      }
      if (corruption === 'unauthorized-observation')
        files.set('observation.json', { window_start: '2026-10-01T00:00:00Z', components: [] });
      if (corruption === 'unknown-path')
        files.set('unregistered-state.json', { value: 'not authorized by any receipt' });
      const payload = [...files.entries()]
        .filter(([file]) => file !== 'checkpoint.json')
        .map(([file, value]) => ({ path: file, 'blob-content-sha256': sha256(value) }))
        .toSorted((left, right) =>
          Buffer.compare(canonicalBytes(left.path), canonicalBytes(right.path)),
        );
      const checkpoint: JsonRecord = {
        ...record(files.get('checkpoint.json')),
        state_payload_sha256: sha256(payload),
      };
      files.set('checkpoint.json', checkpoint);
      const corrupted = platform.commitFiles(
        new Map([...files].map(([file, value]) => [file, canonicalBytes(value)])),
        [parent],
      );
      platform.git(['update-ref', 'refs/heads/factory-state', corrupted, valid]);
      assert.equal(platform.git(['show', '-s', '--format=%P', corrupted]), parent);
      assert.equal(record(envelope['receipt'])['transition_id'], checkpoint['last_transition_id']);
      const recovered = await runController(recoveryContext, { command: 'recover' });
      assert.equal(recovered.status, 'denied', corruption);
      assert.match(
        recovered.reason,
        corruption === 'unknown-path'
          ? /Unauthorized state path\/mode/
          : /Git append payload differs from authenticated transition recipe; preserve history/,
      );
      assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), corrupted);
      assert.equal(platform.git(['cat-file', '-t', valid]), 'commit');
      assert.equal(platform.git(['cat-file', '-t', corrupted]), 'commit');
    });
});

it('Opus F1 ignores foreign duplicate and malformed markers during real registration and denies a foreign current canonical author', async (test) => {
  const marker = `<!-- factory-finding-v1 ${JSON.stringify({ repository_id: '1230959148', fingerprint_policy_revision: 'reviewed-v1', fingerprint: 'd'.repeat(64) })} -->`;
  const fixture = await registeredFactory(test, [
    { number: 51, node_id: 'I_FOREIGN_DUPLICATE', state: 'open', user: { id: 999 }, body: marker },
    {
      number: 52,
      node_id: 'I_FOREIGN_BAD_MARKER',
      state: 'open',
      user: { id: 999 },
      body: '<!-- factory-finding-v1 {broken} -->',
    },
  ]);
  const route = '/repos/apolenkov/feynman/issues/42';
  const issue = record(fixture.platform.facts.get(route));
  const state = fixture.platform.git(['rev-parse', 'refs/heads/factory-state']);
  fixture.platform.facts.set(route, { ...issue, user: { id: 999, login: 'apolenkov' } });
  const denied = await runController(fixture.context, {
    command: 'admit',
    issue_number: 42,
    event_id: '12',
  });
  assert.equal(denied.status, 'denied');
  assert.match(denied.reason, /author/i);
  assert.equal(fixture.platform.git(['rev-parse', 'refs/heads/factory-state']), state);
});

it('Opus F1 bootstraps only numeric trusted authors and skips foreign duplicate or malformed markers before parsing', async (test) => {
  for (const author of [23296915, 41898282])
    await test.test(`trusted ${author}`, async (subtest) => {
      const platform = new FactoryPlatform(subtest);
      const identity = {
        repository_id: '1230959148',
        fingerprint_policy_revision: 'legacy-v1',
        fingerprint: 'a'.repeat(64),
      };
      const marker = `<!-- factory-finding-v1 ${JSON.stringify(identity)} -->`;
      platform.issues.push(
        {
          number: 42,
          node_id: 'I_TRUSTED_LEGACY',
          state: 'open',
          user: { id: author },
          body: marker,
        },
        {
          number: 51,
          node_id: 'I_FOREIGN_DUPLICATE',
          state: 'open',
          user: { id: 999 },
          body: marker,
        },
        {
          number: 52,
          node_id: 'I_FOREIGN_MALFORMED',
          state: 'open',
          user: { id: 999 },
          body: '<!-- factory-finding-v1 not-json -->',
        },
        {
          number: 53,
          node_id: 'I_NON_NUMERIC',
          state: 'open',
          user: { id: String(author) },
          body: marker,
        },
      );
      const activation = platform.activation({
        activation: false,
        bootstrap_completed: false,
        genesis_head: null,
        genesis_receipt_sha256: null,
        legacy_inventory_sha256: null,
      });
      const context = platform.context(activation, '9860', 'bootstrap');
      const prepared = await runController(context, {
        command: 'bootstrap',
        bootstrap_ticket: activation['bootstrap_ticket'],
      });
      assert.equal(prepared.status, 'accepted', prepared.reason);
      const receipt = record(record(prepared.record)['receipt']);
      const created = await runController(context, {
        command: 'bootstrap',
        bootstrap_ticket: activation['bootstrap_ticket'],
        envelope: platform.upload(
          receipt,
          'receipt',
          stringField(receipt, 'transition_id'),
          'bootstrap',
        ),
      });
      assert.equal(created.status, 'accepted', created.reason);
      const head = stringField(record(created.record), 'genesis_head');
      const inventory = parseProtocol(
        Buffer.from(platform.git(['show', `${head}:legacy-inventory.json`])),
        'inventory',
      );
      assert.equal(arrayField(inventory, 'lineages').length, 1);
      const entry = record(arrayField(inventory, 'lineages')[0]);
      const lineage = parseProtocol(
        Buffer.from(
          platform.git(['show', `${head}:lineages/${stringField(entry, 'lineage_id')}.json`]),
        ),
        'lineage',
      );
      assert.equal(record(lineage['identity'])['issue_node_id'], 'I_TRUSTED_LEGACY');
    });
});

function archiveOf(platform: FactoryPlatform, member: string, bytes: Buffer): [string, string] {
  const directory = fs.mkdtempSync(path.join(platform.root, 'archive-'));
  fs.writeFileSync(path.join(directory, member), bytes);
  const archive = execFileSync('bsdtar', ['--format=zip', '-cf', '-', '-C', directory, member], {
    maxBuffer: 2_000_000,
  });
  const artifactId = String(7000 + platform.archives.size);
  platform.archives.set(artifactId, archive);
  return [artifactId, sha256(archive)];
}

it('reads a scan record archive only as scan.json and caps extraction at 1 MB', async (test) => {
  const { platform, activation } = await bootstrapped(test);
  const context = await resolveFactoryContext(laterContext(platform, activation, '903'));
  const scan = Buffer.from('{"findings":[]}');
  const [okId, okSha] = archiveOf(platform, 'scan.json', scan);
  assert.deepEqual(await readAuthorityArchive(context, okId, okSha, 'scan'), scan);
  const [receiptId, receiptSha] = archiveOf(platform, 'receipt.json', scan);
  await assert.rejects(readAuthorityArchive(context, receiptId, receiptSha, 'scan'), /Unsafe/);
  await assert.rejects(readAuthorityArchive(context, okId, okSha, 'receipt'), /Unsafe/);
  const [bigId, bigSha] = archiveOf(platform, 'scan.json', Buffer.alloc(1_000_001, 97));
  await assert.rejects(readAuthorityArchive(context, bigId, bigSha, 'scan'), /too large/);
  const [edgeId, edgeSha] = archiveOf(platform, 'scan.json', Buffer.alloc(1_000_000, 97));
  assert.equal((await readAuthorityArchive(context, edgeId, edgeSha, 'scan')).length, 1_000_000);
});

it('resolves a prior producer receipt through the protocol module', async (test) => {
  const { platform, activation, genesis } = await bootstrapped(test);
  const context = laterContext(platform, activation, '904');
  const core = findingReceipt(platform, activation, genesis, '904', 'reserve', {
    reservation_number: 1,
    expected_transition: 'reserved',
    outcome: 'consumed',
  });
  const envelope = platform.upload(core, 'receipt', stringField(core, 'transition_id'), 'reserve');
  const resolved = await resolveReceipt(await resolveFactoryContext(context), '904', 'reserve');
  assert.deepEqual(resolved, envelope);
});

const BOT = { id: 41898282, login: 'github-actions[bot]' };
const RUNS = '/repos/apolenkov/feynman/actions/runs';
const NIGHT_REVIEW = { workflow_id: 701, path: '.github/workflows/night-review.yml' };

function setRun(platform: FactoryPlatform, runId: string, patch: JsonRecord): void {
  const run = { ...record(platform.facts.get(`${RUNS}/${runId}`)), ...patch };
  platform.facts.set(`${RUNS}/${runId}`, run);
  platform.facts.set(`${RUNS}/${runId}/attempts/1`, run);
}
function parentRun(platform: FactoryPlatform, patch: JsonRecord = {}, id = '8800'): void {
  platform.facts.set(`${RUNS}/${id}`, {
    id: Number(id),
    ...NIGHT_REVIEW,
    event: 'schedule',
    head_branch: 'main',
    repository: { id: 1230959148 },
    head_repository: { id: 1230959148 },
    created_at: '2026-10-12T00:02:00Z',
    updated_at: '2026-10-12T00:06:00Z',
    ...patch,
  });
}
async function botContext(test: TestContext, actor: JsonRecord = BOT) {
  const { platform, activation, genesis } = await bootstrapped(test);
  const context = laterContext(platform, activation, '906');
  setRun(platform, '906', { actor, created_at: '2026-10-12T00:03:00Z' });
  return { platform, activation, genesis, context: await resolveFactoryContext(context) };
}

it('authenticates the producer actor as the owner or a bot parented by the scheduled review run', async (test) => {
  const { platform, context } = await botContext(test, { id: 23296915, login: 'apolenkov' });
  assert.deepEqual(await producerActor(context, {}, true), {
    actor_id: '23296915',
    actor_login: 'apolenkov',
    actor_decision: 'owner',
  });
  setRun(platform, '906', { actor: BOT });
  parentRun(platform);
  const approved = {
    actor_id: '41898282',
    actor_login: 'github-actions[bot]',
    actor_decision: 'approved-publisher',
  };
  assert.deepEqual(await producerActor(context, { parent_run_id: '8800' }, true), approved);
  parentRun(platform, { event: 'workflow_dispatch' });
  assert.deepEqual(await producerActor(context, { parent_run_id: '8800' }, true), approved);
});

it('refuses a bot or third actor without a valid scheduled night-review parent on main', async (test) => {
  const { platform, context } = await botContext(test);
  for (const [request, parent] of [
    [{}, {}],
    [{ parent_run_id: 8800 }, {}],
    [{ parent_run_id: '906' }, {}],
    [{ parent_run_id: '8800' }, { path: '.github/workflows/ci.yml', workflow_id: 272235418 }],
    [{ parent_run_id: '8800' }, { workflow_id: 999 }],
    [{ parent_run_id: '8800' }, { head_branch: 'feat/x' }],
    [{ parent_run_id: '8800' }, { event: 'push' }],
    [{ parent_run_id: '8800' }, { repository: { id: 1 } }],
    [{ parent_run_id: '8800' }, { head_repository: { id: 1 } }],
    [{ parent_run_id: '8800' }, { created_at: '2026-10-12T00:04:00Z' }],
    [{ parent_run_id: '8800' }, { created_at: '2026-10-12T00:03:00Z' }],
    [{ parent_run_id: '8800' }, { updated_at: '2026-10-12T00:02:30Z' }],
    [{ parent_run_id: '8800' }, { created_at: '2026-10-11T23:47:00Z' }],
    [{ parent_run_id: '8800' }, { created_at: '2026-10-11T00:00:00Z' }],
    [{ parent_run_id: '8404' }, {}],
  ] as const) {
    parentRun(platform, parent);
    await assert.rejects(producerActor(context, request, true), /actor|parent|404/i);
  }
  parentRun(platform);
  setRun(platform, '906', { actor: { id: 777, login: 'mallory' } });
  await assert.rejects(producerActor(context, { parent_run_id: '8800' }, true), /actor/i);
});

it('accepts approved-publisher receipts only from the owner or the Actions bot in scan, verifier and publication', async (test) => {
  const bad = { id: 23296915, login: 'impostor' };
  for (const [actor, phase, decision, ok] of [
    [{ id: 23296915, login: 'apolenkov' }, 'scan', 'approved-publisher', true],
    [{ id: 23296915, login: 'apolenkov' }, 'reserve', 'owner', true],
    [{ id: 23296915, login: 'apolenkov' }, 'reserve', 'approved-publisher', false],
    [{ id: 23296915, login: 'impostor' }, 'reserve', 'owner', false],
    [BOT, 'reserve', 'owner', false],
    [BOT, 'scan', 'approved-publisher', true],
    [BOT, 'verifier', 'approved-publisher', true],
    [BOT, 'publication', 'approved-publisher', true],
    [BOT, 'reserve', 'approved-publisher', false],
    [BOT, 'outcome', 'approved-publisher', false],
    [BOT, 'register', 'approved-publisher', false],
    [{ id: 777, login: 'mallory' }, 'scan', 'approved-publisher', false],
    [{ id: 41898282, login: 'impostor' }, 'scan', 'approved-publisher', false],
    [bad, 'scan', 'approved-publisher', false],
  ] as const) {
    await test.test(`actor ${actor.login} signs ${phase}`, async (subtest) => {
      const { platform, activation, genesis, context } = await botContext(subtest, actor);
      const core = findingReceipt(platform, activation, genesis, '906', phase, {
        actor_decision: decision,
        actor_id: String(actor.id),
        actor_login: actor.login,
        reservation_number: 1,
        expected_transition: 'reserved',
        outcome: 'consumed',
      });
      const envelope = platform.upload(core, 'receipt', stringField(core, 'transition_id'), phase);
      if (ok) assert.deepEqual(await verifyAuthority(context, envelope), core);
      else await assert.rejects(verifyAuthority(context, envelope), /actor/i);
    });
  }
});

it('lets the owner but never the Actions bot reserve or settle a repair', async (test) => {
  const { platform, activation, genesis } = await bootstrapped(test);
  const identity = {
    repository_id: '1230959148',
    fingerprint_policy_revision: 'reviewed-v1',
    fingerprint: 'd'.repeat(64),
  };
  const issue = {
    number: 42,
    node_id: 'I_CANONICAL',
    user: { id: 23296915, login: 'apolenkov' },
    state: 'open',
    labels: [{ name: 'factory-fix' }],
    body: `<!-- factory-finding-v1 ${JSON.stringify(identity)} -->`,
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
  const owner = laterContext(platform, activation, '902');
  const publication = findingReceipt(platform, activation, genesis, '902', 'publication');
  const registration = await runController(owner, {
    command: 'register',
    publication_authority: platform.upload(
      publication,
      'receipt',
      stringField(publication, 'transition_id'),
      'publication',
    ),
  });
  assert.equal(registration.status, 'accepted', registration.reason);
  const registerCore = record(registration.record);
  const append = await runController(owner, {
    command: 'append',
    envelope: platform.upload(
      registerCore,
      'receipt',
      stringField(registerCore, 'transition_id'),
      'register',
    ),
  });
  assert.equal(append.status, 'accepted', append.reason);
  const head = platform.git(['rev-parse', 'refs/heads/factory-state']);
  const checkpointOf = async (runId: string) => {
    const current = laterContext(platform, activation, runId);
    const checkpoint = await runController(current, { command: 'checkpoint' });
    assert.equal(checkpoint.status, 'accepted', checkpoint.reason);
    const file = JSON.parse(platform.git(['show', `${head}:checkpoint.json`])) as unknown;
    platform.upload(
      record(checkpoint.record),
      'checkpoint',
      stringField(record(file), 'last_transition_id'),
      'checkpoint',
    );
    return current;
  };
  const request = { issue_number: 42, event_id: '12', evidence: { scan: null, verifier: null } };
  parentRun(platform);
  for (const command of ['reserve', 'outcome'] as const) {
    const runId = command === 'reserve' ? '903' : '904';
    const current = await checkpointOf(runId);
    setRun(platform, runId, { actor: BOT, created_at: '2026-10-12T00:03:00Z' });
    const refused = await runController(current, {
      ...request,
      command,
      outcome: 'patch-ready',
      parent_run_id: '8800',
    });
    assert.equal(refused.status, 'denied');
    assert.match(refused.reason, /owner/i);
    assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), head);
  }
  // The same context still serves the owner after the refusals.
  const current = await checkpointOf('905');
  const reserved = await runController(current, { ...request, command: 'reserve' });
  assert.equal(reserved.status, 'accepted', reserved.reason);
  assert.equal(record(reserved.record)['actor_decision'], 'owner');
});

// Night evidence producers: detached verifier/scan receipts and the scheduled night-scan dispatch.
import { nightScan } from '../scripts/factory-control.ts';
import { assertNightProducer, reconcilePublication } from '../scripts/factory-publication.ts';

const NIGHT_PRINT = 'e'.repeat(64);
const NIGHT_REVISION = 'night-scan-fp-v1';
function nightFinding(overrides: JsonRecord = {}): JsonRecord {
  return {
    fingerprint: NIGHT_PRINT,
    path: 'bin/application.ts',
    start_line: 3,
    end_line: 5,
    severity: 'high',
    category: 'bug',
    description: 'Unchecked input reaches a shell.',
    verdict: 'confirmed',
    verdict_reason: 'The call path was read end to end.',
    acceptance_criteria: ['Input is validated before use.'],
    ...overrides,
  };
}
let drafts = 0;
function nightDraft(
  platform: FactoryPlatform,
  findings: readonly JsonRecord[] = [nightFinding()],
  overrides: JsonRecord = {},
): string {
  const inventory = ['bin/application.ts'];
  const file = path.join(platform.root, `draft-${drafts++}.json`);
  fs.writeFileSync(
    file,
    canonicalBytes({
      repository_id: '1230959148',
      source_sha: platform.release,
      fingerprint_policy_revision: NIGHT_REVISION,
      inventory,
      inventory_sha256: sha256(inventory),
      covered: inventory,
      excluded: [],
      failed: [],
      token_usage: 100,
      truncated: false,
      successful: true,
      tool_revision: 'open-code-review@1.13.0+test',
      config_revision: 'c'.repeat(64),
      findings,
      deferred_findings: [],
      ...overrides,
    }),
  );
  return file;
}
function nonGetCount(platform: FactoryPlatform): number {
  return platform.requests.filter((request) => request.method !== 'GET').length;
}

it('refuses a night draft with two findings, a foreign source_sha or a verdict outside confirmed|disputed', async (test) => {
  const { platform, activation } = await bootstrapped(test);
  const context = laterContext(platform, activation, '910');
  const head = platform.git(['rev-parse', 'refs/heads/factory-state']);
  const writes = nonGetCount(platform);
  const second = nightFinding({ fingerprint: 'f'.repeat(64) });
  for (const [findings, overrides, reason] of [
    [[nightFinding(), second], {}, /one finding/],
    [[nightFinding()], { source_sha: 'a'.repeat(40) }, /source_sha/],
    [[nightFinding({ verdict: 'refuted' })], {}, /verdict/],
    [[nightFinding({ verdict: 'unknown' })], {}, /verdict/],
    [[nightFinding({ verdict: null })], {}, /verdict/],
    [[], {}, /one finding/],
    [[nightFinding({ authority: {} })], {}, /authority/],
    [[nightFinding()], { token_budget: 1 }, /token_budget/],
    [[nightFinding()], { fingerprint_policy_revision: 'other-v9' }, /fingerprint policy revision/],
  ] as const) {
    const draft = nightDraft(platform, findings, overrides);
    const output = path.join(platform.root, 'receipt.json');
    const verifier = await runController(context, {
      command: 'verifier',
      draft_file: draft,
      output_file: output,
    });
    assert.equal(verifier.status, 'denied');
    assert.match(verifier.reason, reason);
  }
  const twoScan = await runController(context, {
    command: 'scan',
    draft_file: nightDraft(platform, [nightFinding(), second]),
    output_file: path.join(platform.root, 'receipt.json'),
  });
  assert.equal(twoScan.status, 'denied');
  assert.match(twoScan.reason, /one finding/);
  assert.equal(nonGetCount(platform), writes);
  assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), head);
});

it('requires the scheduled night-review parent for a bot producer and refuses a null token budget', async (test) => {
  const { platform, activation } = await bootstrapped(test);
  const context = laterContext(platform, activation, '911');
  setRun(platform, '911', { actor: BOT, created_at: '2026-10-12T00:03:00Z' });
  const request = {
    command: 'verifier',
    draft_file: nightDraft(platform),
    output_file: path.join(platform.root, 'receipt.json'),
  };
  const missing = await runController(context, request);
  assert.equal(missing.status, 'denied');
  assert.match(missing.reason, /parent_run_id/);
  parentRun(platform, { path: '.github/workflows/ci.yml', workflow_id: 272235418 });
  const foreign = await runController(context, { ...request, parent_run_id: '8800' });
  assert.equal(foreign.status, 'denied');
  assert.match(foreign.reason, /parent/);
  parentRun(platform);
  const accepted = await runController(context, { ...request, parent_run_id: '8800' });
  assert.equal(accepted.status, 'accepted', accepted.reason);
  assert.equal(record(accepted.record)['actor_decision'], 'approved-publisher');
  assert.equal(record(accepted.record)['actor_id'], '41898282');

  // Single use: the parent's first night receipt wins, a replay from a later run is refused.
  const acceptedCore = record(accepted.record);
  platform.upload(acceptedCore, 'receipt', stringField(acceptedCore, 'transition_id'), 'verifier');
  const replayContext = laterContext(platform, activation, '914');
  setRun(platform, '914', { actor: BOT, created_at: '2026-10-12T00:04:00Z' });
  const replay = await runController(replayContext, { ...request, parent_run_id: '8800' });
  assert.equal(replay.status, 'denied');
  assert.match(replay.reason, /already used/);
  // A different draft does not make a used parent fresh again.
  const otherDraft = await runController(replayContext, {
    ...request,
    draft_file: nightDraft(platform, [
      nightFinding({ description: 'Another reading of the input.' }),
    ]),
    parent_run_id: '8800',
  });
  assert.equal(otherDraft.status, 'denied');
  assert.match(otherDraft.reason, /already used/);
  // A fresh parent in the same context still succeeds, and the same run keeps its own receipt.
  parentRun(platform, { created_at: '2026-10-12T00:02:10Z' }, '8801');
  const fresh = await runController(replayContext, { ...request, parent_run_id: '8801' });
  assert.equal(fresh.status, 'accepted', fresh.reason);
  assert.notEqual(record(fresh.record)['request_key'], acceptedCore['request_key']);

  // Before the model pass the same rules apply: a used or missing parent never reaches the provider.
  await assert.rejects(
    assertNightProducer(replayContext, { parent_run_id: '8800' }),
    /already used/,
  );
  await assert.rejects(assertNightProducer(replayContext, {}), /parent_run_id/);
  await assertNightProducer(replayContext, { parent_run_id: '8801' });
  await assertNightProducer(laterContext(platform, activation, '915'), {});

  const withoutBudget = platform.context({ ...activation, token_budget: null }, '912');
  const noBudget = await runController(withoutBudget, {
    command: 'scan',
    draft_file: nightDraft(platform, []),
    output_file: path.join(platform.root, 'receipt.json'),
  });
  assert.equal(noBudget.status, 'denied');
  assert.match(noBudget.reason, /token_budget|budget/i);
});

it('issues verifier then scan receipts that verifyAuthority and publication accept', async (test) => {
  const { platform, activation } = await bootstrapped(test);
  const context = laterContext(platform, activation, '913');
  const resolved = await resolveFactoryContext(context);
  const output = path.join(platform.root, 'receipt.json');
  const recordFile = path.join(platform.root, 'scan.json');
  const draft = nightDraft(platform);

  const early = await runController(context, {
    command: 'scan',
    draft_file: draft,
    output_file: output,
    record_file: recordFile,
  });
  assert.equal(early.status, 'denied', 'scan needs the verifier receipt of the same run');
  assert.equal(fs.existsSync(recordFile), false);

  const verifier = await runController(context, {
    command: 'verifier',
    draft_file: draft,
    output_file: output,
  });
  assert.equal(verifier.status, 'accepted', verifier.reason);
  const verifierCore = record(verifier.record);
  const finding = nightFinding();
  assert.equal(verifierCore['producer_phase'], 'verifier');
  assert.equal(verifierCore['lineage_id'], null);
  assert.equal(verifierCore['outcome'], 'confirmed');
  assert.deepEqual(record(verifierCore['operation']), {
    initial_claimed: true,
    retry_claimed: false,
    status: 'succeeded',
    payload_sha256: sha256(finding),
    target_id: NIGHT_PRINT,
    expected_head: platform.release,
    result_id: null,
    reason: null,
  });
  const verifierEnvelope = platform.upload(
    verifierCore,
    'receipt',
    stringField(verifierCore, 'transition_id'),
    'verifier',
  );
  assert.deepEqual(await verifyAuthority(resolved, verifierEnvelope), verifierCore);

  const scan = await runController(context, {
    command: 'scan',
    draft_file: draft,
    output_file: output,
    record_file: recordFile,
  });
  assert.equal(scan.status, 'accepted', scan.reason);
  const scanCore = record(scan.record);
  assert.equal(scanCore['producer_phase'], 'scan');
  assert.equal(scanCore['outcome'], 'complete');
  const scanRecord = parseFactoryJson(fs.readFileSync(recordFile));
  assert.equal(scanRecord['token_budget'], activation['token_budget']);
  assert.equal(scanRecord['authority'], undefined);
  assert.deepEqual(record(arrayField(scanRecord, 'findings')[0])['authority'], verifierEnvelope);
  assert.equal(record(scanCore['operation'])['payload_sha256'], sha256(scanRecord));
  assert.equal(record(scanCore['operation'])['target_id'], NIGHT_REVISION);
  const scanEnvelope = platform.upload(
    scanCore,
    'receipt',
    stringField(scanCore, 'transition_id'),
    'scan',
  );
  assert.deepEqual(await verifyAuthority(resolved, scanEnvelope), scanCore);

  const published = await reconcilePublication(context, { ...scanRecord, authority: scanEnvelope });
  assert.equal(published.status, 'accepted', published.reason);
  assert.equal(published.complete, true);
  assert.equal(published.issues.length, 1);
  assert.equal(record(published.issues[0])['confidence'], 'confirmed');
  const tampered = await reconcilePublication(context, {
    ...scanRecord,
    token_budget: 2000,
    authority: scanEnvelope,
  });
  assert.equal(tampered.status, 'needs-human');
  assert.match(tampered.reason, /Scan source\/policy/);
});

it('dispatches the controller as night-scan only from the night-review run on main', async (test) => {
  const { platform, activation } = await bootstrapped(test);
  platform.overrides.set('/repos/apolenkov/feynman/actions/workflows/703/dispatches', null);
  const writes = nonGetCount(platform);
  const fromController = await nightScan(laterContext(platform, activation, '920'));
  assert.equal(fromController.status, 'denied');
  assert.match(fromController.reason, /night-review/);
  assert.equal(nonGetCount(platform), writes);

  const review = platform.context(activation, '921', 'repair', 0);
  setRun(platform, '921', { head_branch: 'feat/x' });
  const feature = await nightScan(review);
  assert.equal(feature.status, 'denied');
  assert.match(feature.reason, /main|Untrusted job/);
  assert.equal(nonGetCount(platform), writes);

  setRun(platform, '921', { head_branch: 'main' });
  const sent = await nightScan(review);
  assert.equal(sent.status, 'accepted', sent.reason);
  assert.equal(nonGetCount(platform), writes + 1);
  const dispatch = platform.requests.filter((request) => request.method !== 'GET').at(-1);
  assert.equal(dispatch?.method, 'POST');
  assert.equal(dispatch.path, '/repos/apolenkov/feynman/actions/workflows/703/dispatches');
  assert.deepEqual(dispatch.body, {
    ref: 'main',
    inputs: { command: 'night-scan', request: JSON.stringify({ parent_run_id: '921' }) },
  });
});

it('lets the scheduled night review ask for a scan, and no other workflow or null id', async (test) => {
  const { platform, activation } = await bootstrapped(test);
  platform.overrides.set('/repos/apolenkov/feynman/actions/workflows/703/dispatches', null);
  const review = platform.context(activation, '941', 'repair', 0);
  setRun(platform, '941', { event: 'schedule' });
  const sent = await nightScan(review);
  assert.equal(sent.status, 'accepted', sent.reason);

  // Another registered workflow on schedule is refused before any effect.
  const other = platform.context(activation, '942', 'repair', 2);
  setRun(platform, '942', { event: 'schedule' });
  await assert.rejects(
    verifyControlSource(
      await resolveFactoryContext(other),
      false,
      '.github/workflows/night-review.yml',
    ),
    /Untrusted job/,
  );
  assert.equal((await nightScan(other)).status, 'denied');

  // schedule is not allowed unless the caller names the workflow.
  await assert.rejects(verifyControlSource(await resolveFactoryContext(review)), /Untrusted job/);

  // A registry entry without an id never authenticates the run.
  const unregistered = platform.activation({
    workflow_registry: arrayField(activation, 'workflow_registry').map((entry, index) => ({
      ...record(entry),
      ...(index === 0 ? { id: null } : {}),
    })),
  });
  const nullId = platform.context(unregistered, '943', 'repair', 0);
  setRun(platform, '943', { event: 'schedule' });
  // Policy validation refuses a null registry id first; the run check in nightScan is a second guard.
  const nullDecision = await nightScan(nullId);
  assert.equal(nullDecision.status, 'denied');
  assert.match(nullDecision.reason, /Invalid protocol field id/);
});

// End to end: recorded ocr run -> bundle -> adapt -> verifier -> scan -> publication.
import { agreeable, scenario as modelScenario } from './helpers/night-model-scenario.ts';

it('publishes exactly one issue from a recorded night run and leaks no key canary', async (test) => {
  const canaries = {
    OCR_LLM_AUTH_TOKEN: 'canary-primary-7f3a9c1e5b2d4086a1c3e5f7092b4d6f',
    OPENCODE_GO_API_KEY: 'canary-fallback-0d8c6b4a2f1e3579b7d5f3a1c9e7b5d3',
    GITHUB_TOKEN: 'canary-github-5e1f9a3c7b2d4680c2e4a6b8d0f1e3a5',
  };
  const { platform, activation } = await bootstrapped(test);
  const context = laterContext(platform, activation, '930');
  const model = await modelScenario(test, 'ok1', agreeable, {
    revision: NIGHT_REVISION,
    keys: canaries,
  });
  const modelRun = await model.exec();
  assert.equal(modelRun.code, 0, modelRun.stderr);
  // The canary really reached the tool, so its absence below is a property of the pipeline.
  assert.ok(
    model.stub
      .invocations()
      .some((call) => call.env['OCR_LLM_TOKEN'] === canaries.OCR_LLM_AUTH_TOKEN),
  );
  // The recorded run was made on its own checkout; the factory binds the draft to this one.
  for (const name of ['scan-raw.json', 'verdicts.json', 'acceptance.json']) {
    const file = path.join(model.out, name);
    fs.writeFileSync(
      file,
      fs
        .readFileSync(file, 'utf8')
        .replace(/"source_sha":"[0-9a-f]{40}"/g, `"source_sha":"${platform.release}"`),
    );
  }
  const draft = path.join(platform.root, 'night-draft.json');
  const adapted = execFileSync(
    process.execPath,
    [
      'scripts/factory-scan-record.ts',
      'adapt',
      '--bundle',
      model.out,
      '--out',
      draft,
      '--revision',
      NIGHT_REVISION,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(adapted.trim(), 'selected=true');
  assert.equal(arrayField(parseFactoryJson(fs.readFileSync(draft)), 'findings').length, 1);

  const output = path.join(platform.root, 'receipt.json');
  const recordFile = path.join(platform.root, 'scan.json');
  const verifier = await runController(context, {
    command: 'verifier',
    draft_file: draft,
    output_file: output,
  });
  assert.equal(verifier.status, 'accepted', verifier.reason);
  const verifierCore = record(verifier.record);
  platform.upload(verifierCore, 'receipt', stringField(verifierCore, 'transition_id'), 'verifier');
  const scan = await runController(context, {
    command: 'scan',
    draft_file: draft,
    output_file: output,
    record_file: recordFile,
  });
  assert.equal(scan.status, 'accepted', scan.reason);
  const scanCore = record(scan.record);
  const scanEnvelope = platform.upload(
    scanCore,
    'receipt',
    stringField(scanCore, 'transition_id'),
    'scan',
  );
  const scanRecord = parseFactoryJson(fs.readFileSync(recordFile));
  const published = await reconcilePublication(context, { ...scanRecord, authority: scanEnvelope });
  assert.equal(published.status, 'accepted', published.reason);
  assert.equal(published.issues.length, 1);
  assert.equal(platform.issues.length, 1);
  assert.equal(
    platform.requests.filter(
      (request) => request.method === 'POST' && request.path.endsWith('/issues'),
    ).length,
    1,
  );

  const outputs = [
    ...fs.readdirSync(model.out).map((name) => fs.readFileSync(path.join(model.out, name), 'utf8')),
    fs.readFileSync(draft, 'utf8'),
    JSON.stringify([verifierCore, scanCore, scanEnvelope]),
    fs.readFileSync(recordFile, 'utf8'),
    modelRun.stdout,
    modelRun.stderr,
    JSON.stringify(platform.issues),
    JSON.stringify(platform.requests.filter((request) => request.method !== 'GET')),
  ];
  for (const secret of Object.values(canaries))
    outputs.forEach((text, index) => {
      assert.equal(text.includes(secret), false, `canary leaked into output ${index}`);
    });
});
