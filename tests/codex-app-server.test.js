// tests/codex-app-server.test.js - Codex app-server contract test for hook output.
// This test uses an isolated CODEX_HOME and stops as soon as the hook event is
// observed, so it does not depend on a successful model request.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_DIR = path.resolve(__dirname, '..');
const FEYNMAN_JS = path.join(REPO_DIR, 'bin', 'feynman.js');
const TEST_MODEL = 'gpt-5.4-mini';

function makeTempHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-codex-app-'));
}

function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function codexAppServerAvailable() {
  const result = spawnSync('codex', ['app-server', '--help'], {
    cwd: REPO_DIR,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return result.status === 0;
}

function runFeynman(tmpHome, args) {
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

function writeCodexConfig(codexHome) {
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

class CodexAppServerClient {
  constructor(tmpHome) {
    this.tmpHome = tmpHome;
    this.codexHome = path.join(tmpHome, '.codex');
    this.nextId = 1;
    this.buffer = '';
    this.pendingResponses = new Map();
    this.notificationWaiters = [];
    this.stderr = '';
  }

  start() {
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

    this.child.stdout.on('data', (chunk) => this.onStdout(chunk));
    this.child.stderr.on('data', (chunk) => {
      this.stderr += chunk.toString();
    });
    this.child.on('exit', (code, signal) => {
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

  onStdout(chunk) {
    this.buffer += chunk.toString();
    let newlineIndex;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      if (message.id && this.pendingResponses.has(message.id)) {
        const waiter = this.pendingResponses.get(message.id);
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

  resolveNotificationWaiters(message) {
    const remaining = [];
    for (const waiter of this.notificationWaiters) {
      if (waiter.method === message.method && waiter.predicate(message.params)) {
        clearTimeout(waiter.timeout);
        waiter.resolve(message.params);
      } else {
        remaining.push(waiter);
      }
    }
    this.notificationWaiters = remaining;
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingResponses.delete(id);
        reject(new Error(`timed out waiting for ${method}; stderr:\n${this.stderr}`));
      }, 5000);
      this.pendingResponses.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  }

  waitForNotification(method, predicate, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const waiter = {
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

  async initialize() {
    await this.request('initialize', {
      clientInfo: { name: 'feynman-test', version: '0.0.0' },
      capabilities: { experimentalApi: true },
    });
  }

  close() {
    if (!this.child || this.child.killed) return;
    this.child.kill('SIGTERM');
  }
}

async function trustCodexHooks(client) {
  const initial = await client.request('hooks/list', { cwd: REPO_DIR });
  const hooks = initial.data.flatMap((entry) => entry.hooks);
  assert.ok(hooks.length >= 2, 'expected Feynman SessionStart and UserPromptSubmit hooks');

  const trustState = {};
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

  const verified = await client.request('hooks/list', { cwd: REPO_DIR });
  const trustedHooks = verified.data.flatMap((entry) => entry.hooks);
  const promptHook = trustedHooks.find((hook) => hook.eventName === 'userPromptSubmit');
  assert.ok(promptHook, 'UserPromptSubmit hook should be listed');
  assert.equal(promptHook.trustStatus, 'trusted');
  return promptHook;
}

describe('Codex app-server hook visibility contract', () => {
  it(
    'exposes Feynman UserPromptSubmit output as hook context entries',
    { skip: !codexAppServerAvailable() && 'codex app-server is not available' },
    async () => {
      const tmpHome = makeTempHome();
      const codexHome = path.join(tmpHome, '.codex');
      const client = new CodexAppServerClient(tmpHome);
      try {
        const install = runFeynman(tmpHome, ['install', '--target', 'codex', '--force']);
        assert.equal(install.status, 0, `install failed: ${install.stderr}`);
        writeCodexConfig(codexHome);

        client.start();
        await client.initialize();
        const promptHook = await trustCodexHooks(client);
        assert.match(promptHook.command, /feynman-activate\.js/);

        const thread = await client.request('thread/start', {
          cwd: REPO_DIR,
          ephemeral: true,
          model: TEST_MODEL,
          approvalPolicy: 'never',
          sandbox: 'danger-full-access',
        });

        const hookCompleted = client.waitForNotification(
          'hook/completed',
          (params) => params.run?.eventName === 'userPromptSubmit'
        );

        await client.request('turn/start', {
          threadId: thread.thread.id,
          input: [{ type: 'text', text: 'Explain deploy pipeline stages.' }],
          model: TEST_MODEL,
          approvalPolicy: 'never',
        });

        const completed = await hookCompleted;
        assert.equal(completed.run.status, 'completed');
        assert.equal(completed.run.handlerType, 'command');
        assert.ok(
          completed.run.entries.some((entry) =>
            entry.kind === 'context' && /<triggers>|<contract>|→|├──/.test(entry.text)
          ),
          'Codex should expose Feynman rule-file diagram tokens in hook/completed entries'
        );
      } finally {
        client.close();
        rmrf(tmpHome);
      }
    }
  );
});
