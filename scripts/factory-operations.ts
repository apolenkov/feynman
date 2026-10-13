import {
  resolveFactoryContext,
  FactoryFailure,
  arrayField,
  effectPolicy,
  factoryMain,
  githubGraphQL,
  githubPages,
  githubRequest,
  numberField,
  record,
  sha256,
  stringField,
  verifyControlSource,
} from './factory-protocol.ts';
import type {
  FactoryContext,
  FactoryDecision,
  FactoryPolicy,
  JsonRecord,
} from './factory-protocol.ts';

export interface PreparedTarget {
  readonly state: 'prepared-not-enabled';
  readonly eligible: boolean;
  readonly reasons: readonly string[];
  readonly required_checks: readonly unknown[];
  readonly strict: boolean;
  readonly new_targets: readonly unknown[];
}
export function prepareTarget(policy: FactoryPolicy): PreparedTarget {
  const reasons: string[] = [];
  for (const key of [
    'provider_transport',
    'token_budget',
    'timeout_seconds',
    'controller_workflow_id',
    'control_release_sha',
    'genesis_head',
  ])
    if (policy[key] === null || policy[key] === undefined) reasons.push(`Unknown ${key}`);
  if (policy['activation'] !== false) reasons.push('Preparation must not enable target');
  for (const key of ['token_budget', 'timeout_seconds'])
    if (typeof policy[key] !== 'number' || !Number.isSafeInteger(policy[key]) || policy[key] <= 0)
      reasons.push(`Unknown finite ${key}`);
  const registry = arrayField(policy, 'workflow_registry').map(record);
  if (
    registry.length === 0 ||
    registry.some((entry) => typeof entry['id'] !== 'string' || !/^\d+$/.test(entry['id']))
  )
    reasons.push('Unknown complete stop registry');
  const checks = arrayField(policy, 'required_checks').map(record);
  if (
    checks.length === 0 ||
    checks.some(
      (check) =>
        typeof check['context'] !== 'string' ||
        typeof check['app_id'] !== 'number' ||
        !Number.isSafeInteger(check['app_id']) ||
        check['app_id'] <= 0,
    )
  )
    reasons.push('Unknown trusted check origin');
  const protectedPaths = arrayField(policy, 'protected_paths');
  if (!protectedPaths.includes('tests/**') || !protectedPaths.includes('test/**'))
    reasons.push('Protected tests missing');
  if (policy['strict'] !== true || policy['security_gate_complete'] !== true)
    reasons.push('Unknown complete security/check preflight');
  return {
    state: 'prepared-not-enabled',
    eligible: reasons.length === 0,
    reasons,
    required_checks: arrayField(policy, 'required_checks'),
    strict: policy['strict'] === true,
    new_targets: arrayField(policy, 'new_targets'),
  };
}
function verifyStopInventory(
  policy: FactoryPolicy,
  workflows: readonly JsonRecord[],
  terminal: boolean,
): void {
  const registry = arrayField(policy, 'workflow_registry').map(record);
  const retired = arrayField(policy, 'retired_workflow_ids');
  for (const workflow of workflows)
    if (
      !/^[1-9]\d*$/.test(String(workflow['id'])) ||
      !stringField(workflow, 'path').startsWith('.github/workflows/') ||
      !['active', 'disabled_manually', 'disabled_inactivity', 'disabled_fork', 'deleted'].includes(
        stringField(workflow, 'state'),
      )
    )
      throw new FactoryFailure('Unknown workflow inventory metadata');
  if (
    workflows.some(
      (workflow) => retired.includes(String(workflow['id'])) && workflow['state'] === 'active',
    )
  )
    throw new FactoryFailure('Independent retired writer reappeared');
  if (
    workflows.some(
      (workflow) =>
        typeof workflow['path'] === 'string' &&
        workflow['path'].startsWith('.github/workflows/factory-') &&
        !registry.some(
          (entry) => entry['id'] === String(workflow['id']) && entry['path'] === workflow['path'],
        ),
    )
  )
    throw new FactoryFailure('Unknown factory writer');
  for (const entry of registry) {
    const live = workflows.filter(
      (workflow) => String(workflow['id']) === entry['id'] && workflow['path'] === entry['path'],
    );
    if (
      live.length !== 1 ||
      workflows.filter((workflow) => String(workflow['id']) === entry['id']).length !== 1 ||
      !['active', 'disabled_manually', 'disabled_inactivity', 'disabled_fork', 'deleted'].includes(
        stringField(record(live[0]), 'state'),
      )
    )
      throw new FactoryFailure('Incomplete workflow registry');
    if (terminal && entry['mutating'] === true && record(live[0])['state'] !== 'disabled_manually')
      throw new FactoryFailure('Mutator remains enabled');
  }
}
function factoryPull(policy: FactoryPolicy, pr: JsonRecord): boolean {
  const head = record(pr['head']);
  if (!stringField(head, 'ref').startsWith('factory/')) return false;
  if (
    String(record(head['repo'])['id']) !== policy['repository_id'] ||
    String(record(record(pr['base'])['repo'])['id']) !== policy['repository_id']
  )
    throw new FactoryFailure('Foreign factory PR head');
  if (pr['auto_merge'] === undefined) throw new FactoryFailure('Unknown auto-merge state');
  return true;
}
function pendingRun(run: JsonRecord, ids: readonly string[], policy: FactoryPolicy): boolean {
  const workflowId = numberField(run, 'workflow_id');
  if (workflowId === 0) throw new FactoryFailure('Unknown run workflow identity');
  if (!ids.includes(String(workflowId))) return false;
  numberField(run, 'id');
  if (String(record(run['repository'])['id']) !== policy['repository_id'])
    throw new FactoryFailure('Foreign factory run');
  if (
    !['queued', 'waiting', 'pending', 'requested', 'in_progress', 'completed'].includes(
      stringField(run, 'status'),
    )
  )
    throw new FactoryFailure('Unknown factory run status');
  return run['status'] !== 'completed';
}
export async function stopFactory(inputContext: FactoryContext): Promise<FactoryDecision> {
  try {
    if (inputContext.role !== 'stop') throw new FactoryFailure('Dedicated stop role required');
    const context = await resolveFactoryContext(inputContext);
    const registry = arrayField(context.policy, 'workflow_registry').map(record);
    effectPolicy(context);
    await verifyControlSource(context, true);
    const base = `/repos/${stringField(context.policy, 'repository_full_name')}`;
    const workflows = (await githubPages(context, `${base}/actions/workflows`, 'workflows')).map(
      record,
    );
    verifyStopInventory(context.policy, workflows, false);
    const ids = registry
      .filter((entry) => entry['mutating'] === true)
      .map((entry) => stringField(entry, 'id'));
    const runs = (await githubPages(context, `${base}/actions/runs`, 'workflow_runs')).map(record);
    const prs = (await githubPages(context, `${base}/pulls?state=open`)).map(record);
    const pending = runs.filter((run) => pendingRun(run, ids, context.policy));
    const armed = prs.filter((pr) => factoryPull(context.policy, pr) && pr['auto_merge'] !== null);
    for (const id of ids) {
      await verifyControlSource(context, true);
      await githubRequest(context, `${base}/actions/workflows/${id}/disable`, 'PUT');
    }
    for (const pr of armed) {
      await verifyControlSource(context, true);
      await githubGraphQL(
        context,
        'mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){clientMutationId}}',
        { id: stringField(pr, 'node_id') },
        true,
      );
    }
    for (const run of pending) {
      await verifyControlSource(context, true);
      await githubRequest(context, `${base}/actions/runs/${numberField(run, 'id')}/cancel`, 'POST');
    }
    const readback = (await githubPages(context, `${base}/actions/workflows`, 'workflows')).map(
      record,
    );
    const remaining = (await githubPages(context, `${base}/actions/runs`, 'workflow_runs')).map(
      record,
    );
    const livePrs = (await githubPages(context, `${base}/pulls?state=open`)).map(record);
    verifyStopInventory(context.policy, readback, true);
    if (
      remaining.some((run) => pendingRun(run, ids, context.policy)) ||
      livePrs.some((pr) => factoryPull(context.policy, pr) && pr['auto_merge'] !== null)
    )
      return { status: 'Waiting', reason: 'Mutators not yet terminal or armed PR remains' };
    if (
      pending.some(
        (run) =>
          !remaining.some(
            (candidate) =>
              candidate['id'] === run['id'] &&
              candidate['workflow_id'] === run['workflow_id'] &&
              candidate['status'] === 'completed',
          ),
      ) ||
      armed.some(
        (pr) =>
          !livePrs.some(
            (candidate) =>
              candidate['node_id'] === pr['node_id'] &&
              candidate['auto_merge'] === null &&
              factoryPull(context.policy, candidate),
          ),
      )
    )
      throw new FactoryFailure('Lost exact terminal readback');
    await verifyControlSource(context, true);
    return {
      status: 'STOPPED',
      reason: 'Complete terminal workflow/run/PR readback; quota unchanged',
    };
  } catch {
    return { status: 'Waiting', reason: 'Unknown stop inventory/readback or effect in flight' };
  }
}
export interface ObservationResult {
  readonly eligible: boolean;
  readonly window_start: string | null;
  readonly qualifying_updates: number;
  readonly reason: string;
  readonly fingerprint: string;
}
export function observeFactory(
  policy: FactoryPolicy,
  input: JsonRecord,
  now: string,
): ObservationResult {
  try {
    const components = arrayField(input, 'components').map(record);
    const identities = components
      .map((component) => ({
        name: stringField(component, 'name'),
        fingerprint: stringField(component, 'fingerprint'),
      }))
      .toSorted((left, right) => left.name.localeCompare(right.name));
    const fingerprint = sha256(identities);
    const starts = components.map((component) => Date.parse(stringField(component, 'applied_at')));
    const end = Date.parse(now);
    const window =
      starts.length === 0 ||
      new Set(identities.map((identity) => identity.name)).size !== identities.length ||
      starts.some((start) => !Number.isFinite(start) || start > end)
        ? null
        : Math.max(...starts);
    const required = arrayField(policy, 'required_checks').map(record);
    const updates = arrayField(input, 'updates').map(record);
    const qualifying = updates.filter((update) => {
      const merged =
        typeof update['merged_at'] === 'string' ? Date.parse(update['merged_at']) : NaN;
      if (
        window === null ||
        !Number.isFinite(merged) ||
        update['kind'] !== 'registry-update' ||
        update['bot'] !== 'dependabot[bot]' ||
        update['merged'] !== true ||
        update['human_intervention'] !== false ||
        update['trace_complete'] !== true ||
        update['timeline_complete'] !== true ||
        update['checks_complete'] !== true ||
        merged < window ||
        merged > end ||
        typeof update['head_sha'] !== 'string' ||
        !/^[a-f0-9]{40}$/.test(update['head_sha']) ||
        typeof update['pr_number'] !== 'number' ||
        !Number.isSafeInteger(update['pr_number']) ||
        update['pr_number'] <= 0
      )
        return false;
      const checks = arrayField(update, 'checks').map(record);
      return (
        required.length > 0 &&
        required.every((expected) =>
          checks.some(
            (check) =>
              check['context'] === stringField(expected, 'context') &&
              check['app_id'] === expected['app_id'] &&
              check['head_sha'] === update['head_sha'] &&
              check['conclusion'] === 'success',
          ),
        )
      );
    });
    const unique = new Set(qualifying.map((update) => numberField(update, 'pr_number')));
    const eligible =
      window !== null &&
      Number.isFinite(end) &&
      end - window >= 14 * 86400000 &&
      unique.size >= 3 &&
      Array.isArray(input['incidents']) &&
      input['incidents'].length === 0 &&
      input['incident_inventory_complete'] === true &&
      input['target_contract_verified'] === true;
    return {
      eligible,
      window_start: window === null ? null : new Date(window).toISOString(),
      qualifying_updates: unique.size,
      reason: eligible
        ? 'Complete stable elapsed window and genuine update evidence'
        : 'Waiting: incomplete stable window, genuine updates or incident/target evidence',
      fingerprint,
    };
  } catch {
    return {
      eligible: false,
      window_start: null,
      qualifying_updates: 0,
      reason: 'Waiting: malformed or unknown observation evidence',
      fingerprint: sha256([]),
    };
  }
}
if (process.argv[1] === import.meta.filename) {
  await factoryMain(async (context, input): Promise<FactoryDecision> => {
    switch (input['command']) {
      case 'stop':
        return await stopFactory(context);
      case 'prepare':
      case 'preflight':
        return {
          status: 'prepared',
          reason: 'Render only; target remains disabled',
          record: { ...prepareTarget(context.policy) },
        };
      case 'observe':
        return {
          status: 'prepared',
          reason:
            'Read-only candidate evaluation; independent timeline/component provenance not established',
          record: {
            ...observeFactory(context.policy, input, new Date().toISOString()),
            eligible: false,
            reason: 'Waiting: independent timeline/component provenance not established',
          },
        };
      default:
        return { status: 'denied', reason: 'Unknown operations command' };
    }
  });
}
