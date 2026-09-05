import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { describe, it } from 'node:test';
import { captureHook, decodeHookCommand } from '../scripts/capture-evaluation-hook.ts';
import { assertRecord, assertString } from './helpers/assertions.ts';

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;
const encoded = (code: string): string =>
  Buffer.from(`${quote(process.execPath)} -e ${quote(code)}`).toString('base64url');

function collector(): { readonly stream: Writable; readonly text: () => string } {
  const chunks: Buffer[] = [];
  return {
    stream: new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        callback();
      },
    }),
    text: () => Buffer.concat(chunks).toString('utf8'),
  };
}

describe('actual hook output capture', () => {
  it('runs the CLI through a symlinked directory and reports invalid invocation', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-capture-entry-'));
    try {
      const alias = path.join(home, 'alias');
      fs.symlinkSync(path.resolve('scripts'), alias, 'junction');
      const script = path.join(alias, 'capture-evaluation-hook.ts');
      const capturePath = path.join(home, 'capture.json');
      const result = spawnSync(
        process.execPath,
        [script, encoded('process.stdin.resume(); process.stdout.write("observed");')],
        {
          encoding: 'utf8',
          input: '',
          env: { ...process.env, FEYNMAN_EVAL_CAPTURE: capturePath },
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, 'observed');
      const capture: unknown = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
      assertRecord(capture);
      assert.equal(capture['exitCode'], 0);
      const invalid = spawnSync(process.execPath, [script], { encoding: 'utf8', input: '' });
      assert.equal(invalid.status, 1);
      assert.match(invalid.stderr, /Expected encoded hook command/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('relays input and both output streams exactly before confirming emission', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-capture-test-'));
    const stdout = collector();
    const stderr = collector();
    try {
      const capturePath = path.join(home, 'capture.json');
      const command = encoded(
        'process.stdin.on("data", data => process.stdout.write(data)); process.stdin.on("end", () => process.stderr.write("diagnostic\\n"));',
      );
      const status = await captureHook({
        encodedCommand: command,
        capturePath,
        input: Readable.from(['Привет 東京\n']),
        stdout: stdout.stream,
        stderr: stderr.stream,
      });
      assert.equal(status, 0);
      assert.equal(stdout.text(), 'Привет 東京\n');
      assert.equal(stderr.text(), 'diagnostic\n');
      const result: unknown = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
      assertRecord(result);
      assert.equal(result['stdout'], stdout.text());
      assert.equal(result['stderr'], stderr.text());
      assert.equal(result['originalCommand'], decodeHookCommand(command));
      assert.equal(result['exitCode'], 0);
      assert.equal(result['signal'], null);
      assert.equal(result['relayError'], null);
      assert.equal(result['stdoutHash'], createHash('sha256').update(stdout.text()).digest('hex'));
      assert.equal(fs.statSync(capturePath).mode & 0o777, 0o600);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('retains a failed hook and does not turn partial output into success', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-capture-failure-'));
    try {
      const capturePath = path.join(home, 'capture.json');
      const status = await captureHook({
        encodedCommand: encoded(
          'process.stdin.resume(); process.stdout.write("partial"); process.exitCode=7;',
        ),
        capturePath,
        input: Readable.from([]),
        stdout: collector().stream,
        stderr: collector().stream,
      });
      assert.equal(status, 7);
      const result: unknown = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
      assertRecord(result);
      assert.equal(result['stdout'], 'partial');
      assert.equal(result['exitCode'], 7);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('refuses an existing capture before executing the command', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-capture-owned-'));
    try {
      const capturePath = path.join(home, 'capture.json');
      const marker = path.join(home, 'must-not-exist');
      fs.writeFileSync(capturePath, 'keep');
      await assert.rejects(
        captureHook({
          encodedCommand: encoded(
            `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'bad')`,
          ),
          capturePath,
          input: Readable.from([]),
          stdout: collector().stream,
          stderr: collector().stream,
        }),
        /EEXIST/,
      );
      assert.equal(fs.readFileSync(capturePath, 'utf8'), 'keep');
      assert.equal(fs.existsSync(marker), false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('does not confirm output whose relay failed', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-capture-relay-'));
    const broken = new Writable({
      write(_chunk, _encoding, callback) {
        callback(new Error('sink unavailable'));
      },
    });
    try {
      const capturePath = path.join(home, 'capture.json');
      const status = await captureHook({
        encodedCommand: encoded('process.stdin.resume(); process.stdout.write("evidence");'),
        capturePath,
        input: Readable.from([]),
        stdout: broken,
        stderr: collector().stream,
      });
      assert.equal(status, 1);
      const result: unknown = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
      assertRecord(result);
      assertString(result['relayError']);
      assert.match(result['relayError'], /sink unavailable/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it('rejects malformed command encodings', () => {
    for (const value of ['', '!', 'a', Buffer.from('\0').toString('base64url')]) {
      assert.throws(() => decodeHookCommand(value), /Invalid encoded/);
    }
  });
});
