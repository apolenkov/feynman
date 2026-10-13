import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  resolveFactoryContext,
  FactoryFailure,
  arrayField,
  effectPolicy,
  factoryMain,
  GitHubFailure,
  githubGraphQL,
  githubPages,
  githubRequest,
  numberField,
  record,
  sha256,
  stringField,
  verifyAuthority,
  verifyControlSource,
} from './factory-protocol.ts';
import type {
  FactoryContext,
  FactoryDecision,
  FactoryPolicy,
  JsonRecord,
} from './factory-protocol.ts';
import { runController } from './factory-control.ts';
import { preserveOrRemoveBranch } from './factory-preservation.ts';

export function guardPatch(policy: FactoryPolicy, changes: readonly JsonRecord[]): FactoryDecision {
  if (changes.length === 0 || changes.length > numberField(policy, 'patch_files_cap'))
    return { status: 'denied', reason: 'Patch file count outside bounds' };
  let lines = 0;
  const seen = new Set<string>();
  for (const change of changes) {
    const file = stringField(change, 'path');
    if (
      seen.has(file) ||
      file.startsWith('/') ||
      file.split('/').some((part) => part === '..' || part === '.' || part === '') ||
      file.includes('\\') ||
      /[\x00-\x1f]/.test(file)
    )
      return { status: 'denied', reason: 'Unsafe or duplicate path' };
    seen.add(file);
    if (change['status'] === 'D') return { status: 'denied', reason: 'Patch deletion refused' };
    if (!['A', 'M'].includes(stringField(change, 'status')))
      return { status: 'denied', reason: 'Patch rename or unrecognized status' };
    if (change['binary'] !== false)
      return { status: 'denied', reason: 'Patch binary or unknown text status' };
    if (
      change['new_mode'] !== '100644' ||
      (change['old_mode'] !== '100644' && change['old_mode'] !== '000000')
    )
      return { status: 'denied', reason: 'Patch symlink/submodule/executable mode refused' };
    if (
      arrayField(policy, 'protected_paths').some(
        (pattern) =>
          typeof pattern === 'string' &&
          (pattern.endsWith('/**')
            ? file.startsWith(pattern.slice(0, -2))
            : pattern.endsWith('*')
              ? file.startsWith(pattern.slice(0, -1))
              : file === pattern),
      )
    )
      return { status: 'denied', reason: 'Patch protected path' };
    lines += numberField(change, 'added') + numberField(change, 'removed');
  }
  if (lines > numberField(policy, 'patch_lines_cap'))
    return { status: 'denied', reason: 'Patch changed lines outside bounds' };
  return { status: 'accepted', reason: 'Bounded text-only patch on unprotected paths' };
}
function git(root: string, args: readonly string[]): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith('GIT_') && !/TOKEN|SECRET|PASSWORD|API_KEY|AUTH/i.test(key),
    ),
  );
  const hook = path.resolve(
    root,
    execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'hooks/pre-push'], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim(),
  );
  if (args[0] === 'push') {
    try {
      fs.accessSync(hook, fs.constants.X_OK);
      throw new FactoryFailure(
        'Executable push hook boundary; privileged writer cannot run lifecycle code',
      );
    } catch (error: unknown) {
      if (
        error instanceof FactoryFailure ||
        !(error instanceof Error && 'code' in error && error.code === 'ENOENT')
      )
        throw error;
    }
  }
  return execFileSync('git', ['-c', 'credential.helper=', '-C', root, ...args], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
function actualChanges(root: string, baseline: string, head: string): readonly JsonRecord[] {
  const raw = git(root, [
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--raw',
    '--no-renames',
    '--no-abbrev',
    baseline,
    head,
  ])
    .split('\n')
    .filter(Boolean);
  const stats = git(root, [
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--numstat',
    '--no-renames',
    baseline,
    head,
  ])
    .split('\n')
    .filter(Boolean);
  return raw.map((row) => {
    const pieces = row.split('\t');
    const metadata = (pieces[0] ?? '').split(' ');
    const file = pieces[1];
    if (pieces.length !== 2 || file === undefined || metadata.length !== 5)
      throw new FactoryFailure('Unknown Git patch representation');
    const stat = stats.find((item) => item.split('\t')[2] === file)?.split('\t');
    if (stat === undefined) throw new FactoryFailure('Missing Git numstat');
    return {
      path: file,
      old_mode: metadata[0]?.slice(1),
      new_mode: metadata[1],
      status: metadata[4],
      binary: stat[0] === '-' || stat[1] === '-',
      added: stat[0] === '-' ? 0 : Number(stat[0]),
      removed: stat[1] === '-' ? 0 : Number(stat[1]),
    };
  });
}
export async function runReproduction(
  inputContext: FactoryContext,
  input: JsonRecord,
): Promise<FactoryDecision> {
  let proof: JsonRecord;
  let context: FactoryContext;
  try {
    context = await resolveFactoryContext(inputContext);
    effectPolicy(context);
    await verifyControlSource(context);
    proof = await verifyAuthority(context, record(input['verifier_authority']));
    if (
      proof['producer_phase'] !== 'verifier' ||
      proof['outcome'] !== 'behavioral-red-relevant' ||
      record(proof['operation'])['payload_sha256'] !== input['test_sha256'] ||
      record(proof['operation'])['target_id'] !== input['test_path'] ||
      !['red', 'green'].includes(stringField(input, 'phase'))
    )
      throw new FactoryFailure('Independently relevant immutable reproduction not proved');
  } catch {
    return { status: 'denied', reason: 'Independent immutable reproduction authority unavailable' };
  }
  const root = stringField(input, 'repository_path');
  const test = stringField(input, 'test_path');
  if (test.startsWith('/') || test.split('/').includes('..'))
    return { status: 'denied', reason: 'Reproduction path outside repository' };
  let expectedHead = stringField(record(proof['operation']), 'expected_head');
  if (input['phase'] === 'green') {
    const patch = await verifyAuthority(context, record(input['patch_authority']));
    if (patch['producer_phase'] !== 'patch' || patch['outcome'] !== 'patch-candidate')
      return { status: 'denied', reason: 'Exact patch candidate not authenticated' };
    const head = stringField(record(patch['operation']), 'expected_head');
    const actual = execFileSync(
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
        expectedHead,
        head,
      ],
      {
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) => !key.startsWith('GIT_') && !/TOKEN|SECRET|PASSWORD|API_KEY|AUTH/i.test(key),
          ),
        ),
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    if (record(patch['operation'])['payload_sha256'] !== sha256(actual))
      return { status: 'denied', reason: 'Exact patch digest mismatch' };
    const changes = actualChanges(root, expectedHead, head);
    if (changes.some((change) => change['path'] === test))
      return { status: 'denied', reason: 'Patch changes the authenticated immutable reproduction' };
    const guarded = guardPatch(context.policy, changes);
    if (guarded.status !== 'accepted') return guarded;
    expectedHead = head;
  }
  const realRoot = fs.realpathSync(root);
  const realTest = fs.realpathSync(path.join(root, test));
  if (
    !realTest.startsWith(`${realRoot}${path.sep}`) ||
    git(root, ['rev-parse', 'HEAD']) !== expectedHead
  )
    return { status: 'denied', reason: 'Reproduction source/path drift' };
  const trackedClean = (): boolean =>
    git(root, ['diff', '--no-ext-diff', '--no-textconv', '--name-only', 'HEAD']) === '' &&
    git(root, ['rev-parse', 'HEAD']) === expectedHead;
  if (!trackedClean())
    return {
      status: 'denied',
      reason: 'Reproduction tracked working tree differs from authenticated HEAD',
    };
  const packageBlob = arrayField(context.policy, 'control_manifest')
    .map(record)
    .find((entry) => entry['path'] === 'package.json');
  if (git(root, ['hash-object', 'package.json']) !== packageBlob?.['blob_sha'])
    return { status: 'denied', reason: 'Complete gate definition differs from approved release' };
  const before = fs.readFileSync(realTest);
  if (sha256(before) !== input['test_sha256'])
    return { status: 'denied', reason: 'Immutable reproduction digest changed' };
  fs.mkdirSync(path.join(root, '.build'), { recursive: true });
  const home = fs.mkdtempSync(path.join(root, '.build', 'factory-gate-home-'));
  const environment: NodeJS.ProcessEnv = {
    PATH: process.env['PATH'],
    HOME: home,
    TMPDIR: home,
    LANG: 'C.UTF-8',
    CI: 'true',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
  };
  try {
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', test], {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 2_000_000,
    });
    const unchanged = sha256(fs.readFileSync(`${root}/${test}`)) === input['test_sha256'];
    if (!trackedClean())
      return {
        status: 'denied',
        reason: 'Reproduction changed tracked source or authenticated HEAD',
      };
    if (!unchanged || result.error !== undefined || result.signal !== null)
      return { status: 'denied', reason: 'Reproduction changed or execution environment failed' };
    const output = result.stdout + result.stderr;
    if (input['phase'] === 'red') {
      if (
        result.status === 0 ||
        !output.includes("failureType: 'testCodeFailure'") ||
        !output.includes("code: 'ERR_ASSERTION'") ||
        /SyntaxError|ERR_MODULE_NOT_FOUND|ERR_UNKNOWN_FILE_EXTENSION|ReferenceError/.test(output)
      )
        return { status: 'denied', reason: 'No independently relevant behavioral assertion RED' };
      return {
        status: 'accepted',
        reason: 'Unchanged behavioral assertion RED',
        record: {
          test_sha256: sha256(before),
          output_sha256: sha256(Buffer.from(output)),
          exit: result.status,
        },
      };
    }
    if (result.status !== 0)
      return { status: 'denied', reason: 'Missing unchanged behavioral RED or GREEN failed' };
    const red = await verifyAuthority(context, record(input['red_authority']));
    if (
      red['producer_phase'] !== 'verifier' ||
      red['outcome'] !== 'behavioral-red' ||
      record(red['operation'])['payload_sha256'] !== input['test_sha256'] ||
      record(red['operation'])['target_id'] !== test ||
      record(red['operation'])['expected_head'] !== record(proof['operation'])['expected_head']
    )
      return { status: 'denied', reason: 'Missing unchanged authenticated behavioral RED' };
    const gate = spawnSync('npm', ['run', 'ci'], {
      cwd: root,
      env: environment,
      encoding: 'utf8',
      timeout: 600000,
      maxBuffer: 5_000_000,
    });
    if (!trackedClean())
      return {
        status: 'denied',
        reason: 'Complete gate changed tracked source or authenticated HEAD',
      };
    if (
      gate.status !== 0 ||
      gate.signal !== null ||
      gate.error !== undefined ||
      sha256(fs.readFileSync(`${root}/${test}`)) !== input['test_sha256']
    )
      return {
        status: 'denied',
        reason: 'Complete secretless gate failed or immutable test changed',
      };
    return {
      status: 'accepted',
      reason: 'Same immutable test GREEN and complete secretless gate',
      record: {
        test_sha256: sha256(before),
        gate_output_sha256: sha256(Buffer.from(gate.stdout + gate.stderr)),
      },
    };
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}
export async function publishPatch(
  inputContext: FactoryContext,
  input: JsonRecord,
): Promise<FactoryDecision> {
  try {
    const context = await resolveFactoryContext(inputContext);
    effectPolicy(context);
    await verifyControlSource(context);
    const proof = await verifyAuthority(context, record(input['authority']));
    if (
      proof['outcome'] !== 'patch-ready' ||
      proof['current_source_head'] !== input['expected_head']
    )
      throw new FactoryFailure('Unproven exact patch/gate outcome');
    const root = stringField(input, 'repository_path');
    if (
      git(root, ['remote', 'get-url', 'origin']) !== 'https://github.com/apolenkov/feynman.git' ||
      git(root, ['remote', 'get-url', '--push', '--all', 'origin']) !==
        'https://github.com/apolenkov/feynman.git'
    )
      throw new FactoryFailure('Foreign Git writer origin');
    const baseline = stringField(proof, 'baseline_sha');
    const head = stringField(input, 'expected_head');
    if (
      git(root, ['rev-parse', 'HEAD']) !== head ||
      git(root, ['status', '--porcelain', '--untracked-files=all']) !== ''
    )
      throw new FactoryFailure('Writer head changed or working tree dirty');
    const guard = guardPatch(context.policy, actualChanges(root, baseline, head));
    if (guard.status !== 'accepted') return guard;
    const lineage = stringField(proof, 'lineage_id');
    const branch = `factory/${lineage}/${numberField(proof, 'reservation_number')}`;
    const base = `/repos/${stringField(context.policy, 'repository_full_name')}`;
    const expected = input['remote_expected_head'];
    let live: string | null;
    try {
      live = stringField(
        record(record(await githubRequest(context, `${base}/git/ref/heads/${branch}`))['object']),
        'sha',
      );
    } catch (error: unknown) {
      if (error instanceof GitHubFailure && error.status === 404 && expected === null) live = null;
      else return { status: 'needs-human', reason: 'Unknown remote head; absence not proved' };
    }
    if (live !== head) {
      if (live !== expected)
        return { status: 'needs-human', reason: 'stale-head: live branch changed' };
      const claim = await runController(context, {
        command: 'operation-gate',
        issue_number: proof['issue_number'],
        event_id: input['event_id'],
        stage: 'expected-head-push',
        operation_authority: input['push_authority'],
      });
      if (
        claim.status !== 'accepted' ||
        record(claim.record)['payload_sha256'] !==
          sha256({ repository_id: context.policy['repository_id'], branch, head }) ||
        record(claim.record)['expected_head'] !== head ||
        record(claim.record)['target_id'] !== branch
      )
        throw new FactoryFailure('Exact push durable transport claim missing');
      await verifyControlSource(context);
      try {
        git(root, ['push', 'origin', `${head}:refs/heads/${branch}`]);
      } catch {
        try {
          live = stringField(
            record(
              record(await githubRequest(context, `${base}/git/ref/heads/${branch}`))['object'],
            ),
            'sha',
          );
        } catch {
          return { status: 'needs-human', reason: 'unknown: failed push and unreadable head' };
        }
        return {
          status: 'needs-human',
          reason:
            live !== expected
              ? 'stale-head: live head changed after rejected push'
              : 'push-failed: live head unchanged',
        };
      }
    }
    const remote = stringField(
      record(record(await githubRequest(context, `${base}/git/ref/heads/${branch}`))['object']),
      'sha',
    );
    if (remote !== head)
      return { status: 'needs-human', reason: 'Unknown exact-head push acknowledgement' };
    const prs = (
      await githubPages(
        context,
        `${base}/pulls?state=all&head=${encodeURIComponent(`${stringField(context.policy, 'owner_login')}:${branch}`)}`,
      )
    ).map(record);
    if (
      prs.length > 1 ||
      prs.some(
        (pr) =>
          String(record(record(pr['head'])['repo'])['id']) !== context.policy['repository_id'] ||
          record(pr['head'])['ref'] !== branch ||
          String(record(record(pr['base'])['repo'])['id']) !== context.policy['repository_id'] ||
          record(pr['base'])['ref'] !== 'main' ||
          record(pr['head'])['sha'] !== head ||
          pr['body'] !==
            `Fixes #${numberField(proof, 'issue_number')}\n\nFactory lineage: ${lineage}`,
      )
    )
      return { status: 'needs-human', reason: 'Foreign PR/head on branch preserved' };
    if (prs.length === 1)
      return {
        status: 'accepted',
        reason: 'Exact existing PR resumed without model',
        record: { pr_number: prs[0]?.['number'], head, branch },
      };
    const payload = {
      title: `fix: verified finding ${lineage.slice(0, 12)}`,
      head: branch,
      base: 'main',
      body: `Fixes #${numberField(proof, 'issue_number')}\n\nFactory lineage: ${lineage}`,
    };
    const claim = await runController(context, {
      command: 'operation-gate',
      issue_number: proof['issue_number'],
      event_id: input['event_id'],
      stage: 'pr-publication',
      operation_authority: input['pr_authority'],
    });
    if (
      claim.status !== 'accepted' ||
      record(claim.record)['payload_sha256'] !== sha256(payload) ||
      record(claim.record)['expected_head'] !== head ||
      record(claim.record)['target_id'] !== branch
    )
      throw new FactoryFailure('Exact PR durable transport claim missing');
    await verifyControlSource(context);
    const pr = record(await githubRequest(context, `${base}/pulls`, 'POST', payload));
    return {
      status: 'accepted',
      reason: 'Exact pushed head published as canonical PR',
      record: { pr_number: pr['number'], head, branch },
    };
  } catch {
    return {
      status: 'needs-human',
      reason: 'Patch/PR publication unknown; preserve exact commit and issue, no regeneration',
    };
  }
}
export async function reconcileClosure(
  inputContext: FactoryContext,
  input: JsonRecord,
): Promise<FactoryDecision> {
  try {
    const context = await resolveFactoryContext(inputContext);
    effectPolicy(context);
    await verifyControlSource(context);
    const proof = await verifyAuthority(context, record(input['authority']));
    const base = `/repos/${stringField(context.policy, 'repository_full_name')}`;
    const prNumber = numberField(input, 'pr_number');
    const pr = record(await githubRequest(context, `${base}/pulls/${prNumber}`));
    const head = stringField(record(pr['head']), 'sha');
    if (
      pr['merged'] !== true ||
      head !== proof['current_source_head'] ||
      record(pr['base'])['ref'] !== 'main' ||
      String(record(record(pr['base'])['repo'])['id']) !== context.policy['repository_id'] ||
      pr['merge_commit_sha'] !== input['merge_commit_sha']
    )
      throw new FactoryFailure('Merge/head/base proof mismatch');
    const references = await githubGraphQL(
      context,
      'query($id:ID!){node(id:$id){... on PullRequest{closingIssuesReferences(first:100){nodes{id number repository{databaseId}} pageInfo{hasNextPage}}}}}',
      { id: stringField(pr, 'node_id') },
    );
    const links = record(record(references['node'])['closingIssuesReferences']);
    const nodes = arrayField(links, 'nodes').map(record);
    if (
      record(links['pageInfo'])['hasNextPage'] !== false ||
      nodes.length !== 1 ||
      nodes[0]?.['id'] !== proof['issue_node_id'] ||
      String(record(nodes[0]?.['repository'])['databaseId']) !== context.policy['repository_id']
    )
      throw new FactoryFailure('Extra, foreign or incomplete API closing linkage');
    const checks = (
      await githubPages(context, `${base}/commits/${head}/check-runs`, 'check_runs')
    ).map(record);
    for (const required of arrayField(context.policy, 'required_checks').map(record)) {
      const matching = checks.filter(
        (check) =>
          check['name'] === required['context'] &&
          check['head_sha'] === head &&
          check['conclusion'] === 'success' &&
          (required['app_id'] === null || record(check['app'])['id'] === required['app_id']),
      );
      if (matching.length !== 1 || matching[0] === undefined)
        throw new FactoryFailure('Required exact-head check mismatch');
      const details = stringField(matching[0], 'details_url');
      const runId = /^https:\/\/github\.com\/apolenkov\/feynman\/actions\/runs\/(\d+)/.exec(
        details,
      )?.[1];
      if (runId === undefined) throw new FactoryFailure('Unknown check origin');
      const run = record(await githubRequest(context, `${base}/actions/runs/${runId}`));
      if (
        String(run['workflow_id']) !== context.policy['ci_workflow_id'] ||
        run['path'] !== context.policy['ci_workflow_path'] ||
        run['head_sha'] !== head ||
        run['conclusion'] !== 'success'
      )
        throw new FactoryFailure('Untrusted check workflow source');
    }
    const reviews = (await githubPages(context, `${base}/pulls/${prNumber}/reviews`)).map(record);
    if (
      !reviews.some(
        (review) =>
          review['commit_id'] === head &&
          review['state'] === 'APPROVED' &&
          String(record(review['user'])['id']) !== String(record(pr['user'])['id']),
      )
    )
      throw new FactoryFailure('Missing independent exact-head review');
    const issue = record(
      await githubRequest(context, `${base}/issues/${numberField(proof, 'issue_number')}`),
    );
    if (issue['node_id'] !== proof['issue_node_id'])
      throw new FactoryFailure('Canonical issue mismatch');
    const labels = arrayField(issue, 'labels').map((label) =>
      typeof label === 'string' ? label : stringField(record(label), 'name'),
    );
    if (!labels.includes('factory-fix'))
      throw new FactoryFailure('Current owner opt-in removed; cleanup denied');
    if (issue['state'] !== 'closed')
      return {
        status: 'needs-human',
        reason: 'Human merge closure not confirmed; preserve issue and branch',
      };
    const readback = record(
      await githubRequest(context, `${base}/issues/${numberField(proof, 'issue_number')}`),
    );
    if (readback['state'] !== 'closed') throw new FactoryFailure('Closure readback unknown');
    const cleanup = await preserveOrRemoveBranch(context, {
      ...input,
      branch: record(pr['head'])['ref'],
      expected_head: head,
      delivered_head: pr['merge_commit_sha'],
      lineage_id: proof['lineage_id'],
      delivered: true,
    });
    return {
      status: 'accepted',
      reason: 'Canonical issue closure verified; cleanup evaluated',
      record: {
        issue_number: proof['issue_number'],
        cleanup: cleanup.status,
        cleanup_reason: cleanup.reason,
      },
    };
  } catch {
    return {
      status: 'needs-human',
      reason: 'Closure/check/linkage/review unknown; retain issue and branch',
    };
  }
}
if (process.argv[1] === import.meta.filename) {
  await factoryMain(async (context, input): Promise<FactoryDecision> => {
    switch (input['command']) {
      case 'provider-gate':
        effectPolicy(context);
        return {
          status: 'denied',
          reason: 'No configured approved fixer transport; provider calls disabled',
        };
      case 'repro':
        return await runReproduction(context, input);
      case 'guard':
        return guardPatch(context.policy, arrayField(input, 'changes').map(record));
      case 'push-pr':
        return await publishPatch(context, input);
      case 'closure':
        return await reconcileClosure(context, input);
      default:
        return { status: 'denied', reason: 'Unknown writer command' };
    }
  });
}
