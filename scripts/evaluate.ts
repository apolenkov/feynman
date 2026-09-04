#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { readRulesForIntensity } from '../lib/state/rules.ts';

const COMMON = 'Answer the user using only the supplied facts. Do not call tools.';

export interface EvaluationCommandResult {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: Error;
}
export type EvaluationCommandRunner = (
  command: string,
  args: readonly string[],
  options: Readonly<{
    cwd?: string;
    encoding: 'utf8';
    env?: Readonly<NodeJS.ProcessEnv>;
    timeout?: number;
    maxBuffer?: number;
  }>,
) => EvaluationCommandResult;
export interface EvaluationOptions {
  readonly model: string;
  readonly outputDirectory: string;
  readonly root?: string;
  readonly authSource?: string;
  readonly temporaryRoot?: string;
  readonly runCommand?: EvaluationCommandRunner;
  readonly now?: () => Date;
  readonly environment?: Readonly<NodeJS.ProcessEnv>;
  readonly onProgress?: (line: string) => void;
  readonly removeTemporaryHome?: (home: string) => void;
}
interface EvaluationTask {
  readonly id: number;
  readonly prompt: string;
}
interface Conditions {
  readonly baseline: string;
  readonly skill: string;
  readonly hook: string;
}

const hash = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseTasks(text: string): readonly EvaluationTask[] {
  const parsed: unknown = JSON.parse(text);
  if (!record(parsed) || !Array.isArray(parsed['evals']) || parsed['evals'].length !== 20)
    throw new Error('Expected the frozen 20-task evaluation set');
  const tasks = parsed['evals'].map((task: unknown): EvaluationTask => {
    if (!record(task) || typeof task['id'] !== 'number' || typeof task['prompt'] !== 'string')
      throw new Error('Invalid evaluation task');
    return { id: task['id'], prompt: task['prompt'] };
  });
  if (new Set(tasks.map(({ id }) => id)).size !== tasks.length)
    throw new Error('Duplicate evaluation task IDs');
  return tasks;
}

function textOutput(value: string | Buffer | null): string {
  return typeof value === 'string' ? value : (value?.toString() ?? '');
}

export function runEvaluationCommand(
  command: string,
  args: readonly string[],
  options: Readonly<{
    cwd?: string;
    encoding: 'utf8';
    env?: Readonly<NodeJS.ProcessEnv>;
    timeout?: number;
    maxBuffer?: number;
  }>,
): EvaluationCommandResult {
  const spawnOptions =
    options.env === undefined ? options : { ...options, env: { ...options.env } };
  const result: SpawnSyncReturns<string | Buffer> = spawnSync(command, args, spawnOptions);
  return {
    status: result.status,
    signal: result.signal,
    stdout: textOutput(result.stdout),
    stderr: textOutput(result.stderr),
    ...(result.error === undefined ? {} : { error: result.error }),
  };
}

function checkedGit(
  runner: EvaluationCommandRunner,
  root: string,
  args: readonly string[],
): string {
  const result = runner('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0 || result.error !== undefined || result.signal !== null) {
    const diagnostic = [
      result.error?.message ?? '',
      result.signal === null ? '' : `signal ${result.signal}`,
      result.stderr,
      result.stdout,
    ]
      .filter((part) => part.length > 0)
      .join('\n');
    throw new Error(
      `Cannot identify source revision${diagnostic.length > 0 ? `:\n${diagnostic}` : ''}`,
    );
  }
  return result.stdout.trim();
}

function readConditions(root: string): Conditions {
  const skill = fs.readFileSync(path.join(root, 'plugins/feynman/skills/feynman/SKILL.md'), 'utf8');
  const hook = readRulesForIntensity(
    fs.readFileSync(path.join(root, 'rules/feynman-contract.md'), 'utf8'),
    'full',
  );
  if (hook.length === 0) throw new Error('Missing full-intensity Contract');
  return { baseline: '', skill, hook };
}

