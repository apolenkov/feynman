import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { TestContext } from 'node:test';
import { gitFixtureEnvironment } from './helpers/git-environment.ts';
import { it } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  createFactoryContext,
  loadFactoryPolicy,
  sha256,
  canonicalBytes,
  numberField,
  arrayField,
  authorityMarker,
} from '../scripts/factory-protocol.ts';
import { reconcilePublication } from '../scripts/factory-publication.ts';
import {
  guardPatch,
  runReproduction,
  publishPatch,
  reconcileClosure,
} from '../scripts/factory-writer.ts';

// AC01–05/14–19 primary owner: transport serves platform facts, never admission.
it('retains four finding identities before selecting three and never closes on incomplete coverage', async (t) => {
  const calls: string[] = [];
  const server = createServer((request, response) => {
    calls.push(`${request.method ?? ''} ${request.url ?? ''}`);
    response.setHeader('content-type', 'application/json');
    response.end('[]');
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
  });
  const address = server.address();
  assert.ok(address !== null && typeof address === 'object');
  const policy = loadFactoryPolicy();
  const context = createFactoryContext(
    { ...policy, api_origin: `http://127.0.0.1:${address.port}` },
    'fixture',
  );
  const inventory = ['a.ts', 'b.ts', 'c.ts', 'd.ts'];
  const scan = {
    repository_id: '1230959148',
    source_sha: 'a'.repeat(40),
    fingerprint_policy_revision: 'v1',
    inventory,
    inventory_sha256: sha256(inventory),
    covered: inventory,
    excluded: [],
    failed: [],
    token_usage: null,
    token_budget: 1000,
    truncated: false,
    successful: true,
    tool_revision: 'v1',
    config_revision: 'v1',
    findings: inventory.map((file, index) => ({
      fingerprint: sha256(file),
      path: file,
      severity: index === 3 ? 'medium' : 'high',
      confidence: 'confirmed',
    })),
  };
  const result = await reconcilePublication(context, scan);
  assert.equal(result.presence.length, 4);
  assert.equal(result.selected.length, 0);
  assert.equal(result.complete, false);
  assert.equal(result.pending.length, 4);
  assert.deepEqual(calls, []); // Disabled source cannot publish even in the manual path.
});

it('rejects protected, oversized and non-text changes while allowing a bounded application patch', () => {
  const policy = loadFactoryPolicy();
  const valid = [
    {
      path: 'bin/example.ts',
      old_mode: '100644',
      new_mode: '100644',
      status: 'M',
      added: 2,
      removed: 1,
      binary: false,
    },
  ];
  assert.equal(guardPatch(policy, valid).status, 'accepted');
  for (const path of [
    'tests/x.ts',
    'test/x.ts',
    '.github/workflows/ci.yml',
    'package.json',
    'hooks/start.ts',
  ]) {
    assert.match(guardPatch(policy, [{ ...valid[0], path }]).reason, /protected/);
  }
  assert.match(guardPatch(policy, [{ ...valid[0], added: 601 }]).reason, /lines/);
  assert.match(guardPatch(policy, [{ ...valid[0], new_mode: '120000' }]).reason, /mode/);
  assert.match(guardPatch(policy, [{ ...valid[0], status: 'D' }]).reason, /deletion/);
  assert.match(guardPatch(policy, [{ ...valid[0], binary: true }]).reason, /binary/);
});

import { FactoryPlatform } from './helpers/night-factory-transport.ts';
import { runController } from '../scripts/factory-control.ts';
import { record, stringField, produceReceipt } from '../scripts/factory-protocol.ts';
import type { JsonRecord } from '../scripts/factory-protocol.ts';

it('publishes confirmed and disputed findings from detached non-lineage proofs, refutes independently and retains every pending identity', async (test) => {
  const platform = new FactoryPlatform(test);
  const bootstrap = platform.activation({
    activation: false,
    bootstrap_completed: false,
    genesis_head: null,
    genesis_receipt_sha256: null,
    legacy_inventory_sha256: null,
  });
  const bootstrapContext = platform.context(bootstrap, '901', 'bootstrap');
  const prepared = await runController(bootstrapContext, {
    command: 'bootstrap',
    bootstrap_ticket: bootstrap['bootstrap_ticket'],
  });
  assert.equal(prepared.status, 'accepted', prepared.reason);
  const genesisReceipt = record(record(prepared.record)['receipt']);
  const committed = await runController(bootstrapContext, {
    command: 'bootstrap',
    bootstrap_ticket: bootstrap['bootstrap_ticket'],
    envelope: platform.upload(
      genesisReceipt,
      'receipt',
      stringField(genesisReceipt, 'transition_id'),
      'bootstrap',
    ),
  });
  assert.equal(committed.status, 'accepted', committed.reason);
  const anchors = record(committed.record);
  const activation = platform.activation({ ...anchors, bootstrap_completed: true });
  const context = platform.context(activation, '902');
  const {
    bootstrap_ticket: _ticket,
    legacy_inventory_sha256: _inventory,
    ...normal
  } = genesisReceipt;
  const detachedReceipt = (
    phase: string,
    runId: string,
    document: JsonRecord,
    target: string,
    outcome: string,
  ) =>
    produceReceipt({
      ...normal,
      sequence: 1,
      parent_head: anchors['genesis_head'],
      parent_checkpoint_head: anchors['genesis_head'],
      run_id: runId,
      producer_phase: phase,
      request_key: sha256({ phase, runId, document }),
      actor_decision: 'approved-publisher',
      operation: {
        initial_claimed: true,
        retry_claimed: false,
        status: 'succeeded',
        payload_sha256: sha256(document),
        target_id: target,
        expected_head: platform.release,
        result_id: null,
        reason: null,
      },
      outcome,
    });
  const findings: JsonRecord[] = [];
  for (let index = 0; index < 4; index++) {
    const runId = String(910 + index);
    platform.context(activation, runId);
    const document = {
      fingerprint: sha256(`finding-${index}`),
      path: `bin/application-${index}.ts`,
      severity: index === 3 ? 'medium' : 'high',
      repair_failure: index === 0 ? 'fixer failed' : null,
    };
    const verdict = ['confirmed', 'disputed', 'refuted', 'confirmed'][index];
    assert.ok(verdict !== undefined);
    const verifier = detachedReceipt('verifier', runId, document, document.fingerprint, verdict);
    assert.equal(verifier['issue_node_id'], null, 'Verifier never invents an issue before POST');
    findings.push({
      ...document,
      authority: platform.upload(
        verifier,
        'receipt',
        stringField(verifier, 'transition_id'),
        'verifier',
      ),
    });
  }
  const pendingFingerprint = stringField(record(findings[3]), 'fingerprint');
  const pendingIssue = {
    number: 55,
    node_id: 'I_PENDING',
    user: { id: 23296915, login: 'apolenkov' },
    state: 'open',
    labels: [],
    body: `<!-- factory-finding-v1 ${JSON.stringify({ repository_id: '1230959148', fingerprint_policy_revision: 'reviewed-v1', fingerprint: pendingFingerprint })} -->`,
  };
  platform.issues.push(pendingIssue);
  platform.facts.set('/repos/apolenkov/feynman/issues/55', pendingIssue);
  const inventory = findings.map((finding) => finding['path']);
  const document = {
    repository_id: '1230959148',
    source_sha: platform.release,
    fingerprint_policy_revision: 'reviewed-v1',
    inventory,
    inventory_sha256: sha256(inventory),
    covered: inventory,
    excluded: [],
    failed: [],
    token_usage: 100,
    token_budget: 1000,
    truncated: false,
    successful: true,
    tool_revision: 'scanner-v1',
    config_revision: 'config-v1',
    findings,
  };
  const scan = detachedReceipt('scan', '902', document, 'reviewed-v1', 'complete');
  assert.equal(scan['lineage_id'], null);
  const input = {
    ...document,
    authority: platform.upload(scan, 'receipt', stringField(scan, 'transition_id'), 'scan'),
  };
  const result = await reconcilePublication(context, input);
  assert.equal(result.status, 'accepted', result.reason);
  assert.equal(result.complete, true);
  assert.equal(result.presence.length, 4);
  assert.equal(result.pending.length, 0);
  assert.equal(result.issues.length, 3);
  assert.equal(result.dispatch.length, 2);
  assert.equal(
    record(result.issues[0])['confidence'],
    'confirmed',
    'Repair failure does not demote independently confirmed finding',
  );
  assert.equal(record(result.issues[1])['confidence'], 'disputed');
  assert.equal(record(result.issues[1])['repair_state'], 'needs-human');
  assert.equal(
    platform.issues.find((issue) => issue['node_id'] === 'I_PENDING')?.['state'],
    'open',
  );
  const registration = record(record(result.issues[0])['registration']);
  assert.notEqual(registration['issue_node_id'], null);
  assert.equal(
    registration['lineage_id'],
    sha256({
      repository_id: '1230959148',
      fingerprint_policy_revision: 'reviewed-v1',
      fingerprint: record(result.issues[0])['fingerprint'],
      issue_node_id: record(result.issues[0])['issue_node_id'],
    }),
  );
  const before = platform.requests.filter((request) => request.method !== 'GET').length;
  const tampered = await reconcilePublication(context, { ...input, source_sha: 'f'.repeat(40) });
  assert.equal(tampered.status, 'needs-human');
  assert.match(tampered.reason, /Scan source\/policy/);
  assert.equal(platform.requests.filter((request) => request.method !== 'GET').length, before);
  const duplicate = await reconcilePublication(context, input);
  assert.equal(duplicate.status, 'accepted', duplicate.reason);
  assert.equal(
    platform.issues.length,
    3,
    'Repeated reconciliation deduplicates without a new POST',
  );
  const partialContext = platform.context(activation, '903');
  const partialDocument = {
    ...document,
    findings: findings.slice(0, 2),
    covered: inventory.slice(0, 2),
    failed: inventory.slice(2),
  };
  const partialReceipt = detachedReceipt('scan', '903', partialDocument, 'reviewed-v1', 'partial');
  const partial = await reconcilePublication(partialContext, {
    ...partialDocument,
    authority: platform.upload(
      partialReceipt,
      'receipt',
      stringField(partialReceipt, 'transition_id'),
      'scan',
    ),
  });
  assert.equal(partial.status, 'accepted', partial.reason);
  assert.equal(partial.complete, false);
  assert.equal(
    platform.issues.find((issue) => issue['node_id'] === 'I_PENDING')?.['state'],
    'open',
    'Incomplete source coverage never closes absent finding',
  );
});

