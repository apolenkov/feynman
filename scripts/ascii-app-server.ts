import { StringDecoder } from 'node:string_decoder';
import { MAX_BUFFER_BYTES, errorMessage } from './ascii-evidence.ts';
import { isRecord } from './ascii-call-plan.ts';
import { spawn } from 'node:child_process';

export interface SkillDiscoveryResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly result: unknown;
  readonly error?: string;
}

export type SkillDiscoveryRunner = (
  environment: Readonly<NodeJS.ProcessEnv>,
  cwd: string,
) => Promise<SkillDiscoveryResult>;

export interface HookTrustResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly initial: unknown;
  readonly verified: unknown;
  readonly error?: string;
}

export type HookTrustRunner = (
  environment: Readonly<NodeJS.ProcessEnv>,
  cwd: string,
) => Promise<HookTrustResult>;

function appServerStdout(
  handleLine: (line: string) => void,
  settled: () => boolean,
  exceedsLimit: () => void,
) {
  const decoder = new StringDecoder('utf8');
  let stdout = '';
  let line = '';
  let bytes = 0;
  return {
    capture: (): string => stdout + decoder.end(),
    pushChunk: (chunk: Buffer): void => {
      let offset = 0;
      // Count up to each newline so a terminal reply excludes subsequent bytes in its chunk.
      while (offset < chunk.length && !settled()) {
        const newline = chunk.indexOf(0x0a, offset);
        const end = newline === -1 ? chunk.length : newline + 1;
        const capturedEnd = Math.min(end, offset + MAX_BUFFER_BYTES - bytes);
        const text = decoder.write(chunk.subarray(offset, capturedEnd));
        stdout += text;
        bytes += capturedEnd - offset;
        if (capturedEnd < end) {
          exceedsLimit();
          return;
        }
        offset = end;
        line += text;
        if (newline !== -1) {
          handleLine(line.slice(0, -1));
          line = '';
        }
      }
    },
  };
}

function handleDiscoveryLine(
  line: string,
  sendSkillsRequest: () => void,
  finish: (status: number, result: unknown, error?: string) => void,
): void {
  if (line.trim().length === 0) return;
  try {
    const message: unknown = JSON.parse(line);
    if (!isRecord(message)) return;
    if (message['id'] === 1) sendSkillsRequest();
    if (message['id'] === 2) finish(0, message['result'] ?? null);
  } catch (error) {
    finish(1, null, `Invalid app-server JSON: ${errorMessage(error)}`);
  }
}

export async function discoverInstalledSkills(
  environment: Readonly<NodeJS.ProcessEnv>,
  cwd: string,
): Promise<SkillDiscoveryResult> {
  const initialize = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      clientInfo: { name: 'feynman-ascii-evaluation', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    },
  });
  const skillsRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'skills/list',
    params: { cwds: [cwd], forceReload: true },
  });
  return await new Promise((resolve) => {
    const child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
      cwd,
      env: { ...environment },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    let settled = false;
    let skillsRequestSent = false;
    const finish = (status: number, result: unknown, error?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      resolve({
        status,
        stdout: stdout.capture(),
        stderr,
        result,
        ...(error === undefined ? {} : { error }),
      });
    };
    const sendSkillsRequest = (): void => {
      if (skillsRequestSent) return;
      skillsRequestSent = true;
      child.stdin.write(`${skillsRequest}\n`);
    };
    const timer = setTimeout(() => {
      finish(1, null, 'skills/list timed out');
    }, 10_000);
    const stdout = appServerStdout(
      (line) => {
        handleDiscoveryLine(line, sendSkillsRequest, finish);
      },
      () => settled,
      () => {
        finish(1, null, 'skills/list stdout exceeded the byte limit');
      },
    );
    child.stdout.on('data', stdout.pushChunk);
    child.stderr.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stderr) + chunk.length > MAX_BUFFER_BYTES) {
        finish(1, null, 'skills/list stderr exceeded the byte limit');
        return;
      }
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      finish(1, null, error.message);
    });
    child.on('exit', (code) => {
      if (!settled) finish(code ?? 1, null, 'app-server exited before skills/list completed');
    });
    child.stdin.write(`${initialize}\n`);
  });
}

interface ListedHook {
  readonly key: unknown;
  readonly currentHash: unknown;
  readonly command: unknown;
  readonly eventName: unknown;
  readonly trustStatus: unknown;
}

