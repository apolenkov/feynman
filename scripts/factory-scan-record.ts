import fs from 'node:fs';
import path from 'node:path';
import {
  FactoryFailure,
  canonicalBytes,
  loadFactoryPolicy,
  parseFactoryJson,
  record,
  safeReason,
  sha256,
  stringField,
} from './factory-protocol.ts';
import type { JsonRecord } from './factory-protocol.ts';

export interface FindingAnchor {
  readonly path: string;
  readonly category: string;
  readonly existing_code: string;
  readonly start_line: number;
}
// Line numbers are not part of the identity: the anchor is the flagged code, so a shift keeps the fingerprint.
// start_line === 0 means the tool could not locate the code; an empty anchor cannot identify anything either.
export function fingerprintFinding(rev: string, finding: FindingAnchor): string | null {
  const anchor = finding.existing_code.replace(/\s+/g, ' ').trim();
  if (finding.start_line === 0 || anchor === '') return null;
  return sha256({
    fingerprint_policy_revision: rev,
    path: finding.path.replaceAll('\\', '/').replace(/^(?:\.\/)+/, ''),
    category: finding.category.toLowerCase(),
    anchor,
  });
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const SHA = /^[0-9a-f]{40}$/;

function fail(what: string): never {
  throw new FactoryFailure(`Invalid night-scan input: ${what}`);
}
// Model text is untrusted: bound it and make it valid for canonical JSON.
function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return fail('string');
  return value
    .slice(0, max)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
}
function closedObject(value: unknown, keys: readonly string[], what: string): JsonRecord {
  const object = record(value);
  const actual = Object.keys(object);
  if (actual.length !== keys.length || keys.some((key) => !actual.includes(key))) fail(what);
  return object;
}
function count(value: unknown, what: string): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : fail(what);
}
function flag(value: unknown, what: string): boolean {
  return typeof value === 'boolean' ? value : fail(what);
}
function items(value: unknown, what: string): readonly JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : fail(what);
}
function strings(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) return fail(what);
  return value.map((entry) => clip(entry, 512));
}
function readBundle(dir: string, name: string): JsonRecord {
  const file = path.join(dir, name);
  if (fs.statSync(file).size > 2_000_000) fail(`${name} size`);
  return parseFactoryJson(fs.readFileSync(file));
}

interface Comment {
  readonly index: number;
  readonly path: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly category: string;
  readonly severity: string;
  readonly existing_code: string;
  readonly content: string;
}
function parseComments(value: unknown): Comment[] {
  return items(value, 'comments').map((raw) => {
    const c = closedObject(
      raw,
      [
        'index',
        'path',
        'start_line',
        'end_line',
        'category',
        'severity',
        'existing_code',
        'content',
      ],
      'comment',
    );
    return {
      index: count(c['index'], 'comment index'),
      path: clip(c['path'], 1024),
      start_line: count(c['start_line'], 'start_line'),
      end_line: count(c['end_line'], 'end_line'),
      category: clip(c['category'], 128),
      severity: clip(c['severity'], 32),
      existing_code: clip(c['existing_code'], 4000),
      content: clip(c['content'], 2000),
    };
  });
}

