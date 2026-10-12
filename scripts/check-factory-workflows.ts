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
export async function actionlintBinary(): Promise<string> {
  const platform = `${process.platform}_${process.arch === 'x64' ? 'amd64' : process.arch}`;
  const expected = ARCHIVE_DIGESTS[platform];
  if (expected === undefined)
    throw new Error('Unsupported actionlint platform; no unverified fallback');
  const directory = path.resolve(import.meta.dirname, '..', '.build', 'factory-tools');
  fs.mkdirSync(directory, { recursive: true });
  const archivePath = path.join(directory, `actionlint_${RELEASE}_${platform}.tar.gz`);
  if (!fs.existsSync(archivePath)) {
    const response = await fetch(
      `https://github.com/rhysd/actionlint/releases/download/v${RELEASE}/actionlint_${RELEASE}_${platform}.tar.gz`,
      { signal: AbortSignal.timeout(30000) },
    );
    if (!response.ok) throw new Error('Pinned upstream actionlint download failed');
    fs.writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
  }
  const bytes = fs.readFileSync(archivePath);
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error('Pinned upstream actionlint checksum mismatch');
  const binary = path.join(directory, `actionlint-${RELEASE}-${platform}`);
  const executable = execFileSync('tar', ['-xzOf', '-', 'actionlint'], {
    input: bytes,
    maxBuffer: 20_000_000,
  });
  if (!fs.existsSync(binary) || !fs.readFileSync(binary).equals(executable)) {
    const temporary = `${binary}.${process.pid}.new`;
    fs.writeFileSync(temporary, executable, { mode: 0o755 });
    fs.renameSync(temporary, binary);
  }
  return binary;
}
export async function validateNativeWorkflow(content: string, name: string): Promise<void> {
  validateWorkflowSchema(content, name);
  const binary = await actionlintBinary();
  const result = spawnSync(
    binary,
    ['-no-color', '-oneline', '-ignore', QUEUE_DIAGNOSTIC, '-stdin-filename', name, '-'],
    { input: content, encoding: 'utf8' },
  );
  if (result.status !== 0 || result.signal !== null || result.error !== undefined)
    throw new Error(
      `Upstream actionlint rejected ${name}: status=${String(result.status)} signal=${String(result.signal)} error=${result.error?.name ?? 'none'} ${result.stdout}${result.stderr}`,
    );
}
async function workflowMain(): Promise<void> {
  try {
    const directory = path.resolve(import.meta.dirname, '..', '.github', 'workflows');
    for (const file of fs
      .readdirSync(directory)
      .filter((file) => file.endsWith('.yml'))
      .toSorted())
      await validateNativeWorkflow(fs.readFileSync(path.join(directory, file), 'utf8'), file);
    console.log(
      'Official schema + pinned upstream actionlint passed; only exact queue diagnostic excepted',
    );
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : 'Workflow validation failed');
    process.exitCode = 1;
  }
}

if (process.argv[1] === import.meta.filename) await workflowMain();