export function listedHooks(value: unknown): readonly ListedHook[] {
  if (!isRecord(value) || !Array.isArray(value['data'])) {
    throw new Error('hooks/list result is missing data');
  }
  return value['data'].flatMap((entry): readonly ListedHook[] => {
    if (!isRecord(entry) || !Array.isArray(entry['hooks'])) return [];
    return entry['hooks'].flatMap((hook): readonly ListedHook[] =>
      isRecord(hook)
        ? [
            {
              key: hook['key'],
              currentHash: hook['currentHash'],
              command: hook['command'],
              eventName: hook['eventName'],
              trustStatus: hook['trustStatus'],
            },
          ]
        : [],
    );
  });
}

function hookTrustState(value: unknown): Readonly<Record<string, { trusted_hash: string }>> {
  const hooks = listedHooks(value);
  if (!hooks.some((hook) => hook.eventName === 'sessionStart')) {
    throw new Error('hooks/list did not expose the installed SessionStart hook');
  }
  return Object.fromEntries(
    hooks.map((hook) => {
      if (typeof hook.key !== 'string' || typeof hook.currentHash !== 'string') {
        throw new Error('hooks/list returned a hook without its trust key or current hash');
      }
      return [hook.key, { trusted_hash: hook.currentHash }];
    }),
  );
}

function trustedSessionStartCount(value: unknown): number {
  return listedHooks(value).filter(
    (hook) => hook.eventName === 'sessionStart' && hook.trustStatus === 'trusted',
  ).length;
}

export async function trustInstalledHooks(
  environment: Readonly<NodeJS.ProcessEnv>,
  cwd: string,
): Promise<HookTrustResult> {
  return await new Promise((resolve) => {
    const child = spawn('codex', ['app-server', '--listen', 'stdio://'], {
      cwd,
      env: { ...environment },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stderr = '';
    let initial: unknown = null;
    let verified: unknown = null;
    let settled = false;
    const finish = (status: number, error?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      resolve({
        status,
        stdout: stdout.capture(),
        stderr,
        initial,
        verified,
        ...(error === undefined ? {} : { error }),
      });
    };
    const send = (id: number, method: string, params: unknown): void => {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    };
    const timer = setTimeout(() => {
      finish(1, 'hook trust timed out');
    }, 10_000);
    const handleTrustLine = (line: string): void => {
      if (line.trim().length === 0) return;
      try {
        const message: unknown = JSON.parse(line);
        if (!isRecord(message) || typeof message['id'] !== 'number') return;
        if (message['error'] !== undefined) {
          finish(1, `app-server RPC failed: ${JSON.stringify(message['error'])}`);
        } else if (message['id'] === 1) {
          send(2, 'hooks/list', { cwd });
        } else if (message['id'] === 2) {
          initial = message['result'] ?? null;
          send(3, 'config/batchWrite', {
            edits: [
              {
                keyPath: 'hooks.state',
                value: hookTrustState(initial),
                mergeStrategy: 'upsert',
              },
            ],
            reloadUserConfig: true,
          });
        } else if (message['id'] === 3) {
          send(4, 'hooks/list', { cwd });
        } else if (message['id'] === 4) {
          verified = message['result'] ?? null;
          if (trustedSessionStartCount(verified) < 1) {
            finish(1, 'SessionStart hook is still untrusted after config/batchWrite');
          } else {
            finish(0);
          }
        }
      } catch (error) {
        finish(1, `Invalid hook trust app-server response: ${errorMessage(error)}`);
      }
    };
    const stdout = appServerStdout(
      handleTrustLine,
      () => settled,
      () => {
        finish(1, 'hook trust stdout exceeded the byte limit');
      },
    );
    child.stdout.on('data', stdout.pushChunk);
    child.stderr.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stderr) + chunk.length > MAX_BUFFER_BYTES) {
        finish(1, 'hook trust stderr exceeded the byte limit');
        return;
      }
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      finish(1, error.message);
    });
    child.on('exit', (code) => {
      if (!settled) finish(code ?? 1, 'app-server exited before hook trust completed');
    });
    send(1, 'initialize', {
      clientInfo: { name: 'feynman-ascii-evaluation', version: '1.0.0' },
      capabilities: { experimentalApi: true },
    });
  });
}
