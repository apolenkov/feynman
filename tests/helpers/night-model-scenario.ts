import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { arrayField, record, stringField } from '../../scripts/factory-protocol.ts';
import type { JsonRecord } from '../../scripts/factory-protocol.ts';
import { ANALYST_INSTRUCTION } from '../../scripts/factory-model.ts';
import { gitFixtureEnvironment } from './git-environment.ts';
import { startFakeLlm } from './fake-llm.ts';
import type { FakeLlm, LlmReply, LlmRequest } from './fake-llm.ts';

export const SCRIPT = path.join(import.meta.dirname, '..', '..', 'scripts', 'factory-model.ts');
export const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'ocr');
export const PRIMARY = 'sk-primary-0123456789abcdef0123456789abcdef';
export const FALLBACK = 'sk-fallback-fedcba9876543210fedcba9876543210';

export const REPO_FILES: Readonly<Record<string, string>> = {
  '.gitignore': 'node_modules\n',
  'docs/notes.md': '# notes\n\ntext\n',
  'src/auth.ts': `import { createHash } from 'node:crypto';

export function hashPassword(password: string): string {
  return createHash('md5').update(password).digest('hex');
}

export function isAdmin(user: { role?: string }): boolean {
  return user.role == 'admin';
}
`,
  'src/db.ts': `export function findUser(db: { query: (sql: string) => unknown }, name: string): unknown {
  return db.query("SELECT * FROM users WHERE name = '" + name + "'");
}
`,
  'src/util.ts': 'export const sum = (a: number[]): number => a.reduce((x, y) => x + y, 0);\n',
  'test/auth.test.ts': "import './x';\n",
};

export function tmp(t: TestContext): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'factory-model-'));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
export function readRecord(file: string): JsonRecord {
  const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  return record(value);
}
export function makeRepo(dir: string): string {
  const repo = path.join(dir, 'repo');
  for (const [name, content] of Object.entries(REPO_FILES)) {
    fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
    fs.writeFileSync(path.join(repo, name), content);
  }
  const env = gitFixtureEnvironment();
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, env, stdio: 'ignore' });
  };
  git('init', '-q', '-b', 'main');
  git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init');
  return repo;
}
export function writePolicy(
  dir: string,
  llmUrl: string,
  overrides: Record<string, unknown> = {},
): string {
  const base = readRecord(path.join(FIXTURES, 'policy.json'));
  const file = path.join(dir, 'policy.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      night_scan: { ...record(base['night_scan']), llm_url: llmUrl, ...overrides },
    }),
  );
  return file;
}
export function writeKnown(dir: string, fingerprints: string[] = [], revision = 'v1'): string {
  const file = path.join(dir, 'known.json');
  fs.writeFileSync(
    file,
    JSON.stringify({
      fingerprint_policy_revision: revision,
      fingerprints: fingerprints.toSorted(),
    }),
  );
  return file;
}

export interface Stub {
  readonly bin: string;
  readonly invocations: () => { argv: string[]; env: Record<string, string> }[];
}
// A native-binary stand-in: replays a recorded ocr run and logs its argv and its own environment.
export function stubOcr(
  dir: string,
  scenario: string,
  options: { hang?: boolean; version?: string; fixture?: JsonRecord } = {},
): Stub {
  const fixture = options.fixture ?? readRecord(path.join(FIXTURES, `${scenario}.json`));
  const preview = readRecord(path.join(FIXTURES, `${stringField(fixture, 'preview')}.json`));
  const log = path.join(dir, 'stub.log');
  const config = path.join(dir, 'stub-config.json');
  fs.writeFileSync(
    config,
    JSON.stringify({
      log,
      preview,
      stdout: fixture['stdout'],
      session: fixture['session'],
      exit_code: fixture['exit_code'],
      hang: options.hang === true,
      version: options.version ?? 'open-code-review v1.13.0 (1672852) test/stub',
    }),
  );
  const bin = path.join(dir, 'ocr-stub');
  fs.writeFileSync(
    bin,
    `#!/usr/bin/env node
const fs = require('node:fs');
const cfg = JSON.parse(fs.readFileSync(${JSON.stringify(config)}, 'utf8'));
const argv = process.argv.slice(2);
fs.appendFileSync(cfg.log, JSON.stringify({ argv, env: process.env }) + '\\n');
if (argv[0] === '--version') { console.log(cfg.version); process.exit(0); }
if (argv[0] === 'session') { if (cfg.session === null) process.exit(1); console.log(JSON.stringify(cfg.session)); process.exit(0); }
if (argv.includes('--preview')) { console.log(JSON.stringify(cfg.preview)); process.exit(0); }
if (cfg.hang) { setInterval(() => {}, 1000); } else {
  process.exitCode = cfg.exit_code;
  if (cfg.stdout !== '') process.stdout.write(JSON.stringify(cfg.stdout));
}
`,
    { mode: 0o755 },
  );
  return {
    bin,
    invocations: () =>
      fs.existsSync(log)
        ? fs
            .readFileSync(log, 'utf8')
            .trim()
            .split('\n')
            .map((line) => {
              const entry = record(JSON.parse(line) as unknown);
              return {
                argv: arrayField(entry, 'argv').map(String),
                env: Object.fromEntries(
                  Object.entries(record(entry['env'])).map(([k, v]) => [k, String(v)]),
                ),
              };
            })
        : [],
  };
}

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}
export function run(args: string[], env: Record<string, string>): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { env }, (error, stdout, stderr) => {
      const code = error === null ? 0 : typeof error.code === 'number' ? error.code : 1;
      resolve({ code, stdout, stderr });
    });
  });
}

