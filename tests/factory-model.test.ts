import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { arrayField, record, stringField } from '../scripts/factory-protocol.ts';
import type { LlmReply } from './helpers/fake-llm.ts';
import { buildScanDraft, fingerprintFinding } from '../scripts/factory-scan-record.ts';
import { VERIFIER_INSTRUCTION, loadNightPolicy, runModel } from '../scripts/factory-model.ts';
import {
  FALLBACK,
  FIXTURES,
  PRIMARY,
  agreeable,
  bundle,
  claimOf,
  criteriaReply,
  kindOf,
  readRecord,
  run,
  scenario,
  stubOcr,
  tmp,
  verdictReply,
  writePolicy,
} from './helpers/night-model-scenario.ts';

const LOCK = path.join(import.meta.dirname, '..', 'tools', 'ocr', 'package-lock.json');
const POLICY_INTEGRITY =
  'sha512-H35yl2HwU7rAIcsnSa/CaDUAUJ3yZKLBpQU5XXwtBEeB8RVAXYrzqDVb+7QQmKTLMuzBO9N3v9dSibGv5NIo9w==';
const SECRET_ENV = ['OCR_LLM_AUTH_TOKEN', 'OPENCODE_GO_API_KEY', 'GITHUB_TOKEN'];

const ok1 = readRecord(path.join(FIXTURES, 'ok1.json'));
const ok1Comments = arrayField(record(ok1['stdout']), 'comments').map(record);
function ok1Fingerprint(index: number): string {
  const comment = ok1Comments[index];
  assert.ok(comment !== undefined);
  const fingerprint = fingerprintFinding('v1', {
    path: stringField(comment, 'path'),
    category: stringField(comment, 'category'),
    existing_code: stringField(comment, 'existing_code'),
    start_line: Number(comment['start_line']),
  });
  assert.ok(fingerprint !== null);
  return fingerprint;
}