export interface NightDraft {
  readonly draft: JsonRecord;
  readonly selected: boolean;
}
// Pure: turns the model bundle into the scan record draft. token_budget and authority are added later by
// the scan producer; nothing here may close or reopen an issue.
export function buildScanDraft(
  rawInput: unknown,
  verdictsInput: unknown,
  acceptanceInput: unknown,
  rev: string,
  repositoryId: string,
): NightDraft {
  const raw = closedObject(
    rawInput,
    [
      'schema',
      'source_sha',
      'tool',
      'config',
      'exit_code',
      'stdout_json',
      'status',
      'budget_exceeded',
      'total_tokens',
      'warnings',
      'preview',
      'session',
      'comments',
      'comments_truncated',
      'auth_fallback_used',
      'probe_status',
      'stderr_signals',
      'deadline_hit',
    ],
    'scan-raw',
  );
  if (raw['schema'] !== 'factory-night-scan-raw/v1') fail('scan-raw schema');
  const sourceSha = raw['source_sha'];
  if (typeof sourceSha !== 'string' || !SHA.test(sourceSha)) fail('source_sha');
  const tool = closedObject(
    raw['tool'],
    ['version', 'git_head', 'lock_integrity', 'binary_version'],
    'tool',
  );
  const config = closedObject(
    raw['config'],
    [
      'scan_model',
      'protocol',
      'exclude',
      'flags',
      'concurrency',
      'max_tokens_budget',
      'repo_rule_sha256',
    ],
    'config',
  );
  const verdicts = closedObject(
    verdictsInput,
    [
      'schema',
      'source_sha',
      'verifier_model',
      'token_usage',
      'token_budget',
      'known_skipped',
      'verdicts',
    ],
    'verdicts',
  );
  if (verdicts['source_sha'] !== sourceSha) fail('verdicts source_sha');
  const verdictByIndex = new Map<number, JsonRecord>();
  for (const entry of items(verdicts['verdicts'], 'verdicts')) {
    const v = closedObject(entry, ['index', 'fingerprint', 'verdict', 'reason'], 'verdict');
    if (!['confirmed', 'disputed', 'refuted'].includes(String(v['verdict']))) fail('verdict');
    verdictByIndex.set(count(v['index'], 'verdict index'), v);
  }
  // Acceptance criteria are a courtesy: an invalid file only drops them.
  const criteria = new Map<number, string[]>();
  let acceptanceTokens = 0;
  try {
    const acceptance = closedObject(
      acceptanceInput,
      ['schema', 'source_sha', 'analyst_model', 'token_usage', 'items'],
      'acceptance',
    );
    if (acceptance['source_sha'] !== sourceSha) fail('acceptance source_sha');
    const parsed = items(acceptance['items'], 'acceptance items').map((entry) => {
      const item = closedObject(entry, ['index', 'criteria'], 'acceptance item');
      const list = strings(item['criteria'], 'criteria');
      if (list.length < 1 || list.length > 5) fail('criteria count');
      return [count(item['index'], 'acceptance index'), list.map((c) => c.slice(0, 200))] as const;
    });
    acceptanceTokens = count(acceptance['token_usage'], 'acceptance token_usage');
    for (const [index, list] of parsed) criteria.set(index, list);
  } catch {
    criteria.clear();
  }

  const comments = parseComments(raw['comments']);
  const preview = items(raw['preview'], 'preview').map((entry) => {
    const p = closedObject(entry, ['path', 'will_review', 'exclude_reason'], 'preview entry');
    return {
      path: clip(p['path'], 1024),
      will_review: flag(p['will_review'], 'will_review'),
      reason: p['exclude_reason'] === null ? null : clip(p['exclude_reason'], 256),
    };
  });
  const warnings = items(raw['warnings'], 'warnings').map((entry) => {
    const w = closedObject(entry, ['file', 'type'], 'warning');
    return { file: w['file'] === null ? null : clip(w['file'], 1024), type: clip(w['type'], 128) };
  });
  const session =
    raw['session'] === null
      ? []
      : items(raw['session'], 'session').map((entry) => {
          const s = closedObject(entry, ['type', 'file_path'], 'session entry');
          if (s['type'] !== 'done' && s['type'] !== 'failed') fail('session type');
          return { type: s['type'], file: clip(s['file_path'], 1024) };
        });

  const inventory = [...new Set(preview.map((p) => p.path))].toSorted();
  const willReview = [
    ...new Set(preview.filter((p) => p.will_review).map((p) => p.path)),
  ].toSorted();
  const covered = [
    ...new Set(session.filter((s) => s.type === 'done').map((s) => s.file)),
  ].toSorted();
  const failed = [
    ...new Set([
      ...session.filter((s) => s.type === 'failed').map((s) => s.file),
      ...warnings.flatMap((w) =>
        w.type === 'scan_subtask_error' && w.file !== null ? [w.file] : [],
      ),
    ]),
  ].toSorted();
  const excluded = preview
    .filter((p) => !p.will_review)
    .map((p) => ({ path: p.path, reason: p.reason ?? 'excluded' }))
    .toSorted((a, b) => a.path.localeCompare(b.path));

  // First non-refuted verified finding is published; every other unresolved one is deferred.
  const candidates: { comment: Comment; fingerprint: string; verdict: JsonRecord }[] = [];
  const deferred: JsonRecord[] = [];
  for (const comment of comments.toSorted((a, b) => a.index - b.index)) {
    const fingerprint = fingerprintFinding(rev, comment);
    const severity = SEVERITIES.includes(comment.severity) ? comment.severity : null;
    const verdict = verdictByIndex.get(comment.index);
    if (verdict !== undefined) {
      if (verdict['verdict'] === 'refuted') continue;
      if (fingerprint !== null && verdict['fingerprint'] !== fingerprint)
        fail('verdict fingerprint');
      if (fingerprint !== null && severity !== null) {
        // The same code flagged twice is one finding.
        if (candidates.some((candidate) => candidate.fingerprint === fingerprint)) continue;
        candidates.push({ comment, fingerprint, verdict });
        continue;
      }
    }
    // Known-skipped and unverified findings are deferred, never silently dropped.
    deferred.push({ fingerprint, path: comment.path, severity });
  }
  // Slot choice: confirmed before disputed, then severity, then comment index.
  const rank = (c: (typeof candidates)[number]): readonly [number, number, number] => [
    c.verdict['verdict'] === 'confirmed' ? 0 : 1,
    SEVERITIES.indexOf(c.comment.severity),
    c.comment.index,
  ];
  candidates.sort((a, b) => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  const [first, ...rest] = candidates;
  for (const { comment, fingerprint } of rest)
    deferred.push({ fingerprint, path: comment.path, severity: comment.severity });

  const toolRevision = `open-code-review@${clip(tool['version'], 64)}+${clip(tool['git_head'], 64)}+${clip(tool['lock_integrity'], 256)}`;
  const flags = strings(config['flags'], 'flags')
    .filter((f) => !/^--(max-tokens-budget|concurrency|timeout)(=|$)/.test(f))
    .toSorted();
  const configRevision = sha256({
    scan_model: clip(config['scan_model'], 128),
    protocol: clip(config['protocol'], 64),
    flags,
    exclude: strings(config['exclude'], 'exclude').toSorted(),
    repo_rule_sha256:
      config['repo_rule_sha256'] === null ? null : clip(config['repo_rule_sha256'], 64),
    home_rule_sha256: null,
    tool_revision: toolRevision,
  });
  const totalTokens = raw['total_tokens'] === null ? 0 : count(raw['total_tokens'], 'total_tokens');
  const unreached = willReview.filter((file) => !covered.includes(file) && !failed.includes(file));
  const truncated =
    flag(raw['budget_exceeded'], 'budget_exceeded') ||
    flag(raw['deadline_hit'], 'deadline_hit') ||
    flag(raw['comments_truncated'], 'comments_truncated') ||
    unreached.length > 0 ||
    deferred.length > 0;
  const successful =
    raw['exit_code'] === 0 &&
    flag(raw['stdout_json'], 'stdout_json') &&
    raw['status'] === 'success' &&
    warnings.length === 0 &&
    covered.length === willReview.length &&
    covered.every((file) => willReview.includes(file)) &&
    totalTokens > 0;

  const findings =
    first === undefined
      ? []
      : [
          {
            fingerprint: first.fingerprint,
            path: first.comment.path,
            start_line: first.comment.start_line,
            end_line: first.comment.end_line,
            severity: first.comment.severity,
            category: first.comment.category,
            description: first.comment.content,
            verdict: first.verdict['verdict'],
            verdict_reason: clip(first.verdict['reason'], 300),
            acceptance_criteria:
              first.verdict['verdict'] === 'confirmed'
                ? (criteria.get(first.comment.index) ?? null)
                : null,
          },
        ];
  return {
    selected: findings.length === 1,
    draft: {
      repository_id: repositoryId,
      source_sha: sourceSha,
      fingerprint_policy_revision: rev,
      inventory,
      inventory_sha256: sha256(inventory),
      covered,
      excluded,
      failed,
      token_usage:
        totalTokens + count(verdicts['token_usage'], 'verdict token_usage') + acceptanceTokens,
      truncated,
      successful,
      tool_revision: toolRevision,
      config_revision: configRevision,
      findings,
      deferred_findings: deferred,
    },
  };
}

function nightScanRevision(): string {
  const configured = record(loadFactoryPolicy()['night_scan'] ?? {})['fingerprint_policy_revision'];
  return typeof configured === 'string' && configured !== '' ? configured : fail('policy revision');
}
function adaptMain(argv: readonly string[]): void {
  const arg = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i < 1 ? undefined : argv[i + 1];
  };
  const bundle = arg('--bundle');
  const out = arg('--out');
  if (argv[0] !== 'adapt' || bundle === undefined || out === undefined) fail('usage');
  let acceptance: unknown = null;
  try {
    acceptance = readBundle(bundle, 'acceptance.json');
  } catch {
    // Optional: a missing or unreadable analyst file only drops acceptance criteria.
  }
  const { draft, selected } = buildScanDraft(
    readBundle(bundle, 'scan-raw.json'),
    readBundle(bundle, 'verdicts.json'),
    acceptance,
    arg('--revision') ?? nightScanRevision(),
    stringField(loadFactoryPolicy(), 'repository_id'),
  );
  fs.writeFileSync(out, canonicalBytes(draft));
  console.log(`selected=${String(selected)}`);
}
function cliMain(): void {
  try {
    adaptMain(process.argv.slice(2));
  } catch (error: unknown) {
    console.error(safeReason(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] === import.meta.filename) cliMain();
