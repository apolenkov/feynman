import { it, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { main } from '../bin/feynman-lint.ts';

class ExitSignal extends Error {
  readonly code: number;

  constructor(code: number) {
    super(`exit ${code}`);
    this.code = code;
  }
}

it('preserves original --fix bytes when writing the staged file fails partially', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-lint-write-'));
  const target = path.join(root, 'diagram.md');
  const original =
    '# title\n\n```\n┌────────────┐\n│ a ... ok   │\n│ b ... wait │\n└────────────┘\n```\n';
  fs.writeFileSync(target, original);
  const errors: string[] = [];
  const writeMock = mock.method(fs, 'writeFileSync', (file: number | fs.PathLike) => {
    if (typeof file !== 'number') throw new Error('unexpected direct target write');
    fs.writeSync(file, Buffer.from('partial staged bytes'));
    throw new Error('ENOSPC simulated partial write');
  });
  const stderrMock = mock.method(process.stderr, 'write', (chunk: unknown) => {
    errors.push(String(chunk));
    return true;
  });
  const exitMock = mock.method(process, 'exit', (code?: number) => {
    throw new ExitSignal(code ?? 0);
  });
  try {
    assert.throws(
      () => {
        main(['--fix', target]);
      },
      (error: unknown) => error instanceof ExitSignal && error.code === 2,
    );
    assert.equal(fs.readFileSync(target, 'utf8'), original);
    assert.match(errors.join(''), /cannot write/);
    assert.match(errors.join(''), /ENOSPC simulated partial write/);
    assert.deepEqual(fs.readdirSync(root), ['diagram.md']);
  } finally {
    writeMock.mock.restore();
    stderrMock.mock.restore();
    exitMock.mock.restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