describe('factory-model run: environment and secrets', () => {
  it('gives ocr only the allowlisted environment and a throwaway HOME that is removed', async (t) => {
    const s = await scenario(t, 'ok1', agreeable);
    const result = await s.exec();
    assert.equal(result.code, 0, result.stderr);
    const calls = s.stub.invocations();
    assert.ok(calls.length >= 3);
    for (const call of calls) {
      for (const name of SECRET_ENV) assert.equal(call.env[name], undefined, name);
      assert.notEqual(call.env['HOME'], path.join(s.dir, 'host-home'));
      const home = call.env['HOME'];
      if (call.argv[0] === '--version') assert.equal(home, undefined);
      else assert.equal(home?.startsWith(path.join(s.dir, 'ocr-home-')), true);
      if (!call.argv.includes('--max-tokens-budget'))
        assert.equal(call.env['OCR_LLM_TOKEN'], undefined);
    }
    const scan = calls.find((call) => call.argv.includes('--max-tokens-budget'));
    assert.ok(scan !== undefined);
    // macOS injects __CF_USER_TEXT_ENCODING into every process, and Node adds NODE_V8_COVERAGE to children of a
    // coverage run; neither is ours.
    assert.deepEqual(
      Object.keys(scan.env)
        .filter(
          (name) =>
            name !== '__CF_USER_TEXT_ENCODING' &&
            !(name === 'NODE_V8_COVERAGE' && scan.env[name] === process.env[name]),
        )
        .toSorted(),
      [
        'HOME',
        'OCR_LLM_MODEL',
        'OCR_LLM_PROTOCOL',
        'OCR_LLM_TOKEN',
        'OCR_LLM_URL',
        'OCR_NO_UPDATE',
        'PATH',
      ],
    );
    assert.equal(scan.env['OCR_LLM_TOKEN'], PRIMARY);
    assert.equal(scan.env['OCR_LLM_PROTOCOL'], 'openai');
    assert.equal(scan.env['OCR_LLM_MODEL'], 'glm-5.3');
    assert.equal(scan.env['OCR_NO_UPDATE'], '1');
    assert.equal(scan.env['OCR_LLM_URL'], s.llm.url);
    assert.deepEqual(scan.argv.slice(0, 6), [
      'scan',
      '--format',
      'json',
      '--concurrency',
      '4',
      '--max-tokens-budget',
    ]);
    assert.ok(scan.argv.includes('**/package-lock.json'));
    assert.equal(fs.existsSync(scan.env['HOME'] ?? ''), false);
    for (const name of ['scan-raw.json', 'verdicts.json', 'acceptance.json']) {
      const text = fs.readFileSync(path.join(s.out, name), 'utf8');
      assert.equal(text.includes(PRIMARY) || text.includes(FALLBACK), false, name);
    }
  });

  for (const [label, echoed] of [
    ['primary', PRIMARY],
    ['fallback', FALLBACK],
  ] as const) {
    it(`refuses to write any artifact when the verifier echoes the ${label} key`, async (t) => {
      const s = await scenario(t, 'ok1', (request) =>
        kindOf(request) === 'verify'
          ? verdictReply('confirmed', `rejected key ${echoed}`)
          : agreeable(request),
      );
      const result = await s.exec();
      assert.equal(result.code, 1);
      assert.equal(fs.existsSync(s.out), false);
      assert.equal(result.stdout.includes(echoed) || result.stderr.includes(echoed), false);
    });
  }

  it('falls back to the second key only on 401 and records it', async (t) => {
    const s = await scenario(t, 'ok1', (request) =>
      request.authorization === `Bearer ${PRIMARY}`
        ? { status: 401, raw: '{}' }
        : agreeable(request),
    );
    const result = await s.exec();
    assert.equal(result.code, 0, result.stderr);
    assert.equal(bundle(s.out, 'scan-raw.json')['auth_fallback_used'], true);
    const scan = s.stub.invocations().find((call) => call.argv.includes('--max-tokens-budget'));
    assert.equal(scan?.env['OCR_LLM_TOKEN'], FALLBACK);
    assert.equal(s.llm.requests[0]?.authorization, `Bearer ${PRIMARY}`);
    assert.ok(s.llm.requests.slice(1).every((r) => r.authorization === `Bearer ${FALLBACK}`));
  });

  it('keeps the primary key when it works', async (t) => {
    const s = await scenario(t, 'ok1', agreeable);
    assert.equal((await s.exec()).code, 0);
    assert.equal(bundle(s.out, 'scan-raw.json')['auth_fallback_used'], false);
    assert.deepEqual(bundle(s.out, 'scan-raw.json')['probe_error'], { code: null, type: null });
  });

  for (const [label, error, expected] of [
    [
      'known error',
      { code: 'model_not_found', type: 'invalid_request_error', message: PRIMARY },
      { code: 'model_not_found', type: 'invalid_request_error' },
    ],
    ['echoed secrets', { code: PRIMARY, type: FALLBACK }, { code: null, type: null }],
    [
      'unknown strings',
      { code: 'new_provider_code', type: 'secret_looking_value' },
      { code: null, type: null },
    ],
    ['wrong types', { code: { key: PRIMARY }, type: ['api_error'] }, { code: null, type: null }],
    ['missing error', null, { code: null, type: null }],
  ] as const) {
    it(`records only allowlisted probe diagnostics: ${label}`, async (t) => {
      const s = await scenario(t, 'nofiles', () => ({
        status: 400,
        raw: JSON.stringify({ error }),
      }));
      const result = await s.exec();
      assert.equal(result.code, 0, result.stderr);
      const raw = bundle(s.out, 'scan-raw.json');
      assert.equal(raw['probe_status'], 400);
      assert.deepEqual(raw['probe_error'], expected);
      assert.equal(raw['auth_fallback_used'], false);
      assert.equal(s.llm.requests.length, 1);
      const text = fs.readFileSync(path.join(s.out, 'scan-raw.json'), 'utf8');
      assert.ok(!text.includes(PRIMARY) && !text.includes(FALLBACK));
      assert.doesNotThrow(() =>
        buildScanDraft(
          raw,
          bundle(s.out, 'verdicts.json'),
          bundle(s.out, 'acceptance.json'),
          'v1',
          '1230959148',
        ),
      );
    });
  }

  it('stops before scanning when no key is accepted', async (t) => {
    const s = await scenario(t, 'ok1', () => ({ status: 401, raw: '{}' }));
    const result = await s.exec();
    assert.equal(result.code, 1);
    assert.equal(fs.existsSync(s.out), false);
    assert.equal(
      s.stub.invocations().some((call) => call.argv.includes('--max-tokens-budget')),
      false,
    );
  });

  it('stops when no key is configured at all', async (t) => {
    const s = await scenario(t, 'ok1', agreeable, {
      keys: { OCR_LLM_AUTH_TOKEN: '', OPENCODE_GO_API_KEY: '' },
    });
    assert.equal((await s.exec()).code, 1);
    assert.equal(s.llm.requests.length, 0);
  });
});