const REPRODUCTION_PATH = 'tests/reproduction.test.mjs';
const BEHAVIORAL_TEST = Buffer.from(`import assert from 'node:assert/strict';
import { it } from 'node:test';
import { sum } from '../bin/application.mjs';
it('child transport secrets are absent', () => {
  for (const key of ['GITHUB_TOKEN', 'OCR_LLM_AUTH_TOKEN', 'FACTORY_OWNER_SECRET']) assert.equal(process.env[key], undefined);
});
it('adds two numbers', () => assert.equal(sum(1, 2), 3));
`);

async function reproductionFixture(
  test: TestContext,
  testBytes: Buffer = BEHAVIORAL_TEST,
  gateFailure = false,
  testPath = REPRODUCTION_PATH,
) {
  const approvedPackage = Buffer.from(
    JSON.stringify({
      name: 'factory-reproduction-fixture',
      version: '1.0.0',
      private: true,
      type: 'module',
      scripts: { ci: 'node --test tests/full-gate.test.mjs' },
    }),
  );
  const platform = new FactoryPlatform(test, new Map([['package.json', approvedPackage]]));
  const reviewed = platform.activation({
    activation: false,
    bootstrap_completed: false,
    genesis_head: null,
    genesis_receipt_sha256: null,
    legacy_inventory_sha256: null,
  });
  const bootstrapContext = platform.context(reviewed, '9501', 'bootstrap');
  const prepared = await runController(bootstrapContext, {
    command: 'bootstrap',
    bootstrap_ticket: reviewed['bootstrap_ticket'],
  });
  assert.equal(prepared.status, 'accepted', prepared.reason);
  const receipt = record(record(prepared.record)['receipt']);
  const committed = await runController(bootstrapContext, {
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
  const anchors = record(committed.record);
  const activation = platform.activation({ ...anchors, bootstrap_completed: true });
  const context = platform.context(activation, '9502');
  const root = path.join(platform.root, 'application');
  execFileSync('git', ['clone', '--quiet', '--branch', 'main', platform.repository, root], {
    env: gitFixtureEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const git = (args: readonly string[]): string =>
    execFileSync('git', ['-C', root, ...args], {
      env: {
        ...gitFixtureEnvironment(),
        GIT_AUTHOR_NAME: 'Fixture',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Fixture',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'tests'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'bin/application.mjs'),
    'export const sum = (left, right) => left - right;\n',
  );
  fs.writeFileSync(path.join(root, testPath), testBytes);
  fs.writeFileSync(
    path.join(root, 'tests/full-gate.test.mjs'),
    `import assert from 'node:assert/strict';
import { it } from 'node:test';
import { sum } from '../bin/application.mjs';
it('complete fixture gate', () => {
  for (const key of ['GITHUB_TOKEN', 'OCR_LLM_AUTH_TOKEN', 'FACTORY_OWNER_SECRET']) assert.equal(process.env[key], undefined);
  assert.equal(sum(1, 2), ${gateFailure ? '4' : '3'});
});
`,
  );
  git(['add', 'bin/application.mjs', testPath, 'tests/full-gate.test.mjs']);
  git(['commit', '-qm', 'fixture: buggy application and immutable test']);
  const baseline = git(['rev-parse', 'HEAD']);
  const { bootstrap_ticket: _ticket, legacy_inventory_sha256: _inventory, ...normal } = receipt;
  let producer = 9510;
  const authority = (
    phase: string,
    outcome: string,
    head: string,
    payload: string,
    target = testPath,
  ): JsonRecord => {
    const runId = String(producer++);
    platform.context(activation, runId);
    const core = produceReceipt({
      ...normal,
      sequence: 1,
      parent_head: anchors['genesis_head'],
      parent_checkpoint_head: anchors['genesis_head'],
      run_id: runId,
      producer_phase: phase,
      request_key: sha256({ phase, runId, payload, head }),
      actor_decision: 'approved-publisher',
      operation: {
        initial_claimed: true,
        retry_claimed: false,
        status: 'succeeded',
        payload_sha256: payload,
        target_id: target,
        expected_head: head,
        result_id: null,
        reason: null,
      },
      outcome,
    });
    return platform.upload(core, 'receipt', stringField(core, 'transition_id'), phase);
  };
  const verifier = authority('verifier', 'behavioral-red-relevant', baseline, sha256(testBytes));
  const input = {
    repository_path: root,
    test_path: testPath,
    test_sha256: sha256(testBytes),
    verifier_authority: verifier,
  };
  const patchBytes = (head: string): Buffer =>
    execFileSync(
      'git',
      [
        '-c',
        'credential.helper=',
        '-C',
        root,
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--binary',
        baseline,
        head,
      ],
      { env: gitFixtureEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] },
    );
  const fix = (): string => {
    fs.writeFileSync(
      path.join(root, 'bin/application.mjs'),
      'export const sum = (left, right) => left + right;\n',
    );
    git(['add', 'bin/application.mjs']);
    git(['commit', '-qm', 'fixture: repair addition']);
    return git(['rev-parse', 'HEAD']);
  };
  return {
    platform,
    context,
    bootstrapContext,
    activation,
    genesisReceipt: receipt,
    genesis: anchors,
    root,
    baseline,
    testBytes,
    testPath,
    input,
    git,
    authority,
    patchBytes,
    fix,
  };
}

it('AC17 executes relevant immutable assertion RED then the identical GREEN and real secretless npm gate', async (test) => {
  const fixture = await reproductionFixture(test);
  const sentinels = ['GITHUB_TOKEN', 'OCR_LLM_AUTH_TOKEN', 'FACTORY_OWNER_SECRET'];
  const original = new Map(sentinels.map((key) => [key, process.env[key]]));
  try {
    for (const key of sentinels) process.env[key] = 'synthetic-parent-only';
    const red = await runReproduction(fixture.context, { ...fixture.input, phase: 'red' });
    assert.equal(red.status, 'accepted', red.reason);
    assert.equal(record(red.record)['test_sha256'], sha256(fixture.testBytes));
    assert.notEqual(record(red.record)['exit'], 0);
    const redAuthority = fixture.authority(
      'verifier',
      'behavioral-red',
      fixture.baseline,
      sha256(fixture.testBytes),
    );
    const head = fixture.fix();
    const patchBytes = fixture.patchBytes(head);
    const patchAuthority = fixture.authority('patch', 'patch-candidate', head, sha256(patchBytes));
    const green = await runReproduction(fixture.context, {
      ...fixture.input,
      phase: 'green',
      red_authority: redAuthority,
      patch_authority: patchAuthority,
    });
    assert.equal(green.status, 'accepted', green.reason);
    assert.match(green.reason, /complete secretless gate/);
    assert.equal(record(green.record)['test_sha256'], sha256(fixture.testBytes));
    assert.equal(
      fs.readFileSync(path.join(fixture.root, REPRODUCTION_PATH)).equals(fixture.testBytes),
      true,
    );
    assert.equal(
      fixture.git(['diff', '--name-only', fixture.baseline, head]),
      'bin/application.mjs',
    );
    assert.deepEqual(fs.readdirSync(path.join(fixture.root, '.build')), []);
  } finally {
    for (const key of sentinels) {
      const value = original.get(key);
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
});

it('AC17 denies import, syntax, execution-environment failures and an already passing probe as behavioral RED', async (test) => {
  const controls: readonly [string, Buffer][] = [
    ['import-failure', Buffer.from("import './missing-dependency.mjs';\n")],
    ['syntax-failure', Buffer.from('const = ;\n')],
    [
      'environment-failure',
      Buffer.from(
        "import { it } from 'node:test'; it('needs an unavailable executable environment', () => { throw new Error('Required execution environment unavailable'); });\n",
      ),
    ],
    [
      'already-green',
      Buffer.from(
        "import assert from 'node:assert/strict'; import { it } from 'node:test'; it('already passes', () => assert.equal(1, 1));\n",
      ),
    ],
  ];
  for (const [name, bytes] of controls)
    await test.test(name, async (subtest) => {
      const fixture = await reproductionFixture(subtest, bytes);
      const result = await runReproduction(fixture.context, { ...fixture.input, phase: 'red' });
      assert.equal(result.status, 'denied');
      assert.match(result.reason, /No independently relevant behavioral assertion RED/);
      assert.equal(fs.readFileSync(path.join(fixture.root, REPRODUCTION_PATH)).equals(bytes), true);
    });
});

it('AC17 rejects source drift, immutable-test tampering, protected patches and failed complete native gate', async (test) => {
  for (const failure of [
    'source-drift',
    'test-tamper',
    'protected-test-patch',
    'package-tamper',
    'full-gate-failure',
    'missing-red-binding',
  ])
    await test.test(failure, async (subtest) => {
      const fixture = await reproductionFixture(
        subtest,
        BEHAVIORAL_TEST,
        failure === 'full-gate-failure',
      );
      const red = await runReproduction(fixture.context, { ...fixture.input, phase: 'red' });
      assert.equal(red.status, 'accepted', red.reason);
      const redAuthority = fixture.authority(
        'verifier',
        'behavioral-red',
        fixture.baseline,
        sha256(fixture.testBytes),
      );
      const repaired = fixture.fix();
      if (failure === 'protected-test-patch') {
        fs.appendFileSync(
          path.join(fixture.root, REPRODUCTION_PATH),
          '\n// unauthorized weakening\n',
        );
        fixture.git(['add', REPRODUCTION_PATH]);
        fixture.git(['commit', '-qm', 'fixture: forbidden test edit']);
      }
      const head = fixture.git(['rev-parse', 'HEAD']);
      const patchBytes = fixture.patchBytes(head);
      const patchAuthority = fixture.authority(
        'patch',
        'patch-candidate',
        head,
        sha256(patchBytes),
      );
      if (failure === 'source-drift') fixture.git(['checkout', '--quiet', fixture.baseline]);
      if (failure === 'test-tamper')
        fs.appendFileSync(path.join(fixture.root, REPRODUCTION_PATH), '\n// untracked tampering\n');
      if (failure === 'package-tamper')
        fs.writeFileSync(path.join(fixture.root, 'package.json'), '{"scripts":{"ci":"true"}}');
      const expectedRed =
        failure === 'missing-red-binding'
          ? fixture.authority('verifier', 'behavioral-red', repaired, sha256(fixture.testBytes))
          : redAuthority;
      const result = await runReproduction(fixture.context, {
        ...fixture.input,
        phase: 'green',
        red_authority: expectedRed,
        patch_authority: patchAuthority,
      });
      assert.equal(result.status, 'denied');
      const reasons: Readonly<Record<string, RegExp>> = {
        'source-drift': /source\/path drift/,
        'test-tamper': /tracked working tree/,
        'protected-test-patch': /authenticated immutable reproduction/,
        'package-tamper': /tracked working tree/,
        'full-gate-failure': /Complete secretless gate failed/,
        'missing-red-binding': /Missing unchanged authenticated behavioral RED/,
      };
      assert.match(result.reason, reasons[failure] ?? /denied/);
    });
});

it('AC17 refuses dirty tracked application bytes before GREEN and exact probe changes outside the protected tests glob', async (test) => {
  for (const failure of ['dirty-application', 'root-probe-patch'])
    await test.test(failure, async (subtest) => {
      const bytes =
        failure === 'root-probe-patch'
          ? Buffer.from(
              BEHAVIORAL_TEST.toString().replace('../bin/application.mjs', './bin/application.mjs'),
            )
          : BEHAVIORAL_TEST;
      const testPath =
        failure === 'root-probe-patch' ? 'reproduction-probe.mjs' : REPRODUCTION_PATH;
      const fixture = await reproductionFixture(subtest, bytes, false, testPath);
      const red = await runReproduction(fixture.context, { ...fixture.input, phase: 'red' });
      assert.equal(red.status, 'accepted', red.reason);
      const redAuthority = fixture.authority(
        'verifier',
        'behavioral-red',
        fixture.baseline,
        sha256(bytes),
      );
      fixture.fix();
      if (failure === 'root-probe-patch') {
        fs.appendFileSync(
          path.join(fixture.root, testPath),
          '\n// candidate changes the authenticated probe\n',
        );
        fixture.git(['add', testPath]);
        fixture.git(['commit', '-qm', 'fixture: changed probe outside test directory']);
      }
      const head = fixture.git(['rev-parse', 'HEAD']);
      const patchAuthority = fixture.authority(
        'patch',
        'patch-candidate',
        head,
        sha256(fixture.patchBytes(head)),
      );
      if (failure === 'root-probe-patch')
        fs.writeFileSync(path.join(fixture.root, testPath), bytes);
      else
        fs.appendFileSync(
          path.join(fixture.root, 'bin/application.mjs'),
          '\nexport const unreviewed = true;\n',
        );
      const green = await runReproduction(fixture.context, {
        ...fixture.input,
        phase: 'green',
        red_authority: redAuthority,
        patch_authority: patchAuthority,
      });
      assert.equal(green.status, 'denied');
      assert.match(
        green.reason,
        failure === 'root-probe-patch'
          ? /Patch changes the authenticated immutable reproduction/
          : /tracked working tree differs from authenticated HEAD/,
      );
    });
});

it('AC17 detects a real child test mutating tracked application source before accepting behavioral RED', async (test) => {
  const bytes = Buffer.from(`${BEHAVIORAL_TEST.toString()}
import fs from 'node:fs';
it('mutates tracked application during execution', () => fs.appendFileSync(new URL('../bin/application.mjs', import.meta.url), '\\nexport const unreviewed = true;\\n'));
`);
  const fixture = await reproductionFixture(test, bytes);
  const result = await runReproduction(fixture.context, { ...fixture.input, phase: 'red' });
  assert.equal(result.status, 'denied');
  assert.match(result.reason, /Reproduction changed tracked source or authenticated HEAD/);
  assert.equal(fs.readFileSync(path.join(fixture.root, REPRODUCTION_PATH)).equals(bytes), true);
  assert.match(
    fs.readFileSync(path.join(fixture.root, 'bin/application.mjs'), 'utf8'),
    /unreviewed = true/,
  );
});

async function publishedHeadFixture(test: TestContext) {
  const fixture = await reproductionFixture(test);
  const { platform, activation, baseline, genesis } = fixture;
  platform.git(['fetch', '--quiet', fixture.root, baseline]);
  platform.git(['update-ref', 'refs/heads/main', baseline]);
  const red = await runReproduction(fixture.context, { ...fixture.input, phase: 'red' });
  assert.equal(red.status, 'accepted', red.reason);
  const redAuthority = fixture.authority(
    'verifier',
    'behavioral-red',
    baseline,
    sha256(fixture.testBytes),
  );
  const head = fixture.fix();
  const patchAuthority = fixture.authority(
    'patch',
    'patch-candidate',
    head,
    sha256(fixture.patchBytes(head)),
  );
  const green = await runReproduction(fixture.context, {
    ...fixture.input,
    phase: 'green',
    red_authority: redAuthority,
    patch_authority: patchAuthority,
  });
  assert.equal(green.status, 'accepted', green.reason);
  platform.git(['fetch', '--quiet', fixture.root, head]);
  const checkpoint = await runController(fixture.bootstrapContext, { command: 'checkpoint' });
  assert.equal(checkpoint.status, 'accepted', checkpoint.reason);
  platform.upload(
    record(checkpoint.record),
    'checkpoint',
    stringField(fixture.genesisReceipt, 'transition_id'),
    'checkpoint',
  );
  const identity = {
    repository_id: '1230959148',
    fingerprint_policy_revision: 'reviewed-v1',
    fingerprint: sha256({ baseline, test_sha256: sha256(fixture.testBytes) }),
    issue_node_id: 'I_PATCH',
  };
  const marker = {
    repository_id: identity.repository_id,
    fingerprint_policy_revision: identity.fingerprint_policy_revision,
    fingerprint: identity.fingerprint,
  };
  const issue = {
    number: 42,
    node_id: identity.issue_node_id,
    user: { id: 23296915, login: 'apolenkov' },
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
  const references: Record<string, JsonRecord> = {};
  for (const [phase, target] of [
    ['scan', identity.fingerprint_policy_revision],
    ['verifier', identity.fingerprint],
  ] as const) {
    const envelope = fixture.authority(
      phase,
      phase === 'scan' ? 'complete' : 'confirmed',
      baseline,
      sha256(marker),
      target,
    );
    const transport = record(envelope['transport']);
    const receipt = record(envelope['receipt']);
    references[phase] = {
      artifact_id: transport['artifact_id'],
      archive_sha256: transport['archive_sha256'],
      receipt_sha256: envelope['receipt_sha256'],
      run_id: receipt['run_id'],
      run_attempt: 1,
      producer_job_id: transport['producer_job_id'],
      source_sha: platform.release,
    };
  }
  const registrationContext = platform.context(activation, '9520');
  const {
    bootstrap_ticket: _ticket,
    legacy_inventory_sha256: _inventory,
    ...normal
  } = fixture.genesisReceipt;
  const publication = produceReceipt({
    ...normal,
    sequence: 1,
    parent_head: genesis['genesis_head'],
    parent_checkpoint_head: genesis['genesis_head'],
    run_id: '9520',
    default_head: baseline,
    actor_decision: 'approved-publisher',
    producer_phase: 'publication',
    request_key: sha256(marker),
    lineage_id: sha256(identity),
    issue_node_id: identity.issue_node_id,
    issue_number: 42,
    fingerprint_policy_revision: identity.fingerprint_policy_revision,
    fingerprint: identity.fingerprint,
    baseline_sha: baseline,
    current_source_head: baseline,
    expected_transition: 'eligible',
    reservation_number: null,
    aliases: [{ kind: 'issue', id: '42', head: null, original_identity_sha256: sha256(identity) }],
    outcome: 'confirmed',
    evidence: references,
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
  const reserveContext = platform.context(activation, '9521');
  const registeredCheckpoint = await runController(reserveContext, { command: 'checkpoint' });
  assert.equal(registeredCheckpoint.status, 'accepted', registeredCheckpoint.reason);
  platform.upload(
    record(registeredCheckpoint.record),
    'checkpoint',
    stringField(registerCore, 'transition_id'),
    'checkpoint',
  );
  const reserve = await runController(reserveContext, {
    command: 'reserve',
    issue_number: 42,
    event_id: '12',
  });
  assert.equal(reserve.status, 'accepted', reserve.reason);
  const reserveCore = record(reserve.record);
  const reserved = await runController(reserveContext, {
    command: 'append',
    envelope: platform.upload(
      reserveCore,
      'receipt',
      stringField(reserveCore, 'transition_id'),
      'reserve',
    ),
  });
  assert.equal(reserved.status, 'accepted', reserved.reason);
  const context = platform.context(activation, '9522');
  const patch = produceReceipt({
    ...reserveCore,
    producer_phase: 'patch',
    run_id: '9522',
    sequence: 3,
    parent_head: record(reserved.record)['state_head'],
    parent_checkpoint_head: record(reserved.record)['state_head'],
    current_source_head: head,
    expected_transition: 'patch-ready',
    outcome: 'patch-ready',
  });
  const authority = platform.upload(patch, 'receipt', stringField(patch, 'transition_id'), 'patch');
  const branch = `factory/${stringField(patch, 'lineage_id')}/1`;
  platform.git(['update-ref', `refs/heads/${branch}`, head]);
  fixture.git(['remote', 'set-url', 'origin', 'https://github.com/apolenkov/feynman.git']);
  platform.pulls.push({
    number: 7,
    node_id: 'PR_EXACT',
    state: 'open',
    merged: false,
    head: { ref: branch, sha: head, repo: { id: 1230959148 } },
    base: { ref: 'main', repo: { id: 1230959148 } },
    body: `Fixes #42\n\nFactory lineage: ${stringField(patch, 'lineage_id')}`,
  });
  return {
    ...fixture,
    context,
    branch,
    head,
    input: {
      authority,
      repository_path: fixture.root,
      expected_head: head,
      remote_expected_head: null,
      issue_number: 42,
      event_id: '12',
    },
  };
}

it('AC14–15 recovers an actual already published exact Git head and canonical existing PR without regenerating or republishing', async (test) => {
  const fixture = await publishedHeadFixture(test);
  const before = fixture.platform.requests.filter((request) => request.method !== 'GET').length;
  const result = await publishPatch(fixture.context, fixture.input);
  assert.equal(result.status, 'accepted', result.reason);
  assert.match(result.reason, /Exact existing PR resumed without model/);
  assert.equal(record(result.record)['pr_number'], 7);
  assert.equal(record(result.record)['head'], fixture.head);
  assert.equal(fixture.platform.git(['rev-parse', `refs/heads/${fixture.branch}`]), fixture.head);
  assert.equal(
    fixture.platform.requests.filter((request) => request.method !== 'GET').length,
    before,
  );
  assert.equal(fixture.platform.pulls.length, 1);
});

it('AC14–15 preserves exact published head and consumed quota on foreign PR, mismatched head/body, unknown API or foreign push origin', async (test) => {
  for (const failure of [
    'foreign-pr',
    'wrong-head',
    'wrong-body',
    'unknown-api',
    'foreign-push-origin',
  ])
    await test.test(failure, async (subtest) => {
      const fixture = await publishedHeadFixture(subtest);
      const { platform } = fixture;
      if (failure === 'foreign-pr')
        platform.pulls[0] = {
          ...record(platform.pulls[0]),
          head: { ref: fixture.branch, sha: fixture.head, repo: { id: 999 } },
        };
      if (failure === 'wrong-head')
        platform.pulls[0] = {
          ...record(platform.pulls[0]),
          head: { ref: fixture.branch, sha: fixture.baseline, repo: { id: 1230959148 } },
        };
      if (failure === 'wrong-body')
        platform.pulls[0] = { ...record(platform.pulls[0]), body: 'Fixes #999' };
      if (failure === 'unknown-api')
        platform.failures.set(`GET /repos/apolenkov/feynman/git/ref/heads/${fixture.branch}`, 503);
      if (failure === 'foreign-push-origin')
        fixture.git([
          'remote',
          'set-url',
          '--push',
          'origin',
          'https://example.invalid/unreviewed.git',
        ]);
      const state = platform.git(['rev-parse', 'refs/heads/factory-state']);
      const before = platform.requests.filter((request) => request.method !== 'GET').length;
      const result = await publishPatch(fixture.context, fixture.input);
      assert.equal(result.status, 'needs-human', failure);
      assert.equal(
        platform.requests.filter((request) => request.method !== 'GET').length,
        before,
        failure,
      );
      assert.equal(platform.git(['rev-parse', `refs/heads/${fixture.branch}`]), fixture.head);
      assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), state);
      const patch = record(record(fixture.input.authority)['receipt']);
      const parsed: unknown = JSON.parse(
        platform.git(['show', `${state}:lineages/${stringField(patch, 'lineage_id')}.json`]),
      );
      const lineage = record(parsed);
      assert.equal(arrayField(lineage, 'reservations').length, 1);
    });
});

it('emits a native protocol authority marker from an actual prepared receipt with exact artifact output binding', async (test) => {
  const platform = new FactoryPlatform(test);
  const reviewed = platform.activation({
    activation: false,
    bootstrap_completed: false,
    genesis_head: null,
    genesis_receipt_sha256: null,
    legacy_inventory_sha256: null,
  });
  const context = platform.context(reviewed, '9701', 'bootstrap');
  const result = await runController(context, {
    command: 'bootstrap',
    bootstrap_ticket: reviewed['bootstrap_ticket'],
  });
  assert.equal(result.status, 'accepted', result.reason);
  const receipt = record(record(result.record)['receipt']);
  const file = path.join(platform.root, 'receipt.json');
  fs.writeFileSync(file, canonicalBytes(receipt));
  const output = execFileSync(process.execPath, ['scripts/factory-protocol.ts', 'emit', file], {
    encoding: 'utf8',
    env: {
      PATH: process.env['PATH'],
      HOME: platform.root,
      FACTORY_ARTIFACT_ID: '987654',
      FACTORY_ARTIFACT_DIGEST: 'd'.repeat(64),
    },
  });
  const marker = authorityMarker(Buffer.from(output));
  assert.equal(marker['kind'], 'receipt');
  assert.equal(marker['run_id'], '9701');
  assert.equal(marker['workflow_id'], '703');
  assert.equal(marker['phase'], 'bootstrap');
  assert.equal(marker['transition_id'], receipt['transition_id']);
  assert.equal(marker['receipt_sha256'], sha256(receipt));
  assert.equal(marker['artifact_id'], '987654');
  assert.equal(marker['archive_sha256'], 'd'.repeat(64));
});

async function humanMergedFixture(test: TestContext) {
  const fixture = await publishedHeadFixture(test);
  const { platform, head, baseline } = fixture;
  const tree = platform.git(['rev-parse', `${head}^{tree}`]);
  const delivered = execFileSync(
    'git',
    ['--git-dir', platform.repository, 'commit-tree', tree, '-p', baseline],
    {
      env: {
        ...gitFixtureEnvironment(),
        GIT_AUTHOR_NAME: 'Human owner',
        GIT_AUTHOR_EMAIL: 'human@example.invalid',
        GIT_COMMITTER_NAME: 'Human owner',
        GIT_COMMITTER_EMAIL: 'human@example.invalid',
      },
      input: 'fixture: human squash merge\n',
      encoding: 'utf8',
    },
  ).trim();
  platform.git(['update-ref', 'refs/heads/main', delivered]);
  assert.equal(
    platform.git(['rev-parse', `${delivered}^{tree}`]),
    platform.git(['rev-parse', `${head}^{tree}`]),
  );
  assert.equal(platform.git(['show', '-s', '--format=%P', delivered]), baseline);
  const pr = {
    ...record(platform.pulls[0]),
    merged: true,
    state: 'closed',
    merged_at: '2026-10-12T00:20:00Z',
    merge_commit_sha: delivered,
    user: { id: 9900, login: 'fixture-publisher' },
    merged_by: { id: 23296915, login: 'apolenkov', type: 'User' },
  };
  platform.pulls[0] = pr;
  platform.facts.set('/repos/apolenkov/feynman/pulls/7', pr);
  platform.facts.set('graphql:PR_EXACT', {
    node: {
      closingIssuesReferences: {
        nodes: [{ id: 'I_PATCH', number: 42, repository: { databaseId: 1230959148 } }],
        pageInfo: { hasNextPage: false },
      },
    },
  });
  platform.facts.set(`/repos/apolenkov/feynman/commits/${head}/check-runs`, {
    total_count: 2,
    check_runs: [
      {
        id: 9802,
        name: 'Test (Node 22 on ubuntu-latest)',
        head_sha: head,
        conclusion: 'success',
        app: { id: 15368 },
        details_url: 'https://github.com/apolenkov/feynman/actions/runs/9801',
      },
      {
        id: 9803,
        name: 'Test (Node 22 on macos-latest)',
        head_sha: head,
        conclusion: 'success',
        app: { id: 15368 },
        details_url: 'https://github.com/apolenkov/feynman/actions/runs/9801',
      },
    ],
  });
  platform.facts.set('/repos/apolenkov/feynman/actions/runs/9801', {
    id: 9801,
    workflow_id: 272235418,
    path: '.github/workflows/ci.yml',
    head_sha: head,
    status: 'completed',
    conclusion: 'success',
    repository: { id: 1230959148 },
  });
  platform.facts.set('/repos/apolenkov/feynman/pulls/7/reviews', [
    { id: 9810, commit_id: head, state: 'APPROVED', user: { id: 23296915, login: 'apolenkov' } },
  ]);
  const issue = {
    ...record(platform.facts.get('/repos/apolenkov/feynman/issues/42')),
    state: 'closed',
    state_reason: 'completed',
    closed_at: '2026-10-12T00:20:00Z',
    closed_by: { id: 23296915, login: 'apolenkov' },
  };
  platform.issues[0] = issue;
  platform.facts.set('/repos/apolenkov/feynman/issues/42', issue);
  return {
    ...fixture,
    delivered,
    input: { ...fixture.input, pr_number: 7, merge_commit_sha: delivered },
  };
}

it('AC18–19 verifies canonical issue closure from bound human-merged Git, checks, linkage and review without rewriting and repeats idempotently', async (test) => {
  const fixture = await humanMergedFixture(test);
  const { platform } = fixture;
  const before = platform.requests.length;
  const result = await reconcileClosure(fixture.context, fixture.input);
  assert.equal(result.status, 'accepted', result.reason);
  assert.equal(record(platform.facts.get('/repos/apolenkov/feynman/issues/42'))['state'], 'closed');
  assert.equal(
    platform.requests
      .slice(before)
      .filter(
        (request) =>
          request.method === 'PATCH' && request.path === '/repos/apolenkov/feynman/issues/42',
      ).length,
    0,
  );
  assert.equal(platform.git(['rev-parse', 'refs/heads/main']), fixture.delivered);
  assert.equal(
    platform.git(['rev-parse', `refs/heads/${fixture.branch}`]),
    fixture.head,
    'Ordinary cleanup retains the native squash branch when ancestry is unproved',
  );
  const repeated = await reconcileClosure(fixture.context, fixture.input);
  assert.equal(repeated.status, 'accepted', repeated.reason);
  assert.equal(
    platform.requests
      .slice(before)
      .filter(
        (request) =>
          request.method === 'PATCH' && request.path === '/repos/apolenkov/feynman/issues/42',
      ).length,
    0,
  );
});

it('AC18 independently refuses stale checks, foreign closing linkage and author-only review before issue closure', async (test) => {
  for (const failure of [
    'wrong-check-head',
    'foreign-linkage',
    'author-review',
    'still-open-issue',
  ])
    await test.test(failure, async (subtest) => {
      const fixture = await humanMergedFixture(subtest);
      const { platform } = fixture;
      if (failure === 'wrong-check-head') {
        const route = `/repos/apolenkov/feynman/commits/${fixture.head}/check-runs`;
        const inventory = record(platform.facts.get(route));
        platform.facts.set(route, {
          ...inventory,
          check_runs: arrayField(inventory, 'check_runs').map((check, index) =>
            index === 0 ? { ...record(check), head_sha: fixture.baseline } : check,
          ),
        });
      }
      if (failure === 'foreign-linkage')
        platform.facts.set('graphql:PR_EXACT', {
          node: {
            closingIssuesReferences: {
              nodes: [{ id: 'I_PATCH', number: 42, repository: { databaseId: 999 } }],
              pageInfo: { hasNextPage: false },
            },
          },
        });
      if (failure === 'author-review')
        platform.facts.set('/repos/apolenkov/feynman/pulls/7/reviews', [
          {
            id: 9810,
            commit_id: fixture.head,
            state: 'APPROVED',
            user: { id: 9900, login: 'fixture-publisher' },
          },
        ]);
      if (failure === 'still-open-issue')
        platform.facts.set('/repos/apolenkov/feynman/issues/42', {
          ...record(platform.facts.get('/repos/apolenkov/feynman/issues/42')),
          state: 'open',
        });
      const before = platform.requests.length;
      const state = platform.git(['rev-parse', 'refs/heads/factory-state']);
      const result = await reconcileClosure(fixture.context, fixture.input);
      assert.equal(result.status, 'needs-human', failure);
      assert.equal(
        record(platform.facts.get('/repos/apolenkov/feynman/issues/42'))['state'],
        failure === 'still-open-issue' ? 'open' : 'closed',
      );
      assert.equal(
        platform.requests
          .slice(before)
          .some(
            (request) =>
              request.method === 'PATCH' && request.path === '/repos/apolenkov/feynman/issues/42',
          ),
        false,
        failure,
      );
      assert.equal(platform.git(['rev-parse', `refs/heads/${fixture.branch}`]), fixture.head);
      assert.equal(platform.git(['rev-parse', 'refs/heads/factory-state']), state);
    });
});

async function publicationFindingFixture(test: TestContext) {
  const fixture = await reproductionFixture(test);
  const { platform, baseline } = fixture;
  platform.git(['fetch', '--quiet', fixture.root, baseline]);
  platform.git(['update-ref', 'refs/heads/main', baseline]);
  const red = await runReproduction(fixture.context, { ...fixture.input, phase: 'red' });
  assert.equal(red.status, 'accepted', red.reason);
  const fingerprint = sha256({ baseline, test_sha256: sha256(fixture.testBytes) });
  const finding = { fingerprint, path: 'bin/application.mjs', severity: 'high' };
  const authority = fixture.authority(
    'verifier',
    'confirmed',
    baseline,
    sha256(finding),
    fingerprint,
  );
  const document = {
    repository_id: '1230959148',
    source_sha: baseline,
    fingerprint_policy_revision: 'reviewed-v1',
    inventory: ['bin/application.mjs'],
    inventory_sha256: sha256(['bin/application.mjs']),
    covered: ['bin/application.mjs'],
    excluded: [],
    failed: [],
    token_usage: 10,
    token_budget: 1000,
    truncated: false,
    successful: true,
    tool_revision: 'fixture-scanner-v1',
    config_revision: 'fixture-app-scope-v1',
    findings: [{ ...finding, authority }],
  };
  const scan = fixture.authority('scan', 'complete', baseline, sha256(document), 'reviewed-v1');
  return { ...fixture, finding, fingerprint, scan: { ...document, authority: scan } };
}

it('AC03–05 discovers a real accepted issue POST after lost acknowledgement and deduplicates the same scan without blind retry', async (test) => {
  const fixture = await publicationFindingFixture(test);
  const { platform } = fixture;
  const fetch = platform.fetch.bind(platform);
  let acknowledgedPost = false;
  test.mock.method(
    platform,
    'fetch',
    async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const response = await fetch(input, init);
      const url = new URL(input instanceof Request ? input.url : input);
      if (init?.method === 'POST' && url.pathname === '/repos/apolenkov/feynman/issues') {
        acknowledgedPost = true;
        return new Response('{}', { status: 503 });
      }
      return response;
    },
  );
  const result = await reconcilePublication(fixture.context, fixture.scan);
  assert.equal(acknowledgedPost, true);
  assert.equal(result.status, 'accepted', result.reason);
  assert.equal(platform.issues.length, 1);
  assert.equal(result.issues.length, 1);
  assert.equal(record(result.issues[0])['issue_node_id'], record(platform.issues[0])['node_id']);
  const repeated = await reconcilePublication(fixture.context, fixture.scan);
  assert.equal(repeated.status, 'accepted', repeated.reason);
  assert.equal(
    platform.requests.filter(
      (request) => request.method === 'POST' && request.path === '/repos/apolenkov/feynman/issues',
    ).length,
    1,
  );
});

it('AC03–05 refuses ambiguous failed POST adoption from a foreign repository marker with the same fingerprint', async (test) => {
  const fixture = await publicationFindingFixture(test);
  const { platform } = fixture;
  platform.issues.push({
    number: 55,
    node_id: 'I_FOREIGN_MARKER',
    user: { id: 23296915, login: 'apolenkov' },
    state: 'open',
    body: `<!-- factory-finding-v1 ${JSON.stringify({ repository_id: '999', fingerprint_policy_revision: 'reviewed-v1', fingerprint: fixture.fingerprint })} -->`,
  });
  platform.failures.set('POST /repos/apolenkov/feynman/issues', 503);
  const result = await reconcilePublication(fixture.context, fixture.scan);
  assert.equal(result.status, 'needs-human');
  assert.equal(result.dispatch.length, 0);
  assert.equal(platform.issues.length, 1);
  assert.equal(
    platform.requests.filter(
      (request) => request.method === 'POST' && request.path === '/repos/apolenkov/feynman/issues',
    ).length,
    1,
  );
  assert.equal(
    platform.requests.some((request) => request.method === 'PATCH'),
    false,
  );
});

it('AC03–05 retains a human-closed canonical finding and never reopens it merely because a new scan still finds the bug', async (test) => {
  const fixture = await publicationFindingFixture(test);
  const { platform } = fixture;
  const issue = {
    number: 42,
    node_id: 'I_HUMAN_CLOSED',
    user: { id: 23296915, login: 'apolenkov' },
    state: 'closed',
    body: `<!-- factory-finding-v1 ${JSON.stringify({ repository_id: '1230959148', fingerprint_policy_revision: 'reviewed-v1', fingerprint: fixture.fingerprint })} -->`,
  };
  platform.issues.push(issue);
  platform.facts.set('/repos/apolenkov/feynman/issues/42', issue);
  platform.facts.set('/repos/apolenkov/feynman/issues/42/comments', []);
  const before = platform.requests.length;
  const result = await reconcilePublication(fixture.context, fixture.scan);
  assert.equal(result.status, 'accepted', result.reason);
  assert.equal(result.dispatch.length, 0);
  assert.equal(record(result.issues[0])['repair_state'], 'needs-human');
  assert.equal(record(platform.issues[0])['state'], 'closed');
  assert.equal(
    platform.requests.slice(before).some((request) => request.method !== 'GET'),
    false,
  );
});

it('AC04–05 requires complete actual scan coverage and independently bound absence proof before closing a missing canonical finding', async (test) => {
  for (const control of ['complete-absence', 'incomplete-coverage', 'wrong-issue-proof'])
    await test.test(control, async (subtest) => {
      const fixture = await publicationFindingFixture(subtest);
      const { platform } = fixture;
      const identity = {
        repository_id: '1230959148',
        fingerprint_policy_revision: 'reviewed-v1',
        fingerprint: fixture.fingerprint,
      };
      const issue = {
        number: 42,
        node_id: 'I_ABSENT',
        user: { id: 23296915, login: 'apolenkov' },
        state: 'open',
        body: `<!-- factory-finding-v1 ${JSON.stringify(identity)} -->`,
      };
      platform.issues.push(issue);
      platform.facts.set('/repos/apolenkov/feynman/issues/42', issue);
      const redAuthority = fixture.authority(
        'verifier',
        'behavioral-red',
        fixture.baseline,
        sha256(fixture.testBytes),
      );
      const repaired = fixture.fix();
      const patchAuthority = fixture.authority(
        'patch',
        'patch-candidate',
        repaired,
        sha256(fixture.patchBytes(repaired)),
      );
      const green = await runReproduction(fixture.context, {
        ...fixture.input,
        phase: 'green',
        red_authority: redAuthority,
        patch_authority: patchAuthority,
      });
      assert.equal(green.status, 'accepted', green.reason);
      platform.git(['fetch', '--quiet', fixture.root, repaired]);
      platform.git(['update-ref', 'refs/heads/main', repaired]);
      const runId = '9890';
      platform.context(fixture.activation, runId);
      const {
        bootstrap_ticket: _ticket,
        legacy_inventory_sha256: _inventory,
        ...normal
      } = fixture.genesisReceipt;
      const nodeId = control === 'wrong-issue-proof' ? 'I_FOREIGN' : issue.node_id;
      const stable = { ...identity, issue_node_id: nodeId };
      const absentProof = produceReceipt({
        ...normal,
        sequence: 1,
        parent_head: fixture.genesis['genesis_head'],
        parent_checkpoint_head: fixture.genesis['genesis_head'],
        run_id: runId,
        producer_phase: 'verifier',
        request_key: sha256({ identity: stable, source_sha: repaired }),
        actor_decision: 'approved-publisher',
        lineage_id: sha256(stable),
        issue_node_id: nodeId,
        issue_number: 42,
        fingerprint_policy_revision: identity.fingerprint_policy_revision,
        fingerprint: identity.fingerprint,
        baseline_sha: repaired,
        current_source_head: repaired,
        expected_transition: 'closed',
        outcome: 'complete-absence',
        aliases: [
          { kind: 'issue', id: '42', head: null, original_identity_sha256: sha256(stable) },
        ],
      });
      const proof = platform.upload(
        absentProof,
        'receipt',
        stringField(absentProof, 'transition_id'),
        'verifier',
      );
      const { authority: _scan, ...document } = fixture.scan;
      const absent = {
        ...document,
        source_sha: repaired,
        findings: [],
        covered: control === 'incomplete-coverage' ? [] : ['bin/application.mjs'],
        failed: control === 'incomplete-coverage' ? ['bin/application.mjs'] : [],
      };
      const scanAuthority = fixture.authority(
        'scan',
        control === 'incomplete-coverage' ? 'partial' : 'complete',
        repaired,
        sha256(absent),
        'reviewed-v1',
      );
      const before = platform.requests.length;
      const result = await reconcilePublication(fixture.context, {
        ...absent,
        authority: scanAuthority,
        disappearance_authority: { [issue.node_id]: proof },
      });
      assert.equal(
        result.status,
        control === 'wrong-issue-proof' ? 'needs-human' : 'accepted',
        result.reason,
      );
      assert.equal(
        record(platform.facts.get('/repos/apolenkov/feynman/issues/42'))['state'],
        control === 'complete-absence' ? 'closed' : 'open',
      );
      assert.equal(
        platform.requests.slice(before).filter((request) => request.method === 'PATCH').length,
        control === 'complete-absence' ? 1 : 0,
      );
    });
});

function refreshedScan(
  fixture: Awaited<ReturnType<typeof publicationFindingFixture>>,
  findings: readonly JsonRecord[],
): JsonRecord {
  const { authority: _authority, ...document } = fixture.scan;
  const next = { ...document, findings };
  return {
    ...next,
    authority: fixture.authority('scan', 'complete', fixture.baseline, sha256(next), 'reviewed-v1'),
  };
}

it('Opus F1 skips foreign valid and malformed issue markers before canonical publication or disappearance', async (test) => {
  for (const trustedId of [23296915, 41898282, null])
    await test.test(`canonical author ${trustedId ?? 'foreign-only'}`, async (subtest) => {
      const fixture = await publicationFindingFixture(subtest);
      const { platform } = fixture;
      const identity = {
        repository_id: '1230959148',
        fingerprint_policy_revision: 'reviewed-v1',
        fingerprint: fixture.fingerprint,
      };
      const marker = `<!-- factory-finding-v1 ${JSON.stringify(identity)} -->`;
      const foreign = [
        {
          number: 51,
          node_id: 'I_FOREIGN_DUPLICATE',
          user: { id: 999, login: 'apolenkov' },
          state: 'open',
          body: marker,
        },
        {
          number: 52,
          node_id: 'I_FOREIGN_MALFORMED',
          user: { id: 999 },
          state: 'open',
          body: '<!-- factory-finding-v1 {bad-json} -->',
        },
        {
          number: 53,
          node_id: 'I_FOREIGN_MISSING',
          user: { id: 999 },
          state: 'open',
          body: `<!-- factory-finding-v1 ${JSON.stringify({ ...identity, fingerprint: sha256('foreign missing finding') })} -->`,
        },
        {
          number: 54,
          node_id: 'I_NON_NUMERIC_AUTHOR',
          user: { id: '23296915' },
          state: 'open',
          body: marker,
        },
        { number: 55, node_id: 'I_UNKNOWN_AUTHOR', user: null, state: 'open', body: marker },
      ];
      platform.issues.push(...foreign);
      if (trustedId !== null)
        platform.issues.push({
          number: 42,
          node_id: 'I_TRUSTED',
          user: { id: trustedId },
          state: 'open',
          labels: [],
          body: marker,
        });
      if (trustedId !== null)
        platform.facts.set('/repos/apolenkov/feynman/issues/42', platform.issues.at(-1));
      const before = platform.requests.length;
      const result = await reconcilePublication(fixture.context, fixture.scan);
      assert.equal(result.status, 'accepted', result.reason);
      assert.equal(result.issues.length, 1);
      const canonical = record(result.issues[0]);
      if (trustedId === null)
        assert.equal(
          foreign.some((issue) => issue.node_id === canonical['issue_node_id']),
          false,
        );
      else assert.equal(canonical['issue_node_id'], 'I_TRUSTED');
      const effects = platform.requests.slice(before).filter((request) => request.method !== 'GET');
      assert.equal(
        effects.filter((request) => request.method === 'POST').length,
        trustedId === null ? 1 : 0,
      );
      assert.equal(
        effects.some((request) =>
          foreign.some((issue) => request.path.endsWith(`/issues/${issue.number}`)),
        ),
        false,
      );
      for (const issue of foreign)
        assert.deepEqual(
          platform.issues.find((entry) => entry['node_id'] === issue.node_id),
          issue,
        );
    });
});

it('Opus F3 refreshes disputed to confirmed on the same issue with current severity/source labels and preserves unrelated labels', async (test) => {
  const fixture = await publicationFindingFixture(test);
  const finding = { ...fixture.finding, severity: 'low' };
  const disputed = {
    ...finding,
    authority: fixture.authority(
      'verifier',
      'disputed',
      fixture.baseline,
      sha256(finding),
      fixture.fingerprint,
    ),
  };
  const first = await reconcilePublication(fixture.context, refreshedScan(fixture, [disputed]));
  assert.equal(first.status, 'accepted', first.reason);
  const original = record(fixture.platform.issues[0]);
  const labeled = {
    ...original,
    labels: [
      { name: 'severity:low' },
      { name: 'severity:critical' },
      { name: 'factory-fix' },
      { name: 'owner-note' },
    ],
  };
  fixture.platform.issues[0] = labeled;
  fixture.platform.facts.set(
    `/repos/apolenkov/feynman/issues/${numberField(original, 'number')}`,
    labeled,
  );
  const confirmed = {
    ...fixture.finding,
    authority: fixture.authority(
      'verifier',
      'confirmed',
      fixture.baseline,
      sha256(fixture.finding),
      fixture.fingerprint,
    ),
  };
  const second = await reconcilePublication(fixture.context, refreshedScan(fixture, [confirmed]));
  assert.equal(second.status, 'accepted', second.reason);
  assert.equal(record(second.issues[0])['issue_node_id'], original['node_id']);
  const current = record(fixture.platform.issues[0]);
  assert.equal(current['title'], `[factory:confirmed] ${fixture.fingerprint.slice(0, 16)}`);
  assert.match(stringField(current, 'body'), /Confidence: confirmed\nRepair: eligible/);
  assert.deepEqual(arrayField(current, 'labels').toSorted(), [
    'factory-fix',
    'owner-note',
    'severity:high',
    'source:ocr-scan',
  ]);
  const posts = fixture.platform.requests.filter(
    (request) => request.method === 'POST' && request.path === '/repos/apolenkov/feynman/issues',
  );
  assert.equal(posts.length, 1);
  assert.deepEqual(arrayField(record(posts[0]?.body), 'labels').toSorted(), [
    'severity:low',
    'source:ocr-scan',
  ]);
  assert.equal(
    fixture.platform.requests.filter(
      (request) =>
        request.method === 'PATCH' &&
        request.path.endsWith(`/issues/${numberField(original, 'number')}`),
    ).length,
    1,
  );
});

it('Opus F6 caps only three new issues while existing first findings and refuted verdicts consume no creation allowance', async (test) => {
  const fixture = await publicationFindingFixture(test);
  const findings: JsonRecord[] = [];
  for (let index = 0; index < 8; index++) {
    const finding = { ...fixture.finding, fingerprint: sha256(`creation-cap-${index}`) };
    findings.push({
      ...finding,
      authority: fixture.authority(
        'verifier',
        index === 4 ? 'refuted' : 'confirmed',
        fixture.baseline,
        sha256(finding),
        finding.fingerprint,
      ),
    });
    if (index < 3) {
      fixture.platform.issues.push({
        number: 40 + index,
        node_id: `I_EXISTING_${index}`,
        user: { id: 23296915 },
        state: 'open',
        labels: [],
        body: `<!-- factory-finding-v1 ${JSON.stringify({ repository_id: '1230959148', fingerprint_policy_revision: 'reviewed-v1', fingerprint: finding.fingerprint })} -->`,
      });
      fixture.platform.facts.set(
        `/repos/apolenkov/feynman/issues/${40 + index}`,
        fixture.platform.issues.at(-1),
      );
    }
  }
  const before = fixture.platform.requests.length;
  const result = await reconcilePublication(fixture.context, refreshedScan(fixture, findings));
  assert.equal(result.status, 'accepted', result.reason);
  assert.equal(result.presence.length, 8);
  assert.equal(result.issues.length, 6);
  assert.equal(result.pending.length, 1);
  assert.equal(record(result.pending[0])['fingerprint'], record(findings[7])['fingerprint']);
  const posts = fixture.platform.requests
    .slice(before)
    .filter(
      (request) => request.method === 'POST' && request.path === '/repos/apolenkov/feynman/issues',
    );
  assert.equal(posts.length, 3);
  for (const index of [3, 5, 6])
    assert.ok(
      posts.some((request) =>
        stringField(record(request.body), 'body').includes(
          stringField(record(findings[index]), 'fingerprint'),
        ),
      ),
    );
  assert.equal(
    fixture.platform.issues.some(
      (issue) =>
        typeof issue['body'] === 'string' &&
        issue['body'].includes(stringField(record(findings[4]), 'fingerprint')),
    ),
    false,
  );
});

it('Opus F2 authenticates both missing-issue proofs before any closure or existing refresh PATCH', async (test) => {
  for (const control of ['all-valid', 'invalid-second'])
    await test.test(control, async (subtest) => {
      const fixture = await publicationFindingFixture(subtest);
      const { platform } = fixture;
      const red = fixture.authority(
        'verifier',
        'behavioral-red',
        fixture.baseline,
        sha256(fixture.testBytes),
      );
      const repaired = fixture.fix();
      const patch = fixture.authority(
        'patch',
        'patch-candidate',
        repaired,
        sha256(fixture.patchBytes(repaired)),
      );
      const green = await runReproduction(fixture.context, {
        ...fixture.input,
        phase: 'green',
        red_authority: red,
        patch_authority: patch,
      });
      assert.equal(green.status, 'accepted', green.reason);
      platform.git(['fetch', '--quiet', fixture.root, repaired]);
      platform.git(['update-ref', 'refs/heads/main', repaired]);
      const refreshed = {
        number: 42,
        node_id: 'I_PRESENT_REFRESH',
        user: { id: 23296915 },
        state: 'open',
        labels: [],
        title: 'stale title',
        body: `<!-- factory-finding-v1 ${JSON.stringify({ repository_id: '1230959148', fingerprint_policy_revision: 'reviewed-v1', fingerprint: fixture.fingerprint })} -->`,
      };
      platform.issues.push(refreshed);
      platform.facts.set('/repos/apolenkov/feynman/issues/42', refreshed);
      const missing = [43, 44].map((number) => {
        const identity = {
          repository_id: '1230959148',
          fingerprint_policy_revision: 'reviewed-v1',
          fingerprint: sha256(`absent-${number}`),
        };
        const issue = {
          number,
          node_id: `I_ABSENT_${number}`,
          user: { id: 41898282 },
          state: 'open',
          body: `<!-- factory-finding-v1 ${JSON.stringify(identity)} -->`,
        };
        platform.issues.push(issue);
        platform.facts.set(`/repos/apolenkov/feynman/issues/${number}`, issue);
        return { issue, identity };
      });
      const disappearance: Record<string, JsonRecord> = {};
      const artifactIds: string[] = [];
      for (const [index, item] of missing.entries()) {
        const run = String(9910 + index);
        platform.context(fixture.activation, run);
        const {
          bootstrap_ticket: _ticket,
          legacy_inventory_sha256: _inventory,
          ...normal
        } = fixture.genesisReceipt;
        const fingerprint =
          control === 'invalid-second' && index === 1
            ? sha256('wrong independent fingerprint')
            : item.identity.fingerprint;
        const identity = { ...item.identity, fingerprint, issue_node_id: item.issue.node_id };
        const proof = produceReceipt({
          ...normal,
          sequence: 1,
          parent_head: fixture.genesis['genesis_head'],
          parent_checkpoint_head: fixture.genesis['genesis_head'],
          run_id: run,
          producer_phase: 'verifier',
          request_key: sha256({ identity, repaired }),
          actor_decision: 'approved-publisher',
          lineage_id: sha256(identity),
          issue_node_id: identity.issue_node_id,
          issue_number: item.issue.number,
          fingerprint_policy_revision: identity.fingerprint_policy_revision,
          fingerprint,
          baseline_sha: repaired,
          current_source_head: repaired,
          expected_transition: 'closed',
          outcome: 'complete-absence',
          aliases: [
            {
              kind: 'issue',
              id: String(item.issue.number),
              head: null,
              original_identity_sha256: sha256(identity),
            },
          ],
        });
        const envelope = platform.upload(
          proof,
          'receipt',
          stringField(proof, 'transition_id'),
          'verifier',
        );
        disappearance[item.issue.node_id] = envelope;
        artifactIds.push(stringField(record(envelope['transport']), 'artifact_id'));
      }
      const finding = {
        ...fixture.finding,
        authority: fixture.authority(
          'verifier',
          'confirmed',
          repaired,
          sha256(fixture.finding),
          fixture.fingerprint,
        ),
      };
      const { authority: _scan, ...document } = fixture.scan;
      const scan = { ...document, source_sha: repaired, findings: [finding] };
      const authority = fixture.authority(
        'scan',
        'complete',
        repaired,
        sha256(scan),
        'reviewed-v1',
      );
      const before = platform.requests.length;
      const result = await reconcilePublication(fixture.context, {
        ...scan,
        authority,
        disappearance_authority: disappearance,
      });
      const effects = platform.requests.slice(before);
      if (control === 'invalid-second') {
        assert.equal(result.status, 'needs-human');
        assert.match(result.reason, /Unproven disappearance/);
        assert.equal(
          effects.some((request) => request.method === 'PATCH'),
          false,
          'no refresh or closure before all proof bindings pass',
        );
        assert.equal(record(platform.issues[0])['title'], 'stale title');
        for (const { issue } of missing)
          assert.equal(
            record(platform.facts.get(`/repos/apolenkov/feynman/issues/${issue.number}`))['state'],
            'open',
          );
      } else {
        assert.equal(result.status, 'accepted', result.reason);
        assert.equal(effects.filter((request) => request.method === 'PATCH').length, 3);
        assert.match(stringField(record(platform.issues[0]), 'title'), /factory:confirmed/);
        for (const { issue } of missing)
          assert.equal(
            record(platform.facts.get(`/repos/apolenkov/feynman/issues/${issue.number}`))['state'],
            'closed',
          );
      }
      for (const id of artifactIds)
        assert.ok(
          effects.some(
            (request) => request.path === `/repos/apolenkov/feynman/actions/artifacts/${id}/zip`,
          ),
          'each trusted proof reaches authenticated archive validation',
        );
    });
});

it('Opus F14 preserves owner labels added after the encoded snapshot and refuses changed fresh canonical identity', async (test) => {
  for (const control of [
    'labels-added',
    'labels-removed',
    'foreign-author',
    'changed-marker',
    'closed',
  ])
    await test.test(control, async (subtest) => {
      const fixture = await publicationFindingFixture(subtest);
      const { platform } = fixture;
      const identity = {
        repository_id: '1230959148',
        fingerprint_policy_revision: 'reviewed-v1',
        fingerprint: fixture.fingerprint,
      };
      const original = {
        number: 42,
        node_id: 'I_REFRESH_RACE',
        user: { id: 23296915 },
        state: 'open',
        title: 'stale title',
        labels: [
          { name: 'severity:low' },
          ...(control === 'labels-removed' ? [{ name: 'factory-fix' }] : []),
        ],
        body: `<!-- factory-finding-v1 ${JSON.stringify(identity)} -->`,
      };
      platform.issues.push(original);
      platform.facts.set('/repos/apolenkov/feynman/issues/42', original);
      const fetch = platform.fetch.bind(platform);
      let changed = false;
      subtest.mock.method(
        platform,
        'fetch',
        async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
          const response = await fetch(input, init);
          const url = new URL(input instanceof Request ? input.url : input);
          if (
            !changed &&
            (init?.method ?? 'GET') === 'GET' &&
            url.pathname === '/repos/apolenkov/feynman/issues' &&
            url.searchParams.get('state') === 'all'
          ) {
            changed = true;
            const fresh = {
              ...original,
              labels: [
                { name: 'severity:low' },
                ...(control === 'labels-removed' ? [] : [{ name: 'factory-fix' }]),
                { name: 'owner-note' },
              ],
              ...(control === 'foreign-author' ? { user: { id: 999 } } : {}),
              ...(control === 'changed-marker'
                ? {
                    body: `<!-- factory-finding-v1 ${JSON.stringify({ ...identity, fingerprint: sha256('different current finding') })} -->`,
                  }
                : {}),
              ...(control === 'closed' ? { state: 'closed' } : {}),
            };
            platform.issues[0] = fresh;
            platform.facts.set('/repos/apolenkov/feynman/issues/42', fresh);
          }
          return response;
        },
      );
      const before = platform.requests.length;
      const result = await reconcilePublication(fixture.context, fixture.scan);
      assert.equal(changed, true, 'server changed after the initial response was encoded');
      const effects = platform.requests.slice(before);
      const current = record(platform.issues[0]);
      if (control === 'labels-added' || control === 'labels-removed') {
        assert.equal(result.status, 'accepted', result.reason);
        assert.deepEqual(arrayField(current, 'labels').toSorted(), [
          ...(control === 'labels-removed' ? [] : ['factory-fix']),
          'owner-note',
          'severity:high',
          'source:ocr-scan',
        ]);
        const patch = effects.findIndex(
          (request) =>
            request.method === 'PATCH' && request.path === '/repos/apolenkov/feynman/issues/42',
        );
        assert.ok(patch > 0);
        assert.equal(effects[patch - 1]?.method, 'GET');
        assert.equal(effects[patch - 1]?.path, '/repos/apolenkov/feynman/issues/42');
      } else {
        assert.equal(result.status, 'needs-human');
        assert.match(result.reason, /Canonical issue changed before refresh/);
        assert.equal(
          effects.some((request) => request.method === 'PATCH'),
          false,
        );
        assert.equal(current['title'], 'stale title');
        assert.equal(
          effects.some(
            (request) =>
              request.method === 'GET' && request.path === '/repos/apolenkov/feynman/issues/42',
          ),
          true,
        );
      }
      assert.equal(
        effects.some((request) => request.method === 'POST'),
        false,
      );
    });
});

it('Opus catch reports every identified finding pending and no selected work after invalid scan or unknown caller cap', async (test) => {
  const fixture = await publicationFindingFixture(test);
  const findings = Array.from({ length: 4 }, (_, index) => ({
    ...fixture.finding,
    fingerprint: sha256(`failed-scan-${index}`),
  }));
  const scan = { ...fixture.scan, source_sha: 'f'.repeat(40), findings };
  for (const control of ['invalid-scan', 'unknown-cap'])
    await test.test(control, async () => {
      const context =
        control === 'unknown-cap'
          ? { ...fixture.context, policy: { ...fixture.context.policy, issue_cap: null } }
          : fixture.context;
      const before = fixture.platform.requests.length;
      const result = await reconcilePublication(context, scan);
      assert.equal(result.status, 'needs-human');
      assert.equal(result.presence.length, 4);
      assert.deepEqual(result.selected, []);
      assert.deepEqual(
        result.pending,
        findings.map((finding) => ({
          fingerprint: finding.fingerprint,
          path: finding.path,
          adjudication: 'unvalidated-pending',
        })),
      );
      assert.equal(
        fixture.platform.requests.slice(before).some((request) => request.method !== 'GET'),
        false,
      );
    });
});