export interface Scenario {
  readonly dir: string;
  readonly out: string;
  readonly stub: Stub;
  readonly llm: FakeLlm;
  readonly exec: (extra?: string[], env?: Record<string, string>) => Promise<RunResult>;
}
export async function scenario(
  t: TestContext,
  name: string,
  handler: (request: LlmRequest, count: number) => LlmReply,
  options: {
    known?: string[];
    policy?: Record<string, unknown>;
    hang?: boolean;
    fixture?: JsonRecord;
    keys?: Record<string, string>;
    revision?: string;
  } = {},
): Promise<Scenario> {
  const dir = tmp(t);
  const llm = await startFakeLlm(handler);
  t.after(async () => {
    await llm.close();
  });
  const repo = makeRepo(dir);
  const stub = stubOcr(dir, name, {
    ...(options.hang === true ? { hang: true } : {}),
    ...(options.fixture === undefined ? {} : { fixture: options.fixture }),
  });
  const policy = writePolicy(dir, llm.url, {
    ...options.policy,
    ...(options.revision === undefined ? {} : { fingerprint_policy_revision: options.revision }),
  });
  const known = writeKnown(dir, options.known, options.revision);
  const out = path.join(dir, 'out');
  const hostHome = path.join(dir, 'host-home');
  fs.mkdirSync(hostHome);
  const env = {
    PATH: process.env['PATH'] ?? '',
    HOME: hostHome,
    RUNNER_TEMP: dir,
    GITHUB_TOKEN: 'ghs_hosttoken0123456789',
    OCR_LLM_AUTH_TOKEN: PRIMARY,
    OPENCODE_GO_API_KEY: FALLBACK,
    ...options.keys,
  };
  return {
    dir,
    out,
    stub,
    llm,
    exec: (extra = [], overrides = {}) =>
      run(
        [
          'run',
          '--policy',
          policy,
          '--source',
          repo,
          '--ocr-bin',
          stub.bin,
          '--known',
          known,
          '--out',
          out,
          ...extra,
        ],
        { ...env, ...overrides },
      ),
  };
}

export type Kind = 'probe' | 'verify' | 'analyst';
export function kindOf(request: LlmRequest): Kind {
  if (request.body['max_tokens'] === 1) return 'probe';
  const messages = arrayField(request.body, 'messages').map(record);
  return messages[0]?.['content'] === ANALYST_INSTRUCTION ? 'analyst' : 'verify';
}
export function claimOf(request: LlmRequest): string {
  const messages = arrayField(request.body, 'messages').map(record);
  const user = record(JSON.parse(stringField(messages[1] ?? {}, 'content')) as unknown);
  return stringField(record(user['finding']), 'claim');
}
export const verdictReply = (verdict: string, reason = 'looks right'): LlmReply => ({
  content: JSON.stringify({ verdict, reason }),
});
export const criteriaReply: LlmReply = {
  content: JSON.stringify({ criteria: ['No md5 in password hashing'] }),
};
// Every call answered "confirmed" / valid criteria.
export const agreeable = (request: LlmRequest): LlmReply =>
  kindOf(request) === 'analyst' ? criteriaReply : verdictReply('confirmed');
export const bundle = (out: string, name: string): JsonRecord => readRecord(path.join(out, name));
