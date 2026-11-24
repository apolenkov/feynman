import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createJiti } from 'jiti';
import type { TemplateToken } from '@actions/workflow-parser/templates/tokens/template-token';

// The official package imports JSON without Node's required attribute; use the standard loader.
const { isBoolean, isMapping, isString, NoOperationTraceWriter, parseWorkflow } = await createJiti(
  import.meta.url,
  { tryNative: false },
).import<typeof import('@actions/workflow-parser')>('@actions/workflow-parser');

const RELEASE = '1.7.12';
const ARCHIVE_DIGESTS: Readonly<Record<string, string>> = Object.freeze({
  darwin_arm64: 'aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f',
  darwin_amd64: '5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644',
  linux_amd64: '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
  linux_arm64: '325e971b6ba9bfa504672e29be93c24981eeb1c07576d730e9f7c8805afff0c6',
});
// shortcut: upstream issue rhysd/actionlint#657, снять после релиза с поддержкой queue
const QUEUE_DIAGNOSTIC =
  '^unexpected key "queue" for "concurrency" section\\. expected one of "cancel-in-progress", "group"$';

function checkQueue(token: TemplateToken | undefined): void {
  if (token === undefined || !isMapping(token)) return;
  const queue = token.find('queue');
  const cancel = token.find('cancel-in-progress');
  if (
    queue !== undefined &&
    isString(queue) &&
    queue.value === 'max' &&
    cancel !== undefined &&
    (!isBoolean(cancel) || cancel.value)
  )
    throw new Error('queue:max requires cancel-in-progress:false');
}
export function validateWorkflowSchema(content: string, name: string): void {
  const result = parseWorkflow({ name, content }, new NoOperationTraceWriter());
  result.context.errors.check('Official workflow parser');
  if (result.value === undefined || !isMapping(result.value))
    throw new Error('Workflow mapping absent');
  checkQueue(result.value.find('concurrency'));
  const jobs = result.value.find('jobs');
  if (jobs !== undefined && isMapping(jobs))
    for (const job of jobs) if (isMapping(job.value)) checkQueue(job.value.find('concurrency'));
}
const verified: { binary?: Promise<string> | undefined; directory?: string | undefined } = {};
// shortcut: disposal does not wait for an in-flight download; callers dispose after their last validation.
export function disposeActionlint(): void {
  verified.binary = undefined;
  if (verified.directory !== undefined)
    fs.rmSync(verified.directory, { recursive: true, force: true });
  verified.directory = undefined;
}
process.once('exit', disposeActionlint);
// One verified download per process; the private tool directory is removed by disposeActionlint or at exit.
export function actionlintBinary(): Promise<string> {
  verified.binary ??= downloadActionlint().catch((error: unknown) => {
    verified.binary = undefined;
    throw error;
  });
  return verified.binary;
}
async function downloadActionlint(): Promise<string> {
  const platform = `${process.platform}_${process.arch === 'x64' ? 'amd64' : process.arch}`;
  const expected = ARCHIVE_DIGESTS[platform];
  if (expected === undefined)
    throw new Error('Unsupported actionlint platform; no unverified fallback');
  const url = `https://github.com/rhysd/actionlint/releases/download/v${RELEASE}/actionlint_${RELEASE}_${platform}.tar.gz`;
  // A network stall or a 5xx is retried; any answer is still checked against the pinned digest below.
  let bytes: Buffer | undefined;
  for (let attempt = 1; bytes === undefined; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (response.ok) bytes = Buffer.from(await response.arrayBuffer());
    } catch (error: unknown) {
      if (attempt === 3) throw error;
      continue;
    }
    if (bytes === undefined) {
      if (response.status < 500 || attempt === 3)
        throw new Error('Pinned upstream actionlint download failed');
      await response.body?.cancel();
    }
  }
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error('Pinned upstream actionlint checksum mismatch');
  const executable = execFileSync('tar', ['-xzOf', '-', 'actionlint'], {
    input: bytes,
    maxBuffer: 20_000_000,
  });
  const directory = path.resolve(import.meta.dirname, '..', '.build', 'workflow-tools');
  fs.mkdirSync(directory, { recursive: true });
  const privateDirectory = fs.mkdtempSync(path.join(directory, 'actionlint-'));
  verified.directory = privateDirectory;
  const binary = path.join(privateDirectory, 'actionlint');
  fs.writeFileSync(binary, executable, { flag: 'wx', mode: 0o700 });
  return binary;
}
export async function validateNativeWorkflow(
  content: string,
  name: string,
  binary?: string,
): Promise<void> {
  validateWorkflowSchema(content, name);
  const result = spawnSync(
    binary ?? (await actionlintBinary()),
    ['-no-color', '-oneline', '-ignore', QUEUE_DIAGNOSTIC, '-stdin-filename', name, '-'],
    { input: content, encoding: 'utf8' },
  );
  if (result.status !== 0 || result.signal !== null || result.error !== undefined)
    throw new Error(
      `Upstream actionlint rejected ${name}: status=${String(result.status)} signal=${String(result.signal)} error=${result.error?.name ?? 'none'} ${result.stdout}${result.stderr}`,
    );
}

export async function checkWorkflows(
  directory: string,
  validate: (content: string, name: string) => void | Promise<void> = validateNativeWorkflow,
): Promise<void> {
  for (const file of fs
    .readdirSync(directory)
    .filter((name) => /\.ya?ml$/.test(name))
    .toSorted()) {
    await validate(fs.readFileSync(path.join(directory, file), 'utf8'), file);
  }
}

async function workflowMain(): Promise<void> {
  try {
    await checkWorkflows(path.resolve(import.meta.dirname, '..', '.github', 'workflows'));
    console.log(
      'Official schema + pinned upstream actionlint passed; only exact queue diagnostic excepted',
    );
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Workflow validation failed');
    process.exitCode = 1;
  } finally {
    disposeActionlint();
  }
}

if (process.argv[1] === import.meta.filename) await workflowMain();