describe('factory-model run: recorded ocr outputs', () => {
  it('a failed run (429, rc=1, empty stdout) is incomplete, not zero findings', async (t) => {
    const s = await scenario(t, 'e429', agreeable);
    const result = await s.exec();
    assert.equal(result.code, 0, result.stderr);
    const raw = bundle(s.out, 'scan-raw.json');
    assert.equal(raw['stdout_json'], false);
    assert.equal(raw['exit_code'], 1);
    assert.equal(raw['status'], null);
    assert.deepEqual(raw['comments'], []);
    assert.equal(raw['session'], null);
    assert.deepEqual(arrayField(bundle(s.out, 'verdicts.json'), 'verdicts'), []);
    assert.equal(s.llm.requests.filter((r) => kindOf(r) !== 'probe').length, 0);
  });

  it('unparseable ocr stdout is a failed run too', async (t) => {
    const s = await scenario(t, 'egarb', agreeable);
    assert.equal((await s.exec()).code, 0);
    assert.equal(bundle(s.out, 'scan-raw.json')['stdout_json'], false);
  });

  it('keeps warnings without their message and the session without errors', async (t) => {
    const s = await scenario(t, 'partial', agreeable);
    assert.equal((await s.exec()).code, 0);
    const raw = bundle(s.out, 'scan-raw.json');
    assert.equal(raw['status'], 'completed_with_errors');
    assert.deepEqual(raw['warnings'], [{ file: 'src/db.ts', type: 'scan_subtask_error' }]);
    assert.deepEqual(raw['session'], [
      { type: 'failed', file_path: 'src/db.ts' },
      { type: 'done', file_path: 'src/util.ts' },
      { type: 'done', file_path: 'src/auth.ts' },
      { type: 'done', file_path: '.gitignore' },
    ]);
    assert.equal(raw['total_tokens'], 16396);
    const draft = buildScanDraft(
      raw,
      bundle(s.out, 'verdicts.json'),
      bundle(s.out, 'acceptance.json'),
      'v1',
      '1230959148',
    ).draft;
    assert.equal(draft['successful'], false);
    assert.deepEqual(draft['failed'], ['src/db.ts']);
  });

  it('more than 200 comments are cut and the cut is recorded', async (t) => {
    const first = ok1Comments[0];
    assert.ok(first !== undefined);
    const stdout = { ...record(ok1['stdout']), comments: Array.from({ length: 201 }, () => first) };
    const s = await scenario(t, 'ok1', agreeable, { fixture: { ...ok1, stdout } });
    assert.equal((await s.exec()).code, 0);
    const raw = bundle(s.out, 'scan-raw.json');
    assert.equal(arrayField(raw, 'comments').length, 200);
    assert.equal(raw['comments_truncated'], true);
    const exact = await scenario(t, 'ok1', agreeable);
    assert.equal((await exact.exec()).code, 0);
    assert.equal(bundle(exact.out, 'scan-raw.json')['comments_truncated'], false);
  });

  it('reports an exceeded budget', async (t) => {
    const s = await scenario(t, 'c1', agreeable);
    assert.equal((await s.exec()).code, 0);
    const raw = bundle(s.out, 'scan-raw.json');
    assert.equal(raw['budget_exceeded'], true);
    assert.equal(raw['total_tokens'], 64800);
  });

  it('a skipped scan has no session and no comments', async (t) => {
    const s = await scenario(t, 'nofiles', agreeable);
    assert.equal((await s.exec()).code, 0);
    const raw = bundle(s.out, 'scan-raw.json');
    assert.equal(raw['status'], 'skipped');
    assert.deepEqual(raw['comments'], []);
    assert.deepEqual(raw['preview'], [
      { path: 'docs/notes.md', will_review: false, exclude_reason: 'unsupported_ext' },
    ]);
  });

  it('a clean run produces a bundle the record adapter accepts as successful', async (t) => {
    const s = await scenario(t, 'ok1', agreeable);
    assert.equal((await s.exec()).code, 0);
    const raw = bundle(s.out, 'scan-raw.json');
    assert.equal(raw['schema'], 'factory-night-scan-raw/v1');
    assert.equal(arrayField(raw, 'comments').length, 3);
    assert.deepEqual(record(raw['tool']), {
      version: '1.13.0',
      git_head: '1672852',
      lock_integrity: POLICY_INTEGRITY,
      binary_version: 'open-code-review v1.13.0 (1672852) test/stub',
    });
    const built = buildScanDraft(
      raw,
      bundle(s.out, 'verdicts.json'),
      bundle(s.out, 'acceptance.json'),
      'v1',
      '1230959148',
    );
    assert.equal(built.selected, true);
    assert.equal(built.draft['successful'], true);
  });

  it('keeps only HTTP codes and known phrases from a failing ocr stderr, never its text', async (t) => {
    const s = await scenario(t, 'ok1', agreeable, {
      fixture: { ...readRecord(path.join(FIXTURES, 'ok1.json')), stdout: '', exit_code: 1 },
      stderr: `scan failed: all 2 file scan(s) failed: POST /chat/completions: 404 Not Found {"error":"model not found: glm-x","key":"${PRIMARY}"} status code: 404\n`,
    });
    assert.equal((await s.exec()).code, 0);
    const raw = bundle(s.out, 'scan-raw.json');
    assert.equal(raw['probe_status'], 200);
    assert.deepEqual(raw['stderr_signals'], {
      http_statuses: [404],
      messages: ['scan failed', 'model not found'],
    });
    const text = fs.readFileSync(path.join(s.out, 'scan-raw.json'), 'utf8');
    assert.ok(!text.includes(PRIMARY) && !text.includes('glm-x'));
  });

  it('reads the status of an openai-go error line and keeps the newest stderr when it is huge', async (t) => {
    const noise = 'progress: reviewing a file\n'.repeat(8000);
    const s = await scenario(t, 'ok1', agreeable, {
      fixture: { ...readRecord(path.join(FIXTURES, 'ok1.json')), stdout: '', exit_code: 1 },
      stderr: `${noise}Scan subtask error: POST "https://x/v1/chat/completions": 429 Too Many Requests\n`,
    });
    const result = await s.exec();
    assert.equal(result.code, 0, result.stderr);
    const raw = bundle(s.out, 'scan-raw.json');
    assert.equal(raw['deadline_hit'], false);
    assert.deepEqual(raw['stderr_signals'], {
      http_statuses: [429],
      messages: ['Scan subtask error'],
    });
  });

  it('refuses a known list built for another fingerprint revision', async (t) => {
    const s = await scenario(t, 'ok1', agreeable, {
      policy: { fingerprint_policy_revision: 'v2' },
    });
    assert.equal((await s.exec()).code, 1);
    assert.equal(fs.existsSync(s.out), false);
  });

  it('refuses a dirty checkout', async (t) => {
    const s = await scenario(t, 'ok1', agreeable);
    fs.writeFileSync(path.join(s.dir, 'repo', 'untracked.ts'), 'export {};\n');
    assert.equal((await s.exec()).code, 1);
    assert.equal(fs.existsSync(s.out), false);
  });

  it('refuses a binary that is not the pinned build', async (t) => {
    const s = await scenario(t, 'ok1', agreeable);
    const wrongDir = tmp(t);
    const wrong = stubOcr(wrongDir, 'ok1', {
      version: 'open-code-review v1.13.0 (deadbee) test/stub',
    });
    const result = await run(
      [
        'run',
        '--policy',
        path.join(s.dir, 'policy.json'),
        '--source',
        path.join(s.dir, 'repo'),
        '--ocr-bin',
        wrong.bin,
        '--known',
        path.join(s.dir, 'known.json'),
        '--out',
        s.out,
      ],
      { PATH: process.env['PATH'] ?? '', OCR_LLM_AUTH_TOKEN: PRIMARY },
    );
    assert.equal(result.code, 1);
    assert.equal(fs.existsSync(s.out), false);
  });
});

