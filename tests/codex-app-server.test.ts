// tests/codex-app-server.test.ts - Codex app-server contract test for hook output.
// This test uses an isolated CODEX_HOME and stops as soon as the hook event is
// observed, so it does not depend on a successful model request.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_DIR = path.resolve(import.meta.dirname, '..');
const FEYNMAN_JS = path.join(REPO_DIR, 'bin', 'feynman.ts');
const TEST_MODEL = 'gpt-5.4-mini';

function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-codex-app-'));
}

function rmrf(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function codexAppServerAvailable(): boolean {
  const result = spawnSync('codex', ['app-server', '--help'], {
    cwd: REPO_DIR,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return result.status === 0;
}

/**
 * Probe whether a codex app-server process can actually start and respond to
 * an `initialize` RPC within `timeoutMs`.  Returns true only when a live
 * server is reachable — binary presence alone is not sufficient.
 */
async function codexAppServerReachable(timeoutMs = 800): Promise<boolean> {
  if (!codexAppServerAvailable()) return false;
  const tmpHome = makeTempHome();
  const client = new CodexAppServerClient(tmpHome);
  try {
    client.start();
    await Promise.race([
      client.initialize(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('probe timeout')), timeoutMs)
      ),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    client.close();
    rmrf(tmpHome);
  }
}

function runFeynman(tmpHome: string, args: string[]): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [FEYNMAN_JS, ...args], {
    cwd: REPO_DIR,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: tmpHome,
      NO_COLOR: '1',
    },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function writeCodexConfig(codexHome: string): void {
  fs.writeFileSync(
    path.join(codexHome, 'config.toml'),
    [
      'approval_policy = "never"',
      'sandbox_mode = "danger-full-access"',
      `model = "${TEST_MODEL}"`,
      'openai_base_url = "http://127.0.0.1:9"',
      'experimental_realtime_ws_base_url = "ws://127.0.0.1:9"',
      '[features]',
      'hooks = true',
      '',
    ].join('\n')
  );
}

interface PendingWaiter {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

interface NotificationWaiter {
  method: string;
  predicate: (params: unknown) => boolean;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timeout: ReturnType<typeof setTimeout> | null;
}

class CodexAppServerClient {
  tmpHome: string;
  codexHome: string;
  nextId: number;
  buffer: string;
  pendingResponses: Map<number, PendingWaiter>;
  notificationWaiters: NotificationWaiter[];
  stderr: string;
  child!: ChildProcessWithoutNullStreams;

  constructor(tmpHome: string) {
    this.tmpHome = tmpHome;
    this.codexHome = path.join(tmpHome, '.codex');
    this.nextId = 1;
    this.buffer = '';
    this.pendingResponses = new Map();
    this.notificationWaiters = [];
    this.stderr = '';
  }

  start(): void {
    this.child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
      cwd: REPO_DIR,
      env: {
        ...process.env,
        HOME: this.tmpHome,
        CODEX_HOME: this.codexHome,
        NO_COLOR: '1',
        OPENAI_API_KEY: 'feynman-test-key',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams;

    this.child.stdout.on('data', (chunk: Buffer) => this.onStdout(chunk));
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString();
    });
    this.child.on('exit', (code: number | null, signal: string | null) => {
      const error = new Error(`codex app-server exited: code=${code} signal=${signal}\n${this.stderr}`);
      for (const waiter of this.pendingResponses.values()) {
        waiter.reject(error);
      }
      this.pendingResponses.clear();
      for (const waiter of this.notificationWaiters) {
        waiter.reject(error);
      }
      this.notificationWaiters = [];
    });
  }

  onStdout(chunk: Buffer): void {
    this.buffer += chunk.toString();
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line) as { id?: number; error?: unknown; result?: unknown; method?: string; params?: unknown };
      if (message.id && this.pendingResponses.has(message.id)) {
        const waiter = this.pendingResponses.get(message.id)!;
        this.pendingResponses.delete(message.id);
        if (message.error) {
          waiter.reject(new Error(JSON.stringify(message.error)));
        } else {
          waiter.resolve(message.result);
        }
      }
      if (message.method) {
        this.resolveNotificationWaiters(message);
      }
    }
  }

  resolveNotificationWaiters(message: { method?: string; params?: unknown }): void {
    const remaining: NotificationWaiter[] = [];
    for (const waiter of this.notificationWaiters) {
      if (waiter.method === message.method && waiter.predicate(message.params)) {
        if (waiter.timeout) clearTimeout(waiter.timeout);
        waiter.resolve(message.params);
      } else {
        remaining.push(waiter);
      }
    }
    this.notificationWaiters = remaining;
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(id);
        reject(new Error(`timed out waiting for ${method}; stderr:\n${this.stderr}`));
      }, 5000);
      this.pendingResponses.set(id, {
        resolve: (value: unknown) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  waitForNotification(method: string, predicate: (params: unknown) => boolean, timeoutMs = 5000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const waiter: NotificationWaiter = {
        method,
        predicate,
        resolve,
        reject,
        timeout: null,
      };
      waiter.timeout = setTimeout(() => {
        this.notificationWaiters = this.notificationWaiters.filter((item) => item !== waiter);
        reject(new Error(`timed out waiting for ${method}; stderr:\n${this.stderr}`));
      }, timeoutMs);
      this.notificationWaiters.push(waiter);
    });
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      clientInfo: { name: 'feynman-test', version: '0.0.0' },
      capabilities: { experimentalApi: true },
    });
  }

  close(): void {
    if (!this.child || this.child.killed) return;
    this.child.kill('SIGTERM');
  }
}

