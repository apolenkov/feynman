import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  runEvaluation,
  type EvaluationCommandResult,
  type EvaluationCommandRunner,
} from '../../scripts/evaluate.ts';

interface EvaluationFixture {
  readonly root: string;
  readonly output: string;
  readonly temporaryRoot: string;
  readonly authSource: string;
  readonly dispose: () => void;
}

export function fixture(
  tasks: unknown = validTasks(),
  usefulnessTasks: unknown = validUsefulnessTasks(),
): EvaluationFixture {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-evaluate-test-'));
  const root = path.join(base, 'repo');
  const output = path.join(base, 'output');
  const temporaryRoot = path.join(base, 'temporary');
  const authSource = path.join(base, 'auth.json');
  fs.mkdirSync(path.join(root, 'evals'), { recursive: true });
  fs.mkdirSync(path.join(root, 'plugins/feynman/skills/feynman'), { recursive: true });
  fs.mkdirSync(path.join(root, 'rules'), { recursive: true });
  fs.mkdirSync(temporaryRoot);
  fs.writeFileSync(path.join(root, 'evals/evals.json'), `${JSON.stringify(tasks)}\n`);
  fs.writeFileSync(
    path.join(root, 'evals/usefulness.json'),
    `${JSON.stringify(usefulnessTasks)}\n`,
  );
  fs.writeFileSync(path.join(root, 'plugins/feynman/skills/feynman/SKILL.md'), 'skill');
  fs.writeFileSync(
    path.join(root, 'rules/feynman-contract.md'),
    '<intensity name="full">hook</intensity>',
  );
  fs.writeFileSync(authSource, '{"synthetic":true}\n', { mode: 0o600 });
  return {
    root,
    output,
    temporaryRoot,
    authSource,
    dispose: () => {
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}

export function validUsefulnessTasks(): Readonly<{ tasks: readonly Record<string, unknown>[] }> {
  return {
    tasks: Array.from({ length: 12 }, (_, index) => ({
      id: `N${String(index + 1).padStart(2, '0')}`,
      shapeCategory: 'test-shape',
      prompt: `new prompt ${index + 1}`,
      facts: [{ id: 'F1', text: `new fact ${index + 1}` }],
      requiredFactIds: ['F1'],
      comprehensionQuestion: `new question ${index + 1}`,
      answerKey: `SECRET answer ${index + 1}`,
    })),
  };
}

export function validTasks(): Readonly<{ evals: readonly { id: number; prompt: string }[] }> {
  return {
    evals: Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      prompt: `prompt ${index + 1}`,
    })),
  };
}

export const ok = (stdout = ''): EvaluationCommandResult => ({
  status: 0,
  signal: null,
  stdout,
  stderr: '',
});
export const events = (): string =>
  [
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'answer' } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }),
  ].join('\n');

export function runnerForExec(
  exec: () => EvaluationCommandResult,
  calls: string[][] = [],
): EvaluationCommandRunner {
  return (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git') return ok(args[0] === 'rev-parse' ? 'abc123\n' : '');
    if (args[0] === '--version') return ok('codex-test 1\n');
    return exec();
  };
}

export function run(
  fx: EvaluationFixture,
  runner: EvaluationCommandRunner,
  onProgress: (line: string) => void = () => undefined,
  removeTemporaryHome?: (home: string) => void,
): void {
  runEvaluation({
    model: 'exact-model',
    root: fx.root,
    outputDirectory: fx.output,
    temporaryRoot: fx.temporaryRoot,
    authSource: fx.authSource,
    runCommand: runner,
    now: () => new Date('2026-09-05T00:00:00.000Z'),
    environment: { PATH: '/synthetic' },
    onProgress,
    ...(removeTemporaryHome === undefined ? {} : { removeTemporaryHome }),
  });
}