describe('factory-model run: verification and acceptance', () => {
  it('turns a garbage verifier answer into disputed, never confirmed', async (t) => {
    const answers: LlmReply[] = [
      { content: 'sure, it is a bug!' },
      { content: JSON.stringify({ verdict: 'confirmed', reason: 'x', extra: 1 }) },
      verdictReply('definitely'),
    ];
    let next = 0;
    const s = await scenario(t, 'ok1', (request) =>
      kindOf(request) === 'verify'
        ? (answers[next++] ?? { status: 500, raw: '' })
        : agreeable(request),
    );
    assert.equal((await s.exec()).code, 0);
    const verdicts = arrayField(bundle(s.out, 'verdicts.json'), 'verdicts').map(record);
    assert.equal(verdicts.length, 3);
    assert.ok(verdicts.every((v) => v['verdict'] === 'disputed'));
    assert.equal(s.llm.requests.filter((r) => kindOf(r) === 'analyst').length, 0);
  });

  for (const [name, failure] of [
    ['a 5xx', { status: 502, raw: '<html>bad gateway</html>' }],
    ['a 429', { status: 429, raw: '{"error":"rate limited"}' }],
    ['a network failure', { drop: true }],
    ['a 403', { status: 403, raw: '{"error":"model not in plan"}' }],
  ] as const)
    it(`stops verifying on ${name} and leaves the findings unverified`, async (t) => {
      const s = await scenario(t, 'ok1', (request) =>
        kindOf(request) === 'verify' ? failure : agreeable(request),
      );
      assert.equal((await s.exec()).code, 0);
      assert.equal(s.llm.requests.filter((r) => kindOf(r) === 'verify').length, 1);
      assert.deepEqual(arrayField(bundle(s.out, 'verdicts.json'), 'verdicts'), []);
    });

  it('keeps the verdict before a provider failure and defers the rest', async (t) => {
    let verifies = 0;
    const s = await scenario(t, 'ok1', (request) => {
      if (kindOf(request) !== 'verify') return agreeable(request);
      verifies += 1;
      return verifies === 1 ? verdictReply('disputed') : { status: 502, raw: '' };
    });
    assert.equal((await s.exec()).code, 0);
    assert.equal(verifies, 2);
    const verdicts = arrayField(bundle(s.out, 'verdicts.json'), 'verdicts').map(record);
    assert.equal(verdicts.length, 1);
    assert.equal(verdicts[0]?.['verdict'], 'disputed');
  });

  it('turns a per-finding refusal (400) into disputed and keeps verifying', async (t) => {
    const s = await scenario(t, 'ok1', (request) =>
      kindOf(request) === 'verify'
        ? { status: 400, raw: '{"error":"content filtered"}' }
        : agreeable(request),
    );
    assert.equal((await s.exec()).code, 0);
    assert.equal(s.llm.requests.filter((r) => kindOf(r) === 'verify').length, 3);
    const verdicts = arrayField(bundle(s.out, 'verdicts.json'), 'verdicts').map(record);
    assert.ok(
      verdicts.length === 3 &&
        verdicts.every(
          (v) => v['verdict'] === 'disputed' && v['reason'] === 'Verifier refused: HTTP 400',
        ),
    );
  });

  it('treats an HTML body with status 200 as disputed', async (t) => {
    const s = await scenario(t, 'ok1', (request) =>
      kindOf(request) === 'verify'
        ? { status: 200, raw: '<html>not json</html>' }
        : agreeable(request),
    );
    assert.equal((await s.exec()).code, 0);
    const verdicts = arrayField(bundle(s.out, 'verdicts.json'), 'verdicts').map(record);
    assert.ok(verdicts.length === 3 && verdicts.every((v) => v['verdict'] === 'disputed'));
  });

  it('sends the finding as data under a fixed system instruction', async (t) => {
    const s = await scenario(t, 'ok1', agreeable);
    assert.equal((await s.exec()).code, 0);
    const first = s.llm.requests.find((r) => kindOf(r) === 'verify');
    assert.ok(first !== undefined);
    const messages = arrayField(first.body, 'messages').map(record);
    assert.equal(messages.length, 2);
    assert.deepEqual(messages[0], { role: 'system', content: VERIFIER_INSTRUCTION });
    assert.equal(messages[1]?.['role'], 'user');
    const user = record(JSON.parse(stringField(record(messages[1]), 'content')) as unknown);
    assert.deepEqual(Object.keys(user), ['finding']);
    assert.equal(first.body['model'], 'kimi-k3');
    assert.match(stringField(record(user['finding']), 'excerpt'), /createHash|query/);
  });

  it('stops verifying once the verifier budget is spent', async (t) => {
    const s = await scenario(
      t,
      'ok1',
      (request) =>
        kindOf(request) === 'verify'
          ? { ...verdictReply('disputed'), tokens: 100 }
          : agreeable(request),
      {
        policy: { verifier_token_budget: 100 },
      },
    );
    assert.equal((await s.exec()).code, 0);
    const verdicts = bundle(s.out, 'verdicts.json');
    assert.equal(s.llm.requests.filter((r) => kindOf(r) === 'verify').length, 1);
    // The most severe finding (critical, index 2) is verified first; the rest stay unverified.
    assert.deepEqual(
      arrayField(verdicts, 'verdicts').map((v) => record(v)['index']),
      [2],
    );
    assert.equal(verdicts['token_usage'], 100);
    assert.equal(verdicts['token_budget'], 100);
  });

  it('honours verify_cap', async (t) => {
    const s = await scenario(t, 'ok1', agreeable, { policy: { verify_cap: 2 } });
    assert.equal((await s.exec()).code, 0);
    assert.equal(s.llm.requests.filter((r) => kindOf(r) === 'verify').length, 2);
  });

  it('skips fingerprints the factory already knows', async (t) => {
    const s = await scenario(t, 'ok1', agreeable, { known: [ok1Fingerprint(2)] });
    assert.equal((await s.exec()).code, 0);
    const verdicts = bundle(s.out, 'verdicts.json');
    assert.deepEqual(verdicts['known_skipped'], [2]);
    assert.deepEqual(
      arrayField(verdicts, 'verdicts').map((v) => record(v)['index']),
      [0, 1],
    );
    assert.equal(s.llm.requests.filter((r) => kindOf(r) === 'verify').length, 2);
    assert.ok(
      s.llm.requests
        .filter((r) => kindOf(r) === 'verify')
        .every((r) => !claimOf(r).includes('SQL')),
    );
  });

  it('asks the analyst only about confirmed findings', async (t) => {
    const s = await scenario(t, 'ok1', (request) => {
      const kind = kindOf(request);
      if (kind === 'analyst') return criteriaReply;
      if (kind === 'probe') return { content: 'ok' };
      return claimOf(request).includes('MD5') ? verdictReply('confirmed') : verdictReply('refuted');
    });
    assert.equal((await s.exec()).code, 0);
    const analystCalls = s.llm.requests.filter((r) => kindOf(r) === 'analyst');
    assert.equal(analystCalls.length, 1);
    const [analystCall] = analystCalls;
    assert.ok(analystCall !== undefined);
    assert.match(claimOf(analystCall), /MD5/);
    const acceptance = bundle(s.out, 'acceptance.json');
    assert.deepEqual(arrayField(acceptance, 'items'), [
      { index: 0, criteria: ['No md5 in password hashing'] },
    ]);
    assert.equal(acceptance['token_usage'], 50);
    assert.equal(acceptance['analyst_model'], 'kimi-k3');
  });

  it('drops invalid acceptance criteria instead of failing', async (t) => {
    const bad = ['{"criteria":[]}', '{"criteria":["a","b","c","d","e","f"]}', '{"criteria":[1]}'];
    let next = 0;
    const s = await scenario(t, 'ok1', (request) =>
      kindOf(request) === 'analyst'
        ? { content: bad[next++] ?? 'nope' }
        : verdictReply('confirmed'),
    );
    assert.equal((await s.exec()).code, 0);
    assert.deepEqual(arrayField(bundle(s.out, 'acceptance.json'), 'items'), []);
  });
});