async function trustCodexHooks(client: CodexAppServerClient): Promise<{ command: string; trustStatus: string; eventName: string }> {
  const initial = await client.request('hooks/list', { cwd: REPO_DIR }) as { data: { hooks: { key: string; currentHash: string }[] }[] };
  const hooks = initial.data.flatMap((entry) => entry.hooks);
  assert.ok(hooks.length >= 1, 'expected at least one Feynman hook (SessionStart)');

  const trustState: Record<string, { trusted_hash: string }> = {};
  for (const hook of hooks) {
    trustState[hook.key] = { trusted_hash: hook.currentHash };
  }

  await client.request('config/batchWrite', {
    edits: [{
      keyPath: 'hooks.state',
      value: trustState,
      mergeStrategy: 'upsert',
    }],
    reloadUserConfig: true,
  });

  const verified = await client.request('hooks/list', { cwd: REPO_DIR }) as { data: { hooks: { command: string; trustStatus: string; eventName: string }[] }[] };
  const trustedHooks = verified.data.flatMap((entry) => entry.hooks);
  const sessionHook = trustedHooks.find((hook) => hook.eventName === 'sessionStart');
  assert.ok(sessionHook, 'SessionStart hook should be listed');
  assert.equal(sessionHook.trustStatus, 'trusted');
  return sessionHook;
}

describe('Codex app-server hook visibility contract', () => {
  it(
    'exposes Feynman SessionStart output as hook context entries',
    async (t) => {
      if (!(await codexAppServerReachable())) {
        t.skip('codex app-server did not respond within probe timeout — server unavailable');
        return;
      }
      const tmpHome = makeTempHome();
      const codexHome = path.join(tmpHome, '.codex');
      const client = new CodexAppServerClient(tmpHome);
      try {
        const install = runFeynman(tmpHome, ['install', '--target', 'codex', '--force']);
        assert.equal(install.status, 0, `install failed: ${install.stderr}`);
        writeCodexConfig(codexHome);

        client.start();
        await client.initialize();
        const sessionHook = await trustCodexHooks(client);
        assert.match(sessionHook.command, /feynman-session-start\.ts/);

        const hookCompleted = client.waitForNotification(
          'hook/completed',
          (params) => (params as { run?: { eventName: string } }).run?.eventName === 'sessionStart'
        );

        await client.request('thread/start', {
          cwd: REPO_DIR,
          ephemeral: true,
          model: TEST_MODEL,
          approvalPolicy: 'never',
          sandbox: 'danger-full-access',
        });

        const completed = await hookCompleted as {
          run: {
            status: string;
            handlerType: string;
            entries: { kind: string; text: string }[];
          }
        };
        assert.equal(completed.run.status, 'completed');
        assert.equal(completed.run.handlerType, 'command');
        assert.ok(
          completed.run.entries.some((entry) =>
            entry.kind === 'context' && /<triggers>|<contract>|→|├──/.test(entry.text)
          ),
          'Codex should expose Feynman rule-file diagram tokens in SessionStart hook/completed entries'
        );
      } finally {
        client.close();
        rmrf(tmpHome);
      }
    }
  );
});
