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
import {
  assertDefined,
  assertRecord,
  assertString,
  assertUnknownArray,
  isRecord,
} from './helpers/assertions.ts';

const REPO_DIR = path.resolve(import.meta.dirname, '..');
const FEYNMAN_JS = path.join(REPO_DIR, 'bin', 'feynman.ts');
const TEST_MODEL = 'gpt-5.4-mini';

function makeTempHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-codex-app-'));
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  return home;
}

function rmrf(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
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
        setTimeout(() => {
          reject(new Error('probe timeout'));
        }, timeoutMs),
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

function runFeynman(
  tmpHome: string,
  args: string[],
): { status: number; stdout: string; stderr: string } {
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
    ].join('\n'),
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
  child: ChildProcessWithoutNullStreams | undefined;

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
    });

    this.child.stdout.on('data', (chunk: Buffer) => {
      this.onStdout(chunk);
    });
    this.child.stderr.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString();
    });
    this.child.on('exit', (code: number | null, signal: string | null) => {
      const error = new Error(
        `codex app-server exited: code=${String(code)} signal=${String(signal)}\n${this.stderr}`,
      );
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
      const message: unknown = JSON.parse(line);
      assertRecord(message, 'app-server message must be an object');
      const id = message['id'];
      if (typeof id === 'number' && this.pendingResponses.has(id)) {
        const waiter = this.pendingResponses.get(id);
        assertDefined(waiter);
        this.pendingResponses.delete(id);
        const error = message['error'];
        if (error !== undefined) {
          waiter.reject(new Error(JSON.stringify(error)));
        } else {
          waiter.resolve(message['result']);
        }
      }
      const method = message['method'];
      if (typeof method === 'string') {
        this.resolveNotificationWaiters({ method, params: message['params'] });
      }
    }
  }

  resolveNotificationWaiters(message: { method?: string; params?: unknown }): void {
    const remaining: NotificationWaiter[] = [];
    for (const waiter of this.notificationWaiters) {
      if (waiter.method === message.method && waiter.predicate(message.params)) {
        if (waiter.timeout !== null) clearTimeout(waiter.timeout);
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
      const child = this.child;
      assertDefined(child, 'client must be started before sending a request');
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  waitForNotification(
    method: string,
    predicate: (params: unknown) => boolean,
    timeoutMs = 5000,
  ): Promise<unknown> {
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
    if (this.child === undefined || this.child.killed) return;
    this.child.kill('SIGTERM');
  }
}

async function trustCodexHooks(
  client: CodexAppServerClient,
): Promise<{ command: string; trustStatus: string; eventName: string }> {
  const initial = await client.request('hooks/list', { cwd: REPO_DIR });
  const hooks = hookList(initial);
  assert.ok(hooks.length >= 1, 'expected at least one Feynman hook (SessionStart)');

  const trustState: Record<string, { trusted_hash: string }> = {};
  for (const hook of hooks) {
    assertString(hook.key);
    assertString(hook.currentHash);
    trustState[hook.key] = { trusted_hash: hook.currentHash };
  }

  await client.request('config/batchWrite', {
    edits: [
      {
        keyPath: 'hooks.state',
        value: trustState,
        mergeStrategy: 'upsert',
      },
    ],
    reloadUserConfig: true,
  });

  const verified = await client.request('hooks/list', { cwd: REPO_DIR });
  const trustedHooks = hookList(verified);
  const sessionHook = trustedHooks.find((hook) => hook.eventName === 'sessionStart');
  assert.ok(sessionHook, 'SessionStart hook should be listed');
  assertString(sessionHook.trustStatus);
  assertString(sessionHook.command);
  assert.equal(sessionHook.trustStatus, 'trusted');
  assertString(sessionHook.eventName);
  return {
    command: sessionHook.command,
    trustStatus: sessionHook.trustStatus,
    eventName: sessionHook.eventName,
  };
}

interface ListedHook {
  key: string | undefined;
  currentHash: string | undefined;
  command: string | undefined;
  trustStatus: string | undefined;
  eventName: string | undefined;
}

function property(record: Record<string, unknown>, key: string): unknown {
  return record[key];
}

function hookList(value: unknown): ListedHook[] {
  assertRecord(value);
  const data = value['data'];
  assertUnknownArray(data);
  return data.flatMap((entry) => {
    assertRecord(entry);
    const hooks = entry['hooks'];
    assertUnknownArray(hooks);
    return hooks.map((hook) => {
      assertRecord(hook);
      const key = property(hook, 'key');
      const currentHash = property(hook, 'currentHash');
      const command = property(hook, 'command');
      const trustStatus = property(hook, 'trustStatus');
      const eventName = property(hook, 'eventName');
      assert.ok(key === undefined || typeof key === 'string');
      assert.ok(currentHash === undefined || typeof currentHash === 'string');
      assert.ok(command === undefined || typeof command === 'string');
      assert.ok(trustStatus === undefined || typeof trustStatus === 'string');
      assert.ok(eventName === undefined || typeof eventName === 'string');
      return { key, currentHash, command, trustStatus, eventName };
    });
  });
}

describe('Codex app-server hook visibility contract', () => {
  it('installs the native marketplace plugin and discovers its skill without CLI bootstrap', async (t) => {
    if (!(await codexAppServerReachable())) {
      t.skip('codex app-server unavailable; native discovery is unverified');
      return;
    }
    const tmpHome = makeTempHome();
    const codexHome = path.join(tmpHome, '.codex');
    const client = new CodexAppServerClient(tmpHome);
    try {
      for (const args of [
        ['plugin', 'marketplace', 'add', REPO_DIR, '--json'],
        ['plugin', 'add', 'feynman@feynman', '--json'],
      ]) {
        const installed = spawnSync('codex', args, {
          cwd: tmpHome,
          encoding: 'utf8',
          env: { PATH: process.env['PATH'], HOME: tmpHome, CODEX_HOME: codexHome, NO_COLOR: '1' },
          timeout: 15_000,
        });
        assert.equal(installed.status, 0, installed.stderr);
      }
      client.start();
      await client.initialize();
      const result = await client.request('skills/list', { cwds: [tmpHome], forceReload: true });
      assertRecord(result);
      const entries = result['data'];
      assertUnknownArray(entries);
      const skills = entries.flatMap((entry) => {
        assertRecord(entry);
        assert.deepEqual(entry['errors'], []);
        const entrySkills = entry['skills'];
        assertUnknownArray(entrySkills);
        return entrySkills;
      });
      const skill = skills.find((entry) => {
        assertRecord(entry);
        return entry['pluginId'] === 'feynman@feynman';
      });
      assertDefined(skill, 'installed plugin must be discoverable');
      assertRecord(skill);
      assert.equal(skill['name'], 'feynman:feynman');
      assert.equal(skill['enabled'], true);
      const skillPath = skill['path'];
      assertString(skillPath);
      assert.ok(skillPath.startsWith(fs.realpathSync(codexHome) + path.sep));
      assert.equal(
        fs.readFileSync(skillPath, 'utf8'),
        fs.readFileSync(path.join(REPO_DIR, 'plugins/feynman/skills/feynman/SKILL.md'), 'utf8'),
      );
      assert.equal(
        fs.readFileSync(path.join(path.dirname(skillPath), 'references/settings.md'), 'utf8'),
        fs.readFileSync(
          path.join(REPO_DIR, 'plugins/feynman/skills/feynman/references/settings.md'),
          'utf8',
        ),
      );
      assert.equal(fs.existsSync(path.join(codexHome, '.feynman')), false);
      assert.equal(fs.existsSync(path.join(codexHome, 'hooks.json')), false);
    } finally {
      client.close();
      rmrf(tmpHome);
    }
  });

  it('exposes Feynman SessionStart output as hook context entries', async (t) => {
    if (!(await codexAppServerReachable())) {
      t.skip('codex app-server did not respond within probe timeout — server unavailable');
      return;
    }
    const tmpHome = makeTempHome();
    const codexHome = path.join(tmpHome, '.codex');
    const client = new CodexAppServerClient(tmpHome);
    try {
      const install = runFeynman(tmpHome, ['install', '--force']);
      assert.equal(install.status, 0, `install failed: ${install.stderr}`);
      writeCodexConfig(codexHome);

      client.start();
      await client.initialize();
      const sessionHook = await trustCodexHooks(client);
      assert.match(sessionHook.command, /feynman-session-start\.ts/);

      const hookCompleted = client.waitForNotification('hook/completed', (params) => {
        if (!isRecord(params)) return false;
        const run = property(params, 'run');
        return (
          typeof run === 'object' &&
          run !== null &&
          !Array.isArray(run) &&
          isRecord(run) &&
          property(run, 'eventName') === 'sessionStart'
        );
      });

      const started = await client.request('thread/start', {
        cwd: REPO_DIR,
        ephemeral: true,
        model: TEST_MODEL,
        approvalPolicy: 'never',
        sandbox: 'danger-full-access',
      });
      assertRecord(started);
      const thread = started['thread'];
      assertRecord(thread);
      const threadId = thread['id'];
      assertString(threadId);
      await client.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: 'feynman hook probe' }],
      });

      const completed = await hookCompleted;
      assertRecord(completed);
      const run = completed['run'];
      assertRecord(run);
      assert.equal(run['status'], 'completed');
      assert.equal(run['handlerType'], 'command');
      const runEntries = run['entries'];
      assertUnknownArray(runEntries);
      assert.ok(
        runEntries.some((entry) => {
          assertRecord(entry);
          const text = entry['text'];
          return (
            entry['kind'] === 'context' &&
            typeof text === 'string' &&
            /<triggers>|<contract>|→|├──/.test(text)
          );
        }),
        'Codex should expose Feynman rule-file diagram tokens in SessionStart hook/completed entries',
      );
    } finally {
      client.close();
      rmrf(tmpHome);
    }
  });
});