describe('factory-model run: shared deadline', () => {
  const direct = (
    s: Awaited<ReturnType<typeof scenario>>,
    clock: () => number,
    deadlineSeconds = 100,
  ): Promise<void> =>
    runModel({
      source: path.join(s.dir, 'repo'),
      ocrBin: s.stub.bin,
      knownFile: path.join(s.dir, 'known.json'),
      outDir: s.out,
      policy: loadNightPolicy(path.join(s.dir, 'policy.json')),
      env: { PATH: process.env['PATH'] ?? '', RUNNER_TEMP: s.dir, OCR_LLM_AUTH_TOKEN: PRIMARY },
      deadlineSeconds,
      clock,
    });
  const scanned = (s: Awaited<ReturnType<typeof scenario>>): boolean =>
    s.stub.invocations().some((call) => call.argv.includes('--max-tokens-budget'));

  it(
    'an ocr that hangs is killed at its share of the deadline and leaves an incomplete record',
    { timeout: 10_000 },
    async (t) => {
      const s = await scenario(t, 'ok1', agreeable, { hang: true });
      // A frozen clock keeps setup from spending the deadline under load; only the scan's kill timer runs.
      await direct(s, () => 0, 1);
      const raw = bundle(s.out, 'scan-raw.json');
      assert.equal(raw['deadline_hit'], true);
      assert.equal(raw['stdout_json'], false);
    },
  );

  it('a deadline spent by the scan skips verification and acceptance but still writes the bundle', async (t) => {
    const s = await scenario(t, 'ok1', agreeable);
    await direct(s, () => (scanned(s) ? 1e12 : 0));
    assert.deepEqual(s.llm.requests.map(kindOf), ['probe']);
    assert.equal(bundle(s.out, 'scan-raw.json')['deadline_hit'], true);
    assert.deepEqual(arrayField(bundle(s.out, 'verdicts.json'), 'verdicts'), []);
    assert.deepEqual(arrayField(bundle(s.out, 'acceptance.json'), 'items'), []);
  });

  it('a deadline spent mid-verification stops before the next call and before the analyst', async (t) => {
    const s = await scenario(t, 'ok1', agreeable);
    await direct(s, () => (s.llm.requests.some((r) => kindOf(r) === 'verify') ? 1e12 : 0));
    assert.equal(s.llm.requests.filter((r) => kindOf(r) === 'verify').length, 1);
    assert.equal(s.llm.requests.filter((r) => kindOf(r) === 'analyst').length, 0);
    assert.equal(bundle(s.out, 'scan-raw.json')['deadline_hit'], true);
    assert.equal(arrayField(bundle(s.out, 'verdicts.json'), 'verdicts').length, 1);
  });

  it('a deadline spent by the last call still marks the run incomplete', async (t) => {
    const baseline = await scenario(t, 'ok1', agreeable);
    await direct(baseline, () => 0);
    const calls = baseline.llm.requests.length;
    const s = await scenario(t, 'ok1', agreeable);
    await direct(s, () => (s.llm.requests.length >= calls ? 1e12 : 0));
    assert.equal(s.llm.requests.length, calls);
    assert.equal(bundle(baseline.out, 'scan-raw.json')['deadline_hit'], false);
    assert.equal(bundle(s.out, 'scan-raw.json')['deadline_hit'], true);
  });

  it('refuses a non-positive --deadline-seconds', async (t) => {
    const s = await scenario(t, 'ok1', agreeable);
    assert.equal((await s.exec(['--deadline-seconds', '0'])).code, 1);
    assert.equal(fs.existsSync(s.out), false);
  });
});

