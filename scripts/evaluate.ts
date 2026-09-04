#!/usr/bin/env node
// Explicit live evaluation, never part of CI. Credentials stay in temporary homes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readRulesForIntensity } from '../lib/state/rules.ts';

const root = path.resolve(import.meta.dirname, '..');
const hash = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
const common = 'Answer the user using only the supplied facts. Do not call tools.';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function git(args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Cannot identify source revision');
  return result.stdout.trim();
}

function main(): void {
  const [model, outputDirectory, ...extra] = process.argv.slice(2);
  if (!model || !outputDirectory || extra.length > 0) {
    throw new Error('usage: node scripts/evaluate.ts <exact-model-id> <new-output-directory>');
  }
  const output = path.resolve(outputDirectory);
  fs.mkdirSync(output); // Refuse to overwrite or mix an earlier experiment.
  const tasksText = fs.readFileSync(path.join(root, 'evals/evals.json'), 'utf8');
  const parsed: unknown = JSON.parse(tasksText);
  if (!record(parsed) || !Array.isArray(parsed['evals']) || parsed['evals'].length !== 20) {
    throw new Error('Expected the frozen 20-task evaluation set');
  }
  const tasks = parsed['evals'].map((task: unknown) => {
    if (!record(task) || typeof task['id'] !== 'number' || typeof task['prompt'] !== 'string') {
      throw new Error('Invalid evaluation task');
    }
    return { id: task['id'], prompt: task['prompt'] };
  });
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    throw new Error('Duplicate evaluation task IDs');
  }
  const skill = fs.readFileSync(path.join(root, 'plugins/feynman/skills/feynman/SKILL.md'), 'utf8');
  const hook = readRulesForIntensity(
    fs.readFileSync(path.join(root, 'rules/feynman-contract.md'), 'utf8'),
    'full',
  );
  if (!hook) throw new Error('Missing full-intensity Contract');
  const conditions = { baseline: '', skill, hook };
  const version = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  if (version.status !== 0) throw new Error('Codex CLI is unavailable');
  const manifest = {
    protocol: 1,
    model,
    reasoning: 'medium',
    sourceHead: git(['rev-parse', 'HEAD']),
    sourceDiffHash: hash(git(['diff', 'HEAD', '--binary'])),
    runnerHash: hash(fs.readFileSync(import.meta.filename)),
    tasksHash: hash(tasksText),
    codexVersion: version.stdout.trim(),
    startedAt: new Date().toISOString(),
    repetitions: 3,
    expectedAttempts: 180,
    delivery: 'Direct developer-instruction injection; does not establish skill discovery',
    instructions: Object.fromEntries(
      Object.entries(conditions).map(([name, instruction]) => [
        name,
        hash(common + '\n' + instruction),
      ]),
    ),
  };
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'tasks.json'), tasksText);
  fs.writeFileSync(
    path.join(output, 'instructions.json'),
    JSON.stringify(conditions, null, 2) + '\n',
  );
  const authSource = path.join(
    process.env['CODEX_HOME'] ?? path.join(os.homedir(), '.codex'),
    'auth.json',
  );
  const network = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      /^(HTTPS?_PROXY|ALL_PROXY|NO_PROXY|https?_proxy|all_proxy|no_proxy|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$/.test(
        name,
      ),
    ),
  );

  for (const task of tasks) {
    for (let repetition = 1; repetition <= 3; repetition++) {
      // Rotate condition order to avoid giving one condition every cold-cache run.
      const entries = Object.entries(conditions);
      const offset = (task.id + repetition) % entries.length;
      const ordered = [...entries.slice(offset), ...entries.slice(0, offset)];
      for (const [condition, instructions] of ordered) {
        const id = `${task.id}-${repetition}-${condition}`;
        const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-eval-'));
        const codexHome = path.join(home, '.codex');
        fs.mkdirSync(codexHome, { mode: 0o700 });
        const started = performance.now();
        try {
          fs.copyFileSync(authSource, path.join(codexHome, 'auth.json'));
          fs.chmodSync(path.join(codexHome, 'auth.json'), 0o600);
          const result = spawnSync(
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
              model,
              '-c',
              'model_reasoning_effort="medium"',
              '-c',
              `developer_instructions=${JSON.stringify(common + '\n' + instructions)}`,
              '-C',
              home,
              task.prompt,
            ],
            {
              encoding: 'utf8',
              env: {
                PATH: process.env['PATH'],
                HOME: home,
                CODEX_HOME: codexHome,
                NO_COLOR: '1',
                ...network,
              },
              timeout: 120_000,
              maxBuffer: 4 * 1024 * 1024,
            },
          );
          fs.writeFileSync(path.join(output, `${id}.events.jsonl`), result.stdout ?? '');
          fs.writeFileSync(path.join(output, `${id}.stderr.txt`), result.stderr ?? '');
          const events: unknown[] = (result.stdout ?? '')
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as unknown);
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
            JSON.stringify(summary, null, 2) + '\n',
          );
          console.log(`${id}: ${success ? 'recorded' : 'FAILED'}`);
          if (!success)
            throw new Error(`Evaluation stopped after failed attempt ${id}; evidence retained`);
        } finally {
          fs.rmSync(home, { recursive: true, force: true });
        }
      }
    }
  }
  fs.writeFileSync(
    path.join(output, 'complete.json'),
    JSON.stringify({ completedAt: new Date().toISOString(), attempts: 180 }) + '\n',
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode = 1;
}