function parseEvents(stdout: string): readonly unknown[] {
  if (stdout.trim().length === 0) return [];
  return stdout
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line): unknown => JSON.parse(line));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runEvaluation(options: Readonly<EvaluationOptions>): void {
  const root = options.root ?? path.resolve(import.meta.dirname, '..');
  const output = path.resolve(options.outputDirectory);
  const runner = options.runCommand ?? runEvaluationCommand;
  const now = options.now ?? (() => new Date());
  const environment = options.environment ?? process.env;
  const temporaryRoot = options.temporaryRoot ?? os.tmpdir();
  const onProgress = options.onProgress ?? ((line: string) => process.stdout.write(`${line}\n`));
  const removeTemporaryHome =
    options.removeTemporaryHome ??
    ((home: string) => {
      fs.rmSync(home, { recursive: true, force: true });
    });
  const authSource =
    options.authSource ??
    path.join(environment['CODEX_HOME'] ?? path.join(os.homedir(), '.codex'), 'auth.json');
  fs.mkdirSync(output);
  const tasksText = fs.readFileSync(path.join(root, 'evals/evals.json'), 'utf8');
  const tasks = parseTasks(tasksText);
  const conditions = readConditions(root);
  const entries: readonly (readonly [keyof Conditions, string])[] = [
    ['baseline', conditions.baseline],
    ['skill', conditions.skill],
    ['hook', conditions.hook],
  ];
  const version = runner('codex', ['--version'], { encoding: 'utf8' });
  if (version.status !== 0 || version.error !== undefined || version.signal !== null) {
    const diagnostic = [
      version.error?.message ?? '',
      version.signal === null ? '' : `terminated by signal: ${version.signal}`,
      version.stderr,
      version.stdout,
    ]
      .filter((part) => part.length > 0)
      .join('\n');
    throw new Error(`Codex CLI is unavailable${diagnostic.length > 0 ? `:\n${diagnostic}` : ''}`);
  }
  const manifest = {
    protocol: 1,
    model: options.model,
    reasoning: 'medium',
    sourceHead: checkedGit(runner, root, ['rev-parse', 'HEAD']),
    sourceDiffHash: hash(checkedGit(runner, root, ['diff', 'HEAD', '--binary'])),
    runnerHash: hash(fs.readFileSync(import.meta.filename)),
    tasksHash: hash(tasksText),
    codexVersion: version.stdout.trim(),
    startedAt: now().toISOString(),
    repetitions: 3,
    expectedAttempts: 180,
    delivery: 'Direct developer-instruction injection; does not establish skill discovery',
    instructions: Object.fromEntries(
      entries.map(([name, instruction]) => [name, hash(`${COMMON}\n${instruction}`)]),
    ),
  };
  fs.writeFileSync(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(output, 'tasks.json'), tasksText);
  fs.writeFileSync(
    path.join(output, 'instructions.json'),
    `${JSON.stringify(conditions, null, 2)}\n`,
  );
  const network = Object.fromEntries(
    Object.entries(environment).filter(([name]) =>
      /^(HTTPS?_PROXY|ALL_PROXY|NO_PROXY|https?_proxy|all_proxy|no_proxy|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$/.test(
        name,
      ),
    ),
  );
  const repetitions: readonly number[] = [1, 2, 3];
  for (const task of tasks) {
    for (const repetition of repetitions) {
      const offset = (task.id + repetition) % entries.length;
      const ordered = [...entries.slice(offset), ...entries.slice(0, offset)];
      for (const [condition, instructions] of ordered) {
        const id = `${task.id}-${repetition}-${condition}`;
        const home = fs.mkdtempSync(path.join(temporaryRoot, 'feynman-eval-'));
        const codexHome = path.join(home, '.codex');
        fs.mkdirSync(codexHome, { mode: 0o700 });
        const started = performance.now();
        let primaryError: unknown;
        try {
          const temporaryAuth = path.join(codexHome, 'auth.json');
          fs.copyFileSync(authSource, temporaryAuth);
          fs.chmodSync(temporaryAuth, 0o600);
          const result = runner(
            'codex',
            [
              'exec',
              '--ignore-user-config',
              '--ignore-rules',
              '--ephemeral',
              '--skip-git-repo-check',
              '--sandbox',
              'read-only',
              '--json',
              '-m',
              options.model,
              '-c',
              'model_reasoning_effort="medium"',
              '-c',
              `developer_instructions=${JSON.stringify(`${COMMON}\n${instructions}`)}`,
              '-C',
              home,
              task.prompt,
            ],
            {
              encoding: 'utf8',
              env: {
                PATH: environment['PATH'],
                HOME: home,
                CODEX_HOME: codexHome,
                NO_COLOR: '1',
                ...network,
              },
              timeout: 120_000,
              maxBuffer: 4 * 1024 * 1024,
            },
          );
          fs.writeFileSync(path.join(output, `${id}.events.jsonl`), result.stdout);
          fs.writeFileSync(path.join(output, `${id}.stderr.txt`), result.stderr);
          const events = parseEvents(result.stdout);
          const messages = events
            .filter(record)
            .filter((event) => event['type'] === 'item.completed')
            .map((event) => event['item'])
            .filter(record);
          const answer = messages
            .filter((item) => item['type'] === 'agent_message')
            .map((item) => String(item['text']))
            .join('\n');
          const completion = events
            .filter(record)
            .find((event) => event['type'] === 'turn.completed');
          const usedTools = messages.some(
            (item) => !['agent_message', 'reasoning'].includes(String(item['type'])),
          );
          const success =
            result.status === 0 && completion !== undefined && answer.length > 0 && !usedTools;
          const summary = {
            id,
            taskId: task.id,
            repetition,
            condition,
            success,
            usedTools,
            status: result.status,
            signal: result.signal,
            error: result.error?.message ?? null,
            elapsedMs: Math.round(performance.now() - started),
            promptHash: hash(task.prompt),
            answer,
            answerLength: Array.from(answer).length,
            usage: completion?.['usage'] ?? 'unavailable',
          };
          fs.writeFileSync(
            path.join(output, `${id}.json`),
            `${JSON.stringify(summary, null, 2)}\n`,
          );
          onProgress(`${id}: ${success ? 'recorded' : 'FAILED'}`);
          if (!success)
            throw new Error(`Evaluation stopped after failed attempt ${id}; evidence retained`);
        } catch (error) {
          primaryError = error;
          throw error;
        } finally {
          try {
            removeTemporaryHome(home);
          } catch (cleanupError) {
            if (primaryError === undefined) throw cleanupError;
            throw new AggregateError(
              [primaryError, cleanupError],
              `${errorMessage(primaryError)}; temporary-home cleanup also failed: ${errorMessage(cleanupError)}`,
              { cause: primaryError },
            );
          }
        }
      }
    }
  }
  fs.writeFileSync(
    path.join(output, 'complete.json'),
    `${JSON.stringify({ completedAt: now().toISOString(), attempts: 180 })}\n`,
  );
}

export function evaluateMain(argv: readonly string[] = process.argv.slice(2)): void {
  const [model, outputDirectory, ...extra] = argv;
  try {
    if (model === undefined || outputDirectory === undefined || extra.length > 0)
      throw new Error('usage: node scripts/evaluate.ts <exact-model-id> <new-output-directory>');
    runEvaluation({ model, outputDirectory });
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Evaluation failed'}\n`);
    process.exitCode = 1;
  }
}
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href)
  evaluateMain();