describe('factory-model check-tool and policy', () => {
  function prefixWithBinary(
    dir: string,
    version = 'open-code-review v1.13.0 (1672852) x/y',
  ): string {
    const prefix = path.join(dir, 'prefix');
    const pkg = path.join(prefix, 'node_modules', '@alibaba-group');
    fs.mkdirSync(path.join(pkg, 'open-code-review'), { recursive: true });
    fs.writeFileSync(path.join(pkg, 'open-code-review', 'package.json'), '{"version":"1.13.0"}');
    fs.copyFileSync(LOCK, path.join(prefix, 'package-lock.json'));
    const bin = path.join(pkg, `ocr-${process.platform}-${process.arch}`, 'bin', 'opencodereview');
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, `#!/bin/sh\necho '${version}'\n`, { mode: 0o755 });
    return prefix;
  }
  const policyFile = path.join(FIXTURES, 'policy.json');
  const env = { PATH: process.env['PATH'] ?? '' };

  it('the committed lock pins the policy integrity and ships every platform binary', () => {
    const lock = record(readRecord(LOCK)['packages']);
    assert.equal(
      record(lock['node_modules/@alibaba-group/open-code-review'])['integrity'],
      POLICY_INTEGRITY,
    );
    for (const platform of ['linux-x64', 'darwin-arm64'])
      assert.ok(`node_modules/@alibaba-group/ocr-${platform}` in lock, platform);
    const pkg = readRecord(path.join(path.dirname(LOCK), 'package.json'));
    assert.equal(pkg['private'], true);
    assert.equal(pkg['scripts'], undefined);
    assert.deepEqual(pkg['dependencies'], { '@alibaba-group/open-code-review': '1.13.0' });
  });

  it('accepts the pinned install and prints the native binary', async (t) => {
    const dir = tmp(t);
    const prefix = prefixWithBinary(dir);
    const result = await run(['check-tool', '--policy', policyFile, '--prefix', prefix], env);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /^ocr_bin=.*opencodereview\n$/);
  });

  it('rejects a binary built from another commit', async (t) => {
    const prefix = prefixWithBinary(tmp(t), 'open-code-review v1.13.0 (deadbee) x/y');
    assert.equal(
      (await run(['check-tool', '--policy', policyFile, '--prefix', prefix], env)).code,
      1,
    );
  });

  it('rejects a lock whose integrity differs from the policy', async (t) => {
    const dir = tmp(t);
    const prefix = prefixWithBinary(dir);
    const policy = writePolicy(dir, 'https://example.com/v1', {
      ocr_lock_integrity: 'sha512-AAAA',
    });
    assert.equal((await run(['check-tool', '--policy', policy, '--prefix', prefix], env)).code, 1);
  });

  it('rejects a native binary whose lock integrity differs from the pinned one', async (t) => {
    const dir = tmp(t);
    const prefix = prefixWithBinary(dir);
    const policy = writePolicy(dir, 'https://example.com/v1', {
      ocr_native_integrity: { [`${process.platform}-${process.arch}`]: 'sha512-AAAA' },
    });
    assert.equal((await run(['check-tool', '--policy', policy, '--prefix', prefix], env)).code, 1);
  });

  it('rejects a platform without a pinned native integrity', async (t) => {
    const dir = tmp(t);
    const prefix = prefixWithBinary(dir);
    const policy = writePolicy(dir, 'https://example.com/v1', { ocr_native_integrity: {} });
    assert.equal((await run(['check-tool', '--policy', policy, '--prefix', prefix], env)).code, 1);
  });

  it('rejects a non-https model endpoint', async (t) => {
    const dir = tmp(t);
    const prefix = prefixWithBinary(dir);
    const policy = writePolicy(dir, 'http://models.example.com/v1');
    assert.equal((await run(['check-tool', '--policy', policy, '--prefix', prefix], env)).code, 1);
  });
});
