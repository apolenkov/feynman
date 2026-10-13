import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  FactoryFailure,
  GitHubFailure,
  arrayField,
  numberField,
  parseProtocol,
  resolveFactoryContext,
  effectPolicy,
  githubPages,
  githubRequest,
  record,
  stringField,
  verifyAuthority,
  verifyControlSource,
} from './factory-protocol.ts';
import type { FactoryContext, FactoryDecision, JsonRecord } from './factory-protocol.ts';
import { runController } from './factory-control.ts';

function git(root: string, args: readonly string[]): string {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  return execFileSync('git', ['-C', root, ...args], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}
export function preserveOrRemoveWorktree(input: JsonRecord): FactoryDecision {
  try {
    const root = fs.realpathSync(stringField(input, 'repository_path'));
    const target = fs.realpathSync(stringField(input, 'worktree_path'));
    const worktrees = path.join(root, '.worktrees') + path.sep;
    if (!target.startsWith(worktrees) || target === root)
      return {
        status: 'preserved',
        reason: 'Worktree outside exact repository worktrees directory',
      };
    const branch = stringField(input, 'branch');
    const head = stringField(input, 'expected_head');
    git(root, ['check-ref-format', '--branch', branch]);
    if (
      !/^[a-f0-9]{40}$/.test(head) ||
      git(root, ['rev-parse', '--show-toplevel']) !== root ||
      git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']) !==
        git(target, ['rev-parse', '--path-format=absolute', '--git-common-dir']) ||
      !git(root, ['worktree', 'list', '--porcelain', '-z'])
        .split('\0')
        .includes(`worktree ${target}`)
    )
      return { status: 'preserved', reason: 'Unknown repository, object or registered worktree' };
    if (
      git(target, ['rev-parse', 'HEAD']) !== head ||
      git(target, ['symbolic-ref', '--short', 'HEAD']) !== branch
    )
      return { status: 'preserved', reason: 'Moved head or mismatched owner branch' };
    if (
      git(target, ['status', '--porcelain', '--untracked-files=all', '--ignored=matching']) !== ''
    )
      return { status: 'preserved', reason: 'Dirty, untracked or ignored evidence in worktree' };
    if (
      input['owner_released'] !== true ||
      input['ownership_complete'] !== true ||
      input['delivered'] !== true ||
      input['other_unmerged'] !== false
    )
      return {
        status: 'preserved',
        reason: 'Unproved delivery/owner release or other unmerged ownership',
      };
    const delivered = stringField(input, 'delivered_head');
    if (!/^[a-f0-9]{40}$/.test(delivered))
      return { status: 'preserved', reason: 'Unknown delivered object' };
    const canonicalHead = git(root, ['rev-parse', 'HEAD']);
    if (git(root, ['rev-list', head, `^${canonicalHead}`]) !== '')
      return { status: 'preserved', reason: 'Unique commits not delivered to canonical HEAD' };
    git(root, ['merge-base', '--is-ancestor', delivered, canonicalHead]);
    const unique = git(root, ['rev-list', head, `^${delivered}`]);
    if (unique && input['squash'] !== true)
      return { status: 'preserved', reason: 'Unique undelivered commits' };
    if (input['squash'] === true) {
      if (
        typeof input['content_tree'] !== 'string' ||
        git(root, ['rev-parse', `${head}^{tree}`]) !== input['content_tree'] ||
        git(root, ['rev-parse', `${delivered}^{tree}`]) !== input['content_tree']
      )
        return { status: 'preserved', reason: 'Squash content proof unknown' };
      // Safe -d cannot prove squash ancestry; leave the worktree when it would refuse.
      try {
        git(root, ['merge-base', '--is-ancestor', head, delivered]);
      } catch {
        return {
          status: 'preserved',
          reason: 'Ordinary safe branch removal would refuse squash ancestry',
        };
      }
    }
    if (
      git(root, ['rev-parse', 'HEAD']) !== canonicalHead ||
      git(target, ['rev-parse', 'HEAD']) !== head ||
      git(target, ['symbolic-ref', '--short', 'HEAD']) !== branch ||
      git(target, ['status', '--porcelain', '--untracked-files=all', '--ignored=matching']) !== ''
    )
      return { status: 'preserved', reason: 'Worktree or delivery moved before removal' };
    git(root, ['worktree', 'remove', target]);
    try {
      git(root, ['branch', '-d', '--', branch]);
    } catch {
      return {
        status: 'needs-human',
        reason: 'Worktree removed; branch retained after ordinary deletion refused',
      };
    }
    return { status: 'accepted', reason: 'Clean released delivered worktree removed ordinarily' };
  } catch {
    return { status: 'preserved', reason: 'Unknown Git, owner, head or safe removal outcome' };
  }
}
export async function preserveOrRemoveBranch(
  inputContext: FactoryContext,
  input: JsonRecord,
): Promise<FactoryDecision> {
  try {
    const context = await resolveFactoryContext(inputContext);
    effectPolicy(context);
    await verifyControlSource(context);
    if (context.role !== 'repair')
      return { status: 'preserved', reason: 'Cleanup requires approved repair authority' };
    const recovery = await runController(context, { command: 'recover' });
    if (recovery.status !== 'accepted')
      return { status: 'preserved', reason: 'State continuity or permanent anchors unverified' };
    const stateHead = stringField(record(recovery.record), 'state_head');
    const proof = await verifyAuthority(context, record(input['authority']));
    const base = `/repos/${stringField(context.policy, 'repository_full_name')}`;
    const attempt = record(
      await githubRequest(
        context,
        `${base}/actions/runs/${stringField(context.job, 'run_id')}/attempts/1`,
      ),
    );
    if (String(attempt['workflow_id']) !== context.policy['controller_workflow_id'])
      return { status: 'preserved', reason: 'Cleanup requires the sole serialized controller' };
    const branch = stringField(input, 'branch');
    const expected = stringField(input, 'expected_head');
    if (!/^factory\/[a-f0-9]{64}\/[12]$/.test(branch))
      throw new FactoryFailure('Unknown branch lineage');
    if (
      !/^[a-f0-9]{40}$/.test(expected) ||
      proof['actor_decision'] === 'denied' ||
      !['patch', 'outcome'].includes(stringField(proof, 'producer_phase')) ||
      proof['lineage_id'] !== input['lineage_id'] ||
      proof['lineage_id'] !== branch.split('/')[1] ||
      proof['current_source_head'] !== expected ||
      String(proof['reservation_number']) !== branch.split('/')[2]
    )
      return { status: 'preserved', reason: 'Unknown authenticated lineage, owner or patch head' };
    const lineageFile = record(
      await githubRequest(
        context,
        `${base}/contents/lineages/${stringField(proof, 'lineage_id')}.json?ref=${stateHead}`,
      ),
    );
    if (lineageFile['type'] !== 'file' || lineageFile['encoding'] !== 'base64')
      return { status: 'preserved', reason: 'Unknown canonical ownership data' };
    const lineage = parseProtocol(
      Buffer.from(stringField(lineageFile, 'content'), 'base64'),
      'lineage',
    );
    const reservation = arrayField(lineage, 'reservations')
      .map(record)
      .find((entry) => entry['number'] === proof['reservation_number']);
    if (
      lineage['epoch_id'] !== context.policy['epoch_id'] ||
      lineage['lineage_id'] !== proof['lineage_id'] ||
      lineage['history_status'] !== 'verified' ||
      record(lineage['identity'])['issue_node_id'] !== proof['issue_node_id'] ||
      reservation?.['consumed'] !== true ||
      reservation['baseline_sha'] !== proof['baseline_sha']
    )
      return { status: 'preserved', reason: 'Unknown ownership or consumed reservation' };
    const current = record(
      record(await githubRequest(context, `${base}/git/ref/heads/${branch}`))['object'],
    );
    if (current['sha'] !== expected) return { status: 'preserved', reason: 'Moved remote head' };
    const prs = (
      await githubPages(
        context,
        `${base}/pulls?state=all&head=${encodeURIComponent(`${stringField(context.policy, 'owner_login')}:${branch}`)}`,
      )
    ).map(record);
    if (prs.length !== 1 || prs[0] === undefined)
      return { status: 'preserved', reason: 'Ambiguous remote branch ownership' };
    const pr = prs[0];
    const prHead = record(pr['head']);
    const prBase = record(pr['base']);
    if (
      pr['merged'] !== true ||
      typeof pr['merged_at'] !== 'string' ||
      !Number.isFinite(Date.parse(pr['merged_at'])) ||
      prHead['sha'] !== expected ||
      prHead['ref'] !== branch ||
      String(record(prHead['repo'])['id']) !== context.policy['repository_id'] ||
      prBase['ref'] !== 'main' ||
      String(record(prBase['repo'])['id']) !== context.policy['repository_id'] ||
      pr['number'] !== input['pr_number'] ||
      pr['body'] !==
        `Fixes #${numberField(proof, 'issue_number')}\n\nFactory lineage: ${stringField(proof, 'lineage_id')}`
    )
      return { status: 'preserved', reason: 'Open, unmerged, foreign or unknown branch ownership' };
    const delivered = stringField(input, 'delivered_head');
    if (!/^[a-f0-9]{40}$/.test(delivered) || pr['merge_commit_sha'] !== delivered)
      return { status: 'preserved', reason: 'Delivery does not match actual merged PR' };
    const comparison = record(
      await githubRequest(context, `${base}/compare/${expected}...${delivered}`),
    );
    if (comparison['status'] !== 'ahead' && comparison['status'] !== 'identical')
      return { status: 'preserved', reason: 'Unique commits or unproven squash delivery' };
    const canonical = stringField(
      record(record(await githubRequest(context, `${base}/git/ref/heads/main`))['object']),
      'sha',
    );
    const canonicalDelivery = record(
      await githubRequest(context, `${base}/compare/${delivered}...${canonical}`),
    );
    if (canonicalDelivery['status'] !== 'ahead' && canonicalDelivery['status'] !== 'identical')
      return { status: 'preserved', reason: 'Merged delivery not present on canonical default' };
    if (input['delivered'] !== true || input['lineage_id'] !== branch.split('/')[1])
      return { status: 'preserved', reason: 'Canonical lineage delivery not proved' };
    await verifyControlSource(context);
    if (
      stringField(
        record(
          record(await githubRequest(context, `${base}/git/ref/heads/factory-state`))['object'],
        ),
        'sha',
      ) !== stateHead
    )
      return { status: 'preserved', reason: 'State ownership moved before deletion' };
    if (
      record(record(await githubRequest(context, `${base}/git/ref/heads/${branch}`))['object'])[
        'sha'
      ] !== expected
    )
      return { status: 'preserved', reason: 'Moved head before deletion' };
    const ownerIssue = record(
      await githubRequest(context, `${base}/issues/${numberField(proof, 'issue_number')}`),
    );
    if (
      ownerIssue['node_id'] !== proof['issue_node_id'] ||
      ownerIssue['pull_request'] !== undefined ||
      !arrayField(ownerIssue, 'labels')
        .map(record)
        .some((label) => label['name'] === 'factory-fix')
    )
      return {
        status: 'preserved',
        reason: 'Canonical owner opt-in absent or revoked before cleanup',
      };
    // shortcut: REST DELETE lacks expected-old CAS; hosted controller serialization is an activation prerequisite.
    try {
      await githubRequest(context, `${base}/git/refs/heads/${branch}`, 'DELETE');
    } catch {
      return {
        status: 'needs-human',
        reason: 'Deletion acknowledgement unknown; reconcile without retry',
      };
    }
    try {
      await githubRequest(context, `${base}/git/ref/heads/${branch}`);
      return {
        status: 'needs-human',
        reason: 'Branch still exists after deletion acknowledgement',
      };
    } catch (error: unknown) {
      if (!(error instanceof GitHubFailure) || error.status !== 404)
        return { status: 'needs-human', reason: 'Branch deletion readback unavailable' };
    }
    return { status: 'accepted', reason: 'Verified delivered remote branch removed' };
  } catch {
    return { status: 'preserved', reason: 'Unknown API, diff, lineage or deletion outcome' };
  }
}
