import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TestFixture {
  readonly base: string;
  readonly root: string;
  readonly output: string;
  readonly temporaryRoot: string;
  readonly authSource: string;
  readonly dispose: () => void;
}

export function write(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asciiTasks(): Readonly<{ version: 1; tasks: readonly Record<string, unknown>[] }> {
  return {
    version: 1,
    tasks: Array.from({ length: 14 }, (_, index) => {
      const id = `A${String(index + 1).padStart(2, '0')}`;
      return {
        id,
        prompt: `Transform ${id}.`,
        source:
          id === 'A02'
            ? 'Source branches to Build and Scan; both join at shared Release.'
            : `Public source ${id}.`,
        maxColumns: id === 'A13' ? 60 : 80,
        facts: [{ id: 'F1', text: `SECRET_FACT_${id}` }],
        questions: [{ question: `SECRET_QUESTION_${id}`, answer: `SECRET_ANSWER_${id}` }],
      };
    }),
  };
}

function originalTasks(): Readonly<{ evals: readonly Record<string, unknown>[] }> {
  return {
    evals: Array.from({ length: 20 }, (_, index) => {
      const id = index + 1;
      return {
        id,
        category: id >= 13 ? 'should-not-trigger' : 'should-trigger',
        prompt: `Original prompt ${id}`,
        answer_key: `ORIGINAL_SECRET_${id}`,
      };
    }),
  };
}

export function fixture(): TestFixture {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-ascii-runner-test-'));
  const root = path.join(base, 'repo');
  const output = path.join(base, 'output');
  const temporaryRoot = path.join(base, 'temporary');
  const authSource = path.join(base, 'auth.json');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  write(path.join(root, 'evals', 'ascii-transformation.json'), `${JSON.stringify(asciiTasks())}\n`);
  write(path.join(root, 'evals', 'evals.json'), `${JSON.stringify(originalTasks())}\n`);
  write(path.join(root, 'evals', 'ascii-transformation-protocol.md'), 'frozen protocol\n');
  write(path.join(root, '.agents', 'plugins', 'marketplace.json'), '{"name":"fixture"}\n');
  write(
    path.join(root, 'plugins', 'feynman', '.codex-plugin', 'plugin.json'),
    '{"name":"feynman","version":"2.0.0","skills":"./skills/"}\n',
  );
  write(path.join(root, 'plugins', 'feynman', 'skills', 'feynman', 'SKILL.md'), 'fixture skill\n');
  write(
    path.join(root, 'plugins', 'feynman', 'skills', 'feynman', 'references', 'settings.md'),
    'fixture settings\n',
  );
  write(
    path.join(root, 'rules', 'feynman-contract.md'),
    [
      '<intensity name="lite">fixture lite rules</intensity>',
      '<intensity name="full">fixture full rules</intensity>',
      '<intensity name="ultra">fixture ultra rules</intensity>',
      '',
    ].join('\n'),
  );
  write(path.join(root, 'scripts', 'capture-evaluation-hook.ts'), 'fixture capture adapter\n');
  write(path.join(root, 'dist', 'TARBALL.txt'), 'dist/feynman-fixture.tgz\n');
  write(path.join(root, 'dist', 'feynman-fixture.tgz'), 'synthetic tarball bytes\n');
  write(authSource, '{"synthetic":true}\n');
  fs.chmodSync(authSource, 0o600);
  return {
    base,
    root,
    output,
    temporaryRoot,
    authSource,
    dispose: () => {
      fs.rmSync(base, { recursive: true, force: true });
    },
  };
}
