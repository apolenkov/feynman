import fs from 'node:fs';
import {
  readAuthorityArchive,
  resolveReceipt,
  parseFactoryJson,
  resolveFactoryContext,
  FactoryFailure,
  safeReason,
  arrayField,
  booleanField,
  effectPolicy,
  factoryMain,
  githubPages,
  githubRequest,
  numberField,
  produceReceipt,
  record,
  sha256,
  stringField,
  verifyAuthority,
  verifyControlSource,
  producerActor,
  assertParentUnused,
  nightParentKey,
} from './factory-protocol.ts';
import type { FactoryContext, FactoryDecision, JsonRecord } from './factory-protocol.ts';
import { isProtectedPath, isSafeRepoPath } from './factory-paths.ts';

export interface PublicationResult {
  readonly presence: readonly string[];
  readonly selected: readonly JsonRecord[];
  readonly pending: readonly JsonRecord[];
  readonly complete: boolean;
  readonly issues: readonly JsonRecord[];
  readonly dispatch: readonly JsonRecord[];
  readonly status: string;
  readonly reason: string;
}
function scanCoverage(scan: JsonRecord, identifiable: boolean): boolean {
  const inventory = arrayField(scan, 'inventory');
  const covered = arrayField(scan, 'covered');
  const excluded = arrayField(scan, 'excluded').map(record);
  const failed = arrayField(scan, 'failed');
  const accounted = [...covered, ...excluded.map((v) => stringField(v, 'path'))];
  const tokenUsage = scan['token_usage'];
  return (
    identifiable &&
    booleanField(scan, 'successful') &&
    !booleanField(scan, 'truncated') &&
    failed.length === 0 &&
    typeof tokenUsage === 'number' &&
    Number.isSafeInteger(tokenUsage) &&
    tokenUsage >= 0 &&
    tokenUsage <= numberField(scan, 'token_budget') &&
    numberField(scan, 'token_budget') > 0 &&
    scan['inventory_sha256'] === sha256(inventory) &&
    new Set(inventory).size === inventory.length &&
    new Set(accounted).size === accounted.length &&
    inventory.length === accounted.length &&
    inventory.every((file) => accounted.includes(file)) &&
    excluded.every((file) => typeof file['reason'] === 'string' && file['reason'].length > 0) &&
    typeof scan['tool_revision'] === 'string' &&
    typeof scan['config_revision'] === 'string'
  );
}
function detached(value: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => !['authority', 'disappearance_authority', 'reopen_authority'].includes(key),
    ),
  );
}
function evidenceReference(envelope: JsonRecord): JsonRecord {
  const core = record(envelope['receipt']);
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
}
export function isCanonicalIssueAuthor(context: FactoryContext, issue: JsonRecord): boolean {
  const user = issue['user'];
  if (typeof user !== 'object' || user === null || Array.isArray(user)) return false;
  const id = record(user)['id'];
  return (
    typeof id === 'number' &&
    Number.isSafeInteger(id) &&
    (String(id) === context.policy['owner_id'] || id === 41898282)
  );
}
function canonicalIssue(context: FactoryContext, issue: JsonRecord): JsonRecord | null {
  if (
    !isCanonicalIssueAuthor(context, issue) ||
    issue['pull_request'] !== undefined ||
    typeof issue['body'] !== 'string'
  )
    return null;
  const prefix = '<!-- factory-finding-v1 ';
  const marker = issue['body'].split('\n').filter((line) => line.startsWith(prefix));
  if (marker.length === 0) return null;
  if (marker.length !== 1 || marker[0]?.endsWith(' -->') !== true)
    throw new FactoryFailure('Invalid canonical finding marker; preserve work');
  try {
    const parsed: unknown = JSON.parse(marker[0].slice(prefix.length, -4));
    const value = record(parsed);
    stringField(value, 'repository_id');
    stringField(value, 'fingerprint_policy_revision');
    if (!/^[a-f0-9]{64}$/.test(stringField(value, 'fingerprint')))
      throw new FactoryFailure('Invalid canonical fingerprint');
    return value;
  } catch {
    throw new FactoryFailure('Invalid canonical finding marker; preserve work');
  }
}
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const MAX_BODY_BYTES = 2048;
const DETAILS_LABEL = 'Model output (untrusted):';
// Model text is data, never markup: neutralize anything that pings, links or mimics our marker,
// bound it, and fence it with more backticks than any run it contains.
export function renderUntrusted(text: string, maxBytes: number): string {
  const neutral = text
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F\u2028\u2029]/g, ' ')
    .replaceAll('<!--', '<\u200b!--')
    .replaceAll('@', '@\u200b')
    .replace(/#(?=\d)/g, '#\u200b')
    .replaceAll('://', ':\u200b//')
    .replace(/www\./gi, (match) => `${match.slice(0, 3)}\u200b.`);
  const longestRun = Math.max(0, ...(neutral.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const room = Math.max(0, maxBytes - 2 * fence.length - 2);
  const bounded = Buffer.from(neutral, 'utf8')
    .subarray(0, room)
    .toString('utf8')
    .replace(/\uFFFD$/, '');
  return `${fence}\n${bounded}\n${fence}`;
}
function findingText(finding: JsonRecord): string | null {
  const description = finding['description'];
  if (typeof description !== 'string') return null;
  const field = (label: string, value: unknown): string[] =>
    typeof value === 'string' || typeof value === 'number' ? [`${label}: ${String(value)}`] : [];
  const criteria = Array.isArray(finding['acceptance_criteria'])
    ? ['Acceptance criteria:', ...finding['acceptance_criteria'].map((c) => `- ${String(c)}`)]
    : [];
  return [
    ...field(
      'Location',
      `${String(finding['path'])}:${String(finding['start_line'])}-${String(finding['end_line'])}`,
    ),
    ...field('Severity', finding['severity']),
    ...field('Category', finding['category']),
    ...field('Description', description),
    ...field('Verifier', finding['verdict_reason']),
    ...criteria,
  ].join('\n');
}
function labelNames(issue: JsonRecord): string[] {
  return arrayField(issue, 'labels').map((label) =>
    typeof label === 'string' ? label : stringField(record(label), 'name'),
  );
}
// Absence may close an issue only when the current scan is compatible with the scan that last saw
// the finding: same tool/config revisions and the finding's scope covered. Pre-origin markers never close.
function compatibleOrigin(marker: JsonRecord, scan: JsonRecord): boolean {
  const origin = marker['origin'];
  if (typeof origin !== 'object' || origin === null || Array.isArray(origin)) return false;
  const seen = record(origin);
  const scope = seen['scope'];
  return (
    typeof scope === 'string' &&
    typeof seen['inventory_sha256'] === 'string' &&
    /^[a-f0-9]{64}$/.test(seen['inventory_sha256']) &&
    seen['tool_revision'] === scan['tool_revision'] &&
    seen['config_revision'] === scan['config_revision'] &&
    arrayField(scan, 'covered').includes(scope)
  );
}
function partialEffect(identity: JsonRecord, issue: JsonRecord, confidence: string): JsonRecord {
  return {
    ...identity,
    issue_number: issue['number'],
    issue_node_id: issue['node_id'],
    confidence,
    repair_state: 'needs-human',
    reason: 'Partial publication; earlier effects preserved',
  };
}
export async function reconcilePublication(
  inputContext: FactoryContext,
  value: unknown,
): Promise<PublicationResult> {
  const scan = record(value);
  const findings = arrayField(scan, 'findings').map(record);
  const identified = findings.filter(
    (finding) =>
      typeof finding['fingerprint'] === 'string' && /^[0-9a-f]{64}$/.test(finding['fingerprint']),
  );
  const presence = [
    ...new Set(identified.map((finding) => stringField(finding, 'fingerprint'))),
  ].toSorted();
  const selected: readonly JsonRecord[] = [];
  const pending = identified.map((finding) => ({
    fingerprint: finding['fingerprint'],
    path: finding['path'],
    adjudication: 'unvalidated-pending',
  }));
  const complete = scanCoverage(scan, identified.length === findings.length);
  const base = { presence, selected, pending, complete, issues: [], dispatch: [] };
  const issues: JsonRecord[] = [];
  // Issue already created or mutated for the current finding but not yet registered.
  let inFlight: JsonRecord | null = null;
  try {
    const context = await resolveFactoryContext(inputContext);
    effectPolicy(context);
    await verifyControlSource(context);
    if (
      context.job['workflow_ref'] !==
      `${stringField(context.policy, 'repository_full_name')}/${stringField(context.policy, 'controller_workflow_path')}@refs/heads/main`
    )
      throw new FactoryFailure('Publication effects require sole native controller');
    const scanProof = await verifyAuthority(context, record(scan['authority']));
    const scanOperation = record(scanProof['operation']);
    if (
      scanProof['producer_phase'] !== 'scan' ||
      scanProof['lineage_id'] !== null ||
      scan['repository_id'] !== context.policy['repository_id'] ||
      scanOperation['expected_head'] !== scan['source_sha'] ||
      scanOperation['payload_sha256'] !== sha256(detached(scan)) ||
      scanOperation['target_id'] !== scan['fingerprint_policy_revision']
    )
      throw new FactoryFailure('Scan source/policy provenance mismatch');
    // Labels and issue text derive from severity: refuse anything outside the closed set before any write.
    if (identified.some((finding) => !SEVERITIES.includes(String(finding['severity']))))
      throw new FactoryFailure('Unknown finding severity');
    const route = `/repos/${stringField(context.policy, 'repository_full_name')}/issues`;
    let snapshot = (await githubPages(context, `${route}?state=all`)).map(record);
    const dispatch: JsonRecord[] = [];
    const processed: JsonRecord[] = [];
    const deferred: JsonRecord[] = [];
    let created = 0;
    const closing: JsonRecord[] = [];
    // Absence closes an issue only with independent disappearance proof; without it nothing is closed.
    if (complete && scan['disappearance_authority'] !== undefined) {
      for (const issue of snapshot) {
        const marker = canonicalIssue(context, issue);
        if (
          marker === null ||
          marker['repository_id'] !== context.policy['repository_id'] ||
          marker['fingerprint_policy_revision'] !== scan['fingerprint_policy_revision'] ||
          issue['state'] !== 'open' ||
          presence.includes(stringField(marker, 'fingerprint')) ||
          !compatibleOrigin(marker, scan)
        )
          continue;
        // No proof for this issue: leave it open rather than fail the publication.
        const proof = record(scan['disappearance_authority'])[stringField(issue, 'node_id')];
        if (proof === undefined) continue;
        const provenance = await verifyAuthority(context, record(proof));
        const absenceOperation = record(provenance['operation'] ?? {});
        if (
          provenance['issue_node_id'] !== issue['node_id'] ||
          provenance['fingerprint'] !== marker['fingerprint'] ||
          provenance['outcome'] !== 'complete-absence' ||
          provenance['current_source_head'] !== scan['source_sha'] ||
          absenceOperation['expected_head'] !== scan['source_sha'] ||
          absenceOperation['target_id'] !== marker['fingerprint'] ||
          absenceOperation['payload_sha256'] !== scanOperation['payload_sha256']
        )
          throw new FactoryFailure('Unproven disappearance');
        closing.push(issue);
      }
    }
    for (const finding of identified) {
      const proof = await verifyAuthority(context, record(finding['authority']));
      const verifierOperation = record(proof['operation']);
      if (
        proof['producer_phase'] !== 'verifier' ||
        proof['lineage_id'] !== null ||
        verifierOperation['target_id'] !== finding['fingerprint'] ||
        verifierOperation['payload_sha256'] !== sha256(detached(finding)) ||
        verifierOperation['expected_head'] !== scan['source_sha']
      )
        throw new FactoryFailure('Finding adjudication provenance mismatch');
      const confidence = stringField(proof, 'outcome');
      if (confidence === 'refuted') {
        processed.push(finding);
        continue;
      }
      if (confidence !== 'confirmed' && confidence !== 'disputed')
        throw new FactoryFailure('Verifier infrastructure/no-verdict failure');
      const fingerprint = stringField(finding, 'fingerprint');
      const identity = {
        repository_id: context.policy['repository_id'],
        fingerprint_policy_revision: scan['fingerprint_policy_revision'],
        fingerprint,
      };
      const matches = snapshot.filter((issue) => {
        const marker = canonicalIssue(context, issue);
        return (
          marker !== null &&
          marker['repository_id'] === identity.repository_id &&
          marker['fingerprint_policy_revision'] === identity.fingerprint_policy_revision &&
          marker['fingerprint'] === fingerprint
        );
      });
      if (matches.length > 1) throw new FactoryFailure('Canonical issue conflict');
      let issue = matches[0];
      if (issue === undefined && created >= numberField(context.policy, 'issue_cap')) {
        deferred.push({ fingerprint, path: finding['path'], adjudication: confidence });
        continue;
      }
      processed.push(finding);
      const findingPath = stringField(finding, 'path');
      // An unsafe path cannot be judged against the patterns, so it never becomes eligible.
      const blockedPath =
        !isSafeRepoPath(findingPath) || isProtectedPath(context.policy, findingPath);
      const repairState = confidence === 'disputed' || blockedPath ? 'needs-human' : 'eligible';
      const headerFor = (inventory: unknown): string => {
        const origin = {
          scope: stringField(finding, 'path'),
          inventory_sha256: inventory,
          tool_revision: scan['tool_revision'],
          config_revision: scan['config_revision'],
        };
        return `<!-- factory-finding-v1 ${JSON.stringify({ ...identity, origin })} -->\nConfidence: ${confidence}\nRepair: ${repairState}\nAuthenticated receipt: ${sha256(proof)}`;
      };
      const comparable = (value: string): string | undefined =>
        value
          .split('\n\n')[0]
          ?.split('\n')
          .filter((line) => !line.startsWith('Authenticated receipt: '))
          .join('\n');
      const header = headerFor(scan['inventory_sha256']);
      const text = findingText(finding);
      const room = MAX_BODY_BYTES - Buffer.byteLength(header) - DETAILS_LABEL.length - 3;
      const body =
        text === null ? header : `${header}\n\n${DETAILS_LABEL}\n${renderUntrusted(text, room)}`;
      // Only the structural header is compared: a reworded description of the same finding is no change,
      // and the stored inventory digest is bookkeeping that must not rewrite every issue.
      const sameBody = (current: JsonRecord): boolean => {
        const stored = canonicalIssue(context, current)?.['origin'];
        // The receipt digest changes with every nightly verifier run and says nothing about the finding.
        const currentHeader = comparable(String(current['body']));
        return (
          currentHeader === comparable(header) ||
          (typeof stored === 'object' &&
            stored !== null &&
            !Array.isArray(stored) &&
            /^[a-f0-9]{64}$/.test(String(record(stored)['inventory_sha256'])) &&
            currentHeader === comparable(headerFor(record(stored)['inventory_sha256'])))
        );
      };
      const title = `[factory:${confidence}] ${fingerprint.slice(0, 16)}`;
      const findingLabels = [`severity:${stringField(finding, 'severity')}`, 'source:ocr-scan'];
      if (issue === undefined) {
        await verifyControlSource(context);
        try {
          issue = record(
            await githubRequest(context, route, 'POST', {
              title,
              body,
              labels: findingLabels,
            }),
          );
        } catch {
          snapshot = (await githubPages(context, `${route}?state=all`)).map(record);
          const discovered = snapshot.filter((candidate) => {
            const marker = canonicalIssue(context, candidate);
            return (
              marker !== null &&
              marker['repository_id'] === identity.repository_id &&
              marker['fingerprint_policy_revision'] === identity.fingerprint_policy_revision &&
              marker['fingerprint'] === identity.fingerprint
            );
          });
          if (discovered.length !== 1 || discovered[0] === undefined)
            throw new FactoryFailure('Ambiguous issue publication; no blind retry');
          issue = discovered[0];
        }
        inFlight = partialEffect(identity, issue, confidence);
        snapshot = (await githubPages(context, `${route}?state=all`)).map(record);
        created++;
      }
      if (!isCanonicalIssueAuthor(context, issue))
        throw new FactoryFailure('Issue publication author untrusted');
      const issueNumber = numberField(issue, 'number');
      if (issue['state'] === 'closed') {
        inFlight = null;
        issues.push({
          ...identity,
          issue_number: issueNumber,
          issue_node_id: issue['node_id'],
          confidence,
          repair_state: 'needs-human',
          reason: 'Reopening not implemented; existing closure preserved',
        });
        continue;
      }
      const labelDelta = (labels: readonly string[]) => ({
        add: findingLabels.filter((label) => !labels.includes(label)),
        remove: labels.filter(
          (label) => label.startsWith('severity:') && !findingLabels.includes(label),
        ),
      });
      const snapshotDelta = labelDelta(labelNames(issue));
      if (
        issue['title'] !== title ||
        !sameBody(issue) ||
        snapshotDelta.add.length > 0 ||
        snapshotDelta.remove.length > 0
      ) {
        const expectedNodeId = stringField(issue, 'node_id');
        await verifyControlSource(context);
        const fresh = record(await githubRequest(context, `${route}/${issueNumber}`));
        if (
          !isCanonicalIssueAuthor(context, fresh) ||
          fresh['node_id'] !== expectedNodeId ||
          fresh['number'] !== issueNumber ||
          fresh['state'] !== 'open'
        )
          throw new FactoryFailure('Canonical issue changed before refresh; preserve work');
        const marker = canonicalIssue(context, fresh);
        if (
          marker === null ||
          marker['repository_id'] !== identity.repository_id ||
          marker['fingerprint_policy_revision'] !== identity.fingerprint_policy_revision ||
          marker['fingerprint'] !== identity.fingerprint
        )
          throw new FactoryFailure('Canonical issue changed before refresh; preserve work');
        // PATCH never carries labels: its replacement semantics would erase concurrent owner labels.
        // Add before remove so a failure between them leaves the new labels visible, not lost.
        const freshDelta = labelDelta(labelNames(fresh));
        inFlight = partialEffect(identity, fresh, confidence);
        if (fresh['title'] !== title || !sameBody(fresh)) {
          issue = record(
            await githubRequest(context, `${route}/${issueNumber}`, 'PATCH', { title, body }),
          );
        }
        if (freshDelta.add.length > 0) {
          await verifyControlSource(context);
          await githubRequest(context, `${route}/${issueNumber}/labels`, 'POST', {
            labels: freshDelta.add,
          });
        }
        for (const label of freshDelta.remove) {
          await verifyControlSource(context);
          await githubRequest(
            context,
            `${route}/${issueNumber}/labels/${encodeURIComponent(label)}`,
            'DELETE',
          );
        }
        // Not atomic: an owner severity label added after the first read survives the writes above.
        const settled = record(await githubRequest(context, `${route}/${issueNumber}`));
        if (labelDelta(labelNames(settled)).remove.length > 0)
          throw new FactoryFailure('Concurrent severity edit; needs-human conflict');
      }
      const stableIdentity = { ...identity, issue_node_id: stringField(issue, 'node_id') };
      const registration = produceReceipt({
        ...scanProof,
        producer_phase: 'publication',
        run_id: context.job['run_id'],
        run_attempt: 1,
        workflow_source_sha: context.job['workflow_source_sha'],
        request_key: sha256({
          identity: stableIdentity,
          verifier: sha256(proof),
          scan: sha256(scanProof),
        }),
        actor_decision: 'approved-publisher',
        lineage_id: sha256(stableIdentity),
        issue_node_id: stableIdentity.issue_node_id,
        issue_number: issueNumber,
        fingerprint_policy_revision: identity.fingerprint_policy_revision,
        fingerprint,
        baseline_sha: scan['source_sha'],
        current_source_head: scan['source_sha'],
        expected_transition: repairState,
        reservation_number: null,
        outcome: confidence,
        operation: null,
        aliases: [
          {
            kind: 'issue',
            id: String(issueNumber),
            head: null,
            original_identity_sha256: sha256(stableIdentity),
          },
        ],
        evidence: {
          scan: evidenceReference(record(scan['authority'])),
          verifier: evidenceReference(record(finding['authority'])),
        },
      });
      issues.push({
        ...identity,
        issue_number: issueNumber,
        issue_node_id: stableIdentity.issue_node_id,
        confidence,
        repair_state: repairState,
        registration,
      });
      inFlight = null;
      if (repairState === 'eligible')
        dispatch.push({ issue_number: issueNumber, receipt_sha256: sha256(proof) });
    }
    for (const issue of closing) {
      await verifyControlSource(context);
      await githubRequest(context, `${route}/${numberField(issue, 'number')}`, 'PATCH', {
        state: 'closed',
        state_reason: 'completed',
      });
    }
    return {
      ...base,
      selected: processed,
      pending: deferred,
      issues,
      dispatch,
      status: 'accepted',
      reason: 'Authenticated publication reconciled',
    };
  } catch (error: unknown) {
    // selected/pending stay unvalidated, but issues already published or mutated stay reported.
    return {
      ...base,
      issues: (inFlight === null ? issues : [...issues, inFlight]).map((entry) => ({
        ...entry,
        repair_state: 'needs-human',
      })),
      status: 'needs-human',
      reason: safeReason(error),
    };
  }
}

// Fingerprints the night scan must not spend verifier tokens on again: every canonical finding issue of the
// current policy revision. Closed ones count too, because publication never reopens them.
export async function knownFingerprints(context: FactoryContext): Promise<JsonRecord> {
  const revision = record(context.staticPolicy['night_scan'] ?? {})['fingerprint_policy_revision'];
  if (typeof revision !== 'string' || revision === '')
    throw new FactoryFailure('Night scan fingerprint policy revision unknown');
  const issues = (
    await githubPages(
      context,
      `/repos/${stringField(context.staticPolicy, 'repository_full_name')}/issues?state=all`,
    )
  ).map(record);
  const fingerprints = new Set<string>();
  for (const issue of issues) {
    const marker = canonicalIssue(context, issue);
    if (
      marker !== null &&
      marker['repository_id'] === context.staticPolicy['repository_id'] &&
      marker['fingerprint_policy_revision'] === revision
    )
      fingerprints.add(stringField(marker, 'fingerprint'));
  }
  return { fingerprint_policy_revision: revision, fingerprints: [...fingerprints].toSorted() };
}
// Before the model pass: only the owner, or the Actions bot with a fresh, never-used night-review parent, may
// spend provider tokens on a night (protocol v1 section 8).
export async function assertNightProducer(
  inputContext: FactoryContext,
  request: JsonRecord,
): Promise<void> {
  const context = await resolveFactoryContext(inputContext);
  if ((await producerActor(context, request, true)).actor_decision === 'owner') return;
  const parentId = stringField(request, 'parent_run_id');
  await assertParentUnused(
    context,
    parentId,
    ['verifier', 'scan'].map((phase) => nightParentKey(phase, parentId)),
  );
}
// The scan record is read from the scan producer's own run: the artifact bytes plus the verified scan receipt.
export async function loadScanRecord(
  inputContext: FactoryContext,
  runId: string,
): Promise<JsonRecord> {
  if (!/^[1-9]\d*$/.test(runId)) throw new FactoryFailure('Invalid scan run id');
  const context = await resolveFactoryContext(inputContext);
  const name = `factory-night-scan-${runId}`;
  const artifacts = (
    await githubPages(
      context,
      `/repos/${stringField(context.policy, 'repository_full_name')}/actions/runs/${runId}/artifacts`,
      'artifacts',
    )
  )
    .map(record)
    .filter((artifact) => artifact['name'] === name);
  const artifact = artifacts[0];
  const digest = artifact?.['digest'];
  if (
    artifacts.length !== 1 ||
    artifact?.['expired'] !== false ||
    String(record(artifact['workflow_run'])['id']) !== runId ||
    typeof digest !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(digest)
  )
    throw new FactoryFailure('Night scan artifact missing or ambiguous');
  const bytes = await readAuthorityArchive(
    context,
    String(artifact['id']),
    digest.slice(7),
    'scan',
  );
  return { ...parseFactoryJson(bytes), authority: await resolveReceipt(context, runId, 'scan') };
}

if (process.argv[1] === import.meta.filename) {
  await factoryMain(async (context, input): Promise<FactoryDecision> => {
    if (input['command'] === 'known') {
      await assertNightProducer(context, input);
      fs.writeFileSync(
        stringField(input, 'output_file'),
        JSON.stringify(await knownFingerprints(context)),
      );
      return { status: 'accepted', reason: 'Known fingerprints listed' };
    }
    if (input['command'] !== 'publication' && input['command'] !== 'publish')
      return { status: 'denied', reason: 'Unknown publication command' };
    const { command: _command, ...request } = input;
    let scan: JsonRecord = request;
    if (request['scan_run_id'] !== undefined) {
      try {
        scan = await loadScanRecord(context, stringField(request, 'scan_run_id'));
      } catch (error: unknown) {
        return { status: 'needs-human', reason: safeReason(error) };
      }
    }
    const result = await reconcilePublication(context, scan);
    return {
      status: result.status,
      reason: result.reason,
      record: {
        presence: result.presence,
        complete: result.complete,
        issues: result.issues,
        pending: result.pending,
      },
    };
  });
}
