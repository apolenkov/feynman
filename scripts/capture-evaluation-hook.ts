#!/usr/bin/env node
// Evaluation-only observer: execute the installed hook and relay its real bytes.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 4 * 1024 * 1024;

interface RelayResult {
  readonly text: string;
  readonly error: string | null;
}

export interface HookCaptureOptions {
  readonly encodedCommand: string;
  readonly capturePath: string;
  readonly input: Readable;
  readonly stdout: Writable;
  readonly stderr: Writable;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function decodeHookCommand(encoded: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) throw new Error('Invalid encoded hook command');
  const command = Buffer.from(encoded, 'base64url').toString('utf8');
  if (Buffer.from(command).toString('base64url') !== encoded || command.includes('\0')) {
    throw new Error('Invalid encoded hook command');
  }
  return command;
}

async function readAndRelay(
  source: Readable,
  target: Writable,
  stop: () => void,
): Promise<RelayResult> {
  // Invocation-owned buffers are bounded and never alias caller-owned state.
  const chunks: Buffer[] = [];
  let size = 0;
  target.on('error', stop);
  try {
    const stream: AsyncIterable<unknown> = source;
    for await (const value of stream) {
      if (!Buffer.isBuffer(value)) throw new Error('Hook stream returned non-byte data');
      size += value.length;
      if (size > MAX_BYTES) throw new Error('Hook stream exceeded the capture limit');
      chunks.push(value);
      await new Promise<void>((resolve, reject) => {
        target.write(value, (error?: Error | null) => {
          if (error != null) reject(error);
          else resolve();
        });
      });
    }
    return { text: Buffer.concat(chunks).toString('utf8'), error: null };
  } catch (error) {
    stop();
    return { text: Buffer.concat(chunks).toString('utf8'), error: message(error) };
  } finally {
    target.off('error', stop);
  }
}

export async function captureHook(options: Readonly<HookCaptureOptions>): Promise<number> {
  const originalCommand = decodeHookCommand(options.encodedCommand);
  // Fail before executing anything if evidence cannot be created or already exists.
  const capture = fs.openSync(options.capturePath, 'wx', 0o600);
  try {
    const child = spawn(originalCommand, {
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10_000,
    });
    const stop = (): void => {
      child.kill('SIGTERM');
    };
    const closed = new Promise<{
      readonly exitCode: number | null;
      readonly signal: NodeJS.Signals | null;
      readonly error: string | null;
    }>((resolve) => {
      child.once('error', (error) => {
        resolve({ exitCode: null, signal: null, error: message(error) });
      });
      child.once('close', (exitCode, signal) => {
        resolve({ exitCode, signal, error: null });
      });
    });
    const input = pipeline(options.input, child.stdin).then(
      () => null,
      (error: unknown) => {
        stop();
        return message(error);
      },
    );
    const [exit, stdout, stderr, inputError] = await Promise.all([
      closed,
      readAndRelay(child.stdout, options.stdout, stop),
      readAndRelay(child.stderr, options.stderr, stop),
      input,
    ]);
    const relayError = exit.error ?? inputError ?? stdout.error ?? stderr.error;
    const result = {
      version: 1,
      originalCommand,
      exitCode: exit.exitCode,
      signal: exit.signal,
      stdout: stdout.text,
      stderr: stderr.text,
      stdoutHash: createHash('sha256').update(stdout.text).digest('hex'),
      relayError,
    };
    fs.writeFileSync(capture, `${JSON.stringify(result, null, 2)}\n`);
    return relayError === null && exit.signal === null ? (exit.exitCode ?? 1) : 1;
  } finally {
    fs.closeSync(capture);
  }
}

export async function hookCaptureMain(args: readonly string[]): Promise<void> {
  try {
    const [encodedCommand] = args;
    const capturePath = process.env['FEYNMAN_EVAL_CAPTURE'];
    if (
      args.length !== 1 ||
      encodedCommand === undefined ||
      capturePath === undefined ||
      capturePath.length === 0
    ) {
      throw new Error('Expected encoded hook command and FEYNMAN_EVAL_CAPTURE');
    }
    process.exitCode = await captureHook({
      encodedCommand,
      capturePath,
      input: process.stdin,
      stdout: process.stdout,
      stderr: process.stderr,
    });
  } catch (error) {
    console.error(`Hook capture failed: ${message(error)}`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href
) {
  await hookCaptureMain(process.argv.slice(2));
}
