import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { describe, it, type TestContext } from 'node:test';
import {
  discoverInstalledSkills,
  parseAsciiEvaluationArguments,
  trustInstalledHooks,
} from '../scripts/evaluate-ascii.ts';
import { fixture, isRecord } from './helpers/ascii-fixture.ts';
import { fakeTransport, run } from './helpers/ascii-transport.ts';

const DISCOVERY_SKILL = {
  name: 'feynman:feynman',
  enabled: true,
  path: '/fixture/🧪/SKILL.md',
};
const UNTRUSTED_HOOK = {
  key: 'SessionStart:🧪',
  currentHash: 'sha256:fake',
  command: 'fake command',
  eventName: 'sessionStart',
  trustStatus: 'untrusted',
};

function fakeCodexAppServer(mode: 'success' | 'malformed' = 'success'): {
  readonly home: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
  readonly dispose: () => void;
} {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'feynman-fake-app-server-'));
  const binary = path.join(home, 'codex');
  const source = `#!/usr/bin/env node
const readline = require('node:readline');
if (process.env.FAKE_CODEX_MODE === 'malformed') {
  process.stdout.write('{invalid json\\n');
} else {
  let trusted = false;
  readline.createInterface({ input: process.stdin }).on('line', (line) => {
    const request = JSON.parse(line);
    let result = {};
    if (request.method === 'skills/list') {
      result = { data: [{ skills: [${JSON.stringify(DISCOVERY_SKILL)}] }] };
    }
    if (request.method === 'hooks/list') {
      const hook = ${JSON.stringify(UNTRUSTED_HOOK)};
      if (trusted) hook.trustStatus = 'trusted';
      result = { data: [{ hooks: [hook] }] };
    }
    if (request.method === 'config/batchWrite') {
      const value = request.params.edits[0].value;
      trusted = value[${JSON.stringify(UNTRUSTED_HOOK.key)}]?.trusted_hash === 'sha256:fake';
    }
    process.stdout.write(JSON.stringify({ id: request.id, result }) + '\\n');
  });
}
`;
  fs.writeFileSync(binary, source, { mode: 0o700 });
  return {
    home,
    environment: {
      PATH: `${home}:${process.env['PATH'] ?? ''}`,
      FAKE_CODEX_MODE: mode,
    },
    dispose: () => {
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
}

async function readAppServerChunks<T>(
  t: TestContext,
  read: (environment: NodeJS.ProcessEnv, cwd: string) => Promise<T>,
  chunks: readonly Buffer[],
): Promise<T> {
  const child = Object.assign(new EventEmitter(), {
    stdin: { write: () => undefined },
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    kill: () => undefined,
  });
  const spawn = t.mock.method(childProcess, 'spawn', () => child);
  syncBuiltinESMExports();
  try {
    const result = read({}, process.cwd());
    for (const chunk of chunks) child.stdout.emit('data', chunk);
    child.emit('exit', 1);
    return await result;
  } finally {
    spawn.mock.restore();
    syncBuiltinESMExports();
  }
}

describe('ASCII evaluation app-server controls', () => {
  it('discovers skills through the initialized app-server protocol', async () => {
    const fake = fakeCodexAppServer();
    try {
      const result = await discoverInstalledSkills(fake.environment, fake.home);
      assert.equal(result.status, 0);
      assert.equal(result.error, undefined);
      assert.ok(isRecord(result.result));
      assert.match(result.stdout, /"id":1/);
      assert.match(result.stdout, /"id":2/);
    } finally {
      fake.dispose();
    }
  });

  it('writes hook trust hashes and verifies the trusted SessionStart command', async () => {
    const fake = fakeCodexAppServer();
    try {
      const result = await trustInstalledHooks(fake.environment, fake.home);
      assert.equal(result.status, 0);
      assert.equal(result.error, undefined);
      assert.ok(isRecord(result.initial));
      assert.ok(isRecord(result.verified));
      assert.match(result.stdout, /"id":4/);
    } finally {
      fake.dispose();
    }
  });

  it('fails closed on malformed app-server output', async () => {
    const fake = fakeCodexAppServer('malformed');
    try {
      const [discovery, trust] = await Promise.all([
        discoverInstalledSkills(fake.environment, fake.home),
        trustInstalledHooks(fake.environment, fake.home),
      ]);
      assert.equal(discovery.status, 1);
      assert.match(discovery.error ?? '', /Invalid app-server JSON/);
      assert.equal(trust.status, 1);
      assert.match(trust.error ?? '', /Invalid hook trust app-server response/);
    } finally {
      fake.dispose();
    }
  });

  const skills = { data: [{ skills: [DISCOVERY_SKILL] }] };
  const initialHooks = { data: [{ hooks: [UNTRUSTED_HOOK] }] };
  const trustedHooks = {
    data: [{ hooks: [{ ...UNTRUSTED_HOOK, trustStatus: 'trusted' }] }],
  };
  const notification = Buffer.from('{"method":"fixture/notification"}\n');
  const cap = 4 * 1024 * 1024;
  const reply = (id: number, result: unknown) => Buffer.from(`${JSON.stringify({ id, result })}\n`);
  const discoveryReplies = [reply(1, {}), reply(2, skills)];
  const trustReplies = [reply(1, {}), reply(2, initialHooks), reply(3, {}), reply(4, trustedHooks)];

  function transcript(replies: readonly Buffer[], bytes: number): Buffer {
    const all = Buffer.concat(replies);
    if (bytes === 0) return all;
    return Buffer.concat([
      all.subarray(0, -1),
      Buffer.alloc(bytes - all.length, ' '),
      Buffer.from('\n'),
    ]);
  }

  function delivered(stdout: Buffer, split: number, coalesced: boolean): Buffer[] {
    const chunks: Buffer[] = [];
    let tail = stdout;
    if (split > 0) {
      // Split every multibyte field, including both the initial and verified trust keys.
      for (let emoji = tail.indexOf('🧪'); emoji >= 0; emoji = tail.indexOf('🧪')) {
        chunks.push(tail.subarray(0, emoji + split));
        tail = tail.subarray(emoji + split);
      }
    }
    if (coalesced) chunks.push(Buffer.concat([tail, notification]));
    else chunks.push(tail, notification);
    return chunks;
  }

  for (const bytes of [0, cap, cap + 1]) {
    it(`captures the same app-server reply bytes across chunk boundaries (${bytes || 'ordinary'} bytes)`, async (t) => {
      const discoveryStdout = transcript(discoveryReplies, bytes);
      const trustStdout = transcript(trustReplies, bytes);
      for (const split of [0, 1, 2, 3]) {
        for (const coalesced of [false, true]) {
          const discovery = await readAppServerChunks(
            t,
            discoverInstalledSkills,
            delivered(discoveryStdout, split, coalesced),
          );
          const trust = await readAppServerChunks(
            t,
            trustInstalledHooks,
            delivered(trustStdout, split, coalesced),
          );
          if (bytes > cap) {
            assert.equal(discovery.status, 1);
            assert.equal(discovery.error, 'skills/list stdout exceeded the byte limit');
            assert.equal(trust.status, 1);
            assert.equal(trust.error, 'hook trust stdout exceeded the byte limit');
            assert.ok(discovery.stdout === discoveryStdout.subarray(0, cap).toString());
            assert.ok(trust.stdout === trustStdout.subarray(0, cap).toString());
          } else {
            assert.equal(discovery.status, 0, discovery.error ?? 'skills/list failed');
            assert.equal(trust.status, 0, trust.error ?? 'hook trust failed');
            assert.deepEqual(discovery.result, skills);
            assert.deepEqual(trust.initial, initialHooks);
            assert.deepEqual(trust.verified, trustedHooks);
            assert.ok(discovery.stdout === discoveryStdout.toString(), 'discovery stdout differs');
            assert.ok(trust.stdout === trustStdout.toString(), 'hook trust stdout differs');
          }
        }
      }
    });
  }
});

describe('ASCII evaluation runner', () => {
  it('parses the bounded plural transport-probe filters', () => {
    assert.deepEqual(
      parseAsciiEvaluationArguments([
        'gpt-5.6-luna',
        'eval/probe',
        '--development',
        '--tasks',
        'A01',
        '--arms',
        'native,hook',
      ]),
      {
        model: 'gpt-5.6-luna',
        outputDirectory: 'eval/probe',
        development: true,
        taskIds: ['A01'],
        arms: ['native', 'hook'],
      },
    );
  });

  it('freezes the verified tarball bytes before extraction', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx);
    const builtTarball = path.join(fx.root, 'dist', 'feynman-fixture.tgz');
    const builtBytes = fs.readFileSync(builtTarball);
    try {
      await run(fx, transport, { taskIds: ['A01'], arms: ['native'] });
      const frozenTarball = path.join(fx.output, 'candidate-package.tgz');
      assert.deepEqual(transport.extractedTarballs, [frozenTarball]);
      const fd = fs.openSync(frozenTarball, 'r');
      try {
        assert.deepEqual(fs.readFileSync(fd), builtBytes);
        assert.equal(fs.fstatSync(fd).mode & 0o777, 0o400);
        fs.writeFileSync(builtTarball, 'later build bytes\n');
        assert.equal(fs.fstatSync(fd).size, builtBytes.length);
        const frozenBytes = Buffer.alloc(builtBytes.length);
        assert.equal(fs.readSync(fd, frozenBytes, { position: 0 }), frozenBytes.length);
        assert.deepEqual(frozenBytes, builtBytes);
      } finally {
        fs.closeSync(fd);
      }
      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
      );
      assert.ok(isRecord(manifest));
      assert.equal(
        manifest['packageTarballHash'],
        createHash('sha256').update(builtBytes).digest('hex'),
      );
    } finally {
      fx.dispose();
    }
  });

  it('never sends evaluator gold and freezes explicit versus automatic native activation', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx);
    try {
      await run(fx, transport, { taskIds: ['A01', 'A11'], arms: ['native'] });
      assert.equal(transport.execCalls(), 2);
      const [explicitPrompt, automaticPrompt] = transport.execPrompts;
      assert.equal(
        explicitPrompt?.startsWith('Use $feynman for this request.\n\nTransform A01.'),
        true,
      );
      assert.equal(automaticPrompt?.includes('$feynman'), false);
      const generatorText = [
        ...transport.execPrompts,
        fs.readFileSync(path.join(fx.output, 'generation-inputs.json'), 'utf8'),
      ].join('\n');
      assert.doesNotMatch(generatorText, /SECRET_(?:FACT|QUESTION|ANSWER)/);
      assert.match(generatorText, /Maximum diagram width: 80 display columns\./);
      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
      );
      assert.ok(typeof manifest === 'object' && manifest !== null && !Array.isArray(manifest));
      assert.equal('acceptanceComplete' in manifest && manifest.acceptanceComplete, false);
      assert.deepEqual('nativeActivation' in manifest ? manifest.nativeActivation : null, {
        explicitMainTaskIds: Array.from(
          { length: 10 },
          (_, index) => `A${String(index + 1).padStart(2, '0')}`,
        ),
        automaticMainTaskIds: ['A11', 'A12', 'A13', 'A14'],
        suppression: 'explicit',
      });
    } finally {
      fx.dispose();
    }
  });

  it('executes the frozen 67-call plan once with rotated main and suppression arms', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx);
    try {
      await run(fx, transport, {
        development: false,
        taskIds: [],
        arms: [],
      });
      assert.equal(transport.execCalls(), 67);
      const inputs: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'generation-inputs.json'), 'utf8'),
      );
      assert.ok(Array.isArray(inputs));
      assert.equal(inputs.length, 67);
      assert.deepEqual(
        inputs
          .slice(0, 6)
          .map((entry) =>
            isRecord(entry) ? `${String(entry['taskId'])}-${String(entry['arm'])}` : '',
          ),
        ['A01-hook', 'A01-baseline', 'A01-native', 'A02-baseline', 'A02-native', 'A02-hook'],
      );
      assert.equal(
        inputs.filter((entry) => isRecord(entry) && entry['suite'] === 'settings-matrix').length,
        9,
      );
      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
      );
      assert.ok(isRecord(manifest));
      assert.equal(manifest['selectedModelCalls'], 67);
      assert.equal(manifest['generationComplete'], true);
      assert.equal(manifest['fullGenerationComplete'], true);
      assert.equal(manifest['acceptanceComplete'], false);
      assert.equal(manifest['eligibleForReview'], true);
      assert.deepEqual(manifest['acceptanceEvidence'], {
        externalBlindReview: 'missing',
        externalToolReview: 'missing',
      });
    } finally {
      fx.dispose();
    }
  });

  it('rejects a dirty source in final mode before build or model execution', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { dirty: true });
    try {
      await assert.rejects(
        run(fx, transport, { development: false, taskIds: [], arms: [] }),
        /requires a clean source revision/,
      );
      assert.equal(transport.execCalls(), 0);
      assert.equal(fs.existsSync(fx.output), false);
      assert.deepEqual(fs.readdirSync(fx.temporaryRoot), []);
    } finally {
      fx.dispose();
    }
  });

  it('retains native setup failure evidence and removes the isolated home', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { pluginFailure: true });
    try {
      await assert.rejects(
        run(fx, transport, { taskIds: ['A01'], arms: ['native'] }),
        /native-plugin-add failed/,
      );
      assert.equal(transport.execCalls(), 0);
      assert.match(
        fs.readFileSync(path.join(fx.output, 'native-plugin-add.stderr.txt'), 'utf8'),
        /synthetic plugin failure/,
      );
      assert.equal(fs.readdirSync(fx.temporaryRoot).length, 0);
      const finalText = fs.readFileSync(path.join(fx.output, 'filesystem-final.json'), 'utf8');
      assert.match(finalText, /"exists": false/);
    } finally {
      fx.dispose();
    }
  });

  it('preserves an auth setup failure when early home cleanup also fails', async (t) => {
    const fx = fixture();
    const transport = fakeTransport(fx);
    const copyFailure = new Error('PRIMARY_AUTH_COPY_FAILURE');
    const copyMock = t.mock.method(fs, 'copyFileSync', () => {
      throw copyFailure;
    });
    try {
      await assert.rejects(
        run(fx, transport, {
          taskIds: ['A01'],
          arms: ['baseline'],
          removeTemporaryHome: () => {
            throw new Error('SECONDARY_EARLY_CLEANUP_FAILURE');
          },
        }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /PRIMARY_AUTH_COPY_FAILURE/);
          assert.match(error.message, /SECONDARY_EARLY_CLEANUP_FAILURE/);
          assert.equal(error.cause, copyFailure);
          return true;
        },
      );
      assert.equal(transport.execCalls(), 0);
    } finally {
      copyMock.mock.restore();
      fx.dispose();
    }
  });

  it('attempts every earlier home cleanup and preserves all recursive creation errors', async (t) => {
    const fx = fixture();
    const transport = fakeTransport(fx);
    const originalCopyFileSync = fs.copyFileSync.bind(fs);
    const primaryFailure = new Error('PRIMARY_LATER_HOME_CREATION_FAILURE');
    const cleanupAttempts: string[] = [];
    const copyMock = t.mock.method(
      fs,
      'copyFileSync',
      (source: fs.PathLike, destination: fs.PathLike, mode?: number) => {
        if (String(destination).includes(`${path.sep}feynman-ascii-native-`)) {
          throw primaryFailure;
        }
        originalCopyFileSync(source, destination, mode);
      },
    );
    try {
      await assert.rejects(
        run(fx, transport, {
          taskIds: ['A01'],
          arms: ['baseline', 'native'],
          removeTemporaryHome: (home) => {
            cleanupAttempts.push(home);
            const arm = home.includes('native') ? 'NATIVE' : 'BASELINE';
            throw new Error(`SECONDARY_${arm}_CLEANUP_FAILURE`);
          },
        }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /PRIMARY_LATER_HOME_CREATION_FAILURE/);
          assert.match(error.message, /SECONDARY_NATIVE_CLEANUP_FAILURE/);
          assert.match(error.message, /SECONDARY_BASELINE_CLEANUP_FAILURE/);
          assert.ok(error.cause instanceof Error);
          assert.ok(error.cause.cause instanceof Error);
          assert.equal(error.cause.cause, primaryFailure);
          return true;
        },
      );
      assert.equal(transport.execCalls(), 0);
      assert.equal(cleanupAttempts.length, 2);
      assert.match(cleanupAttempts[0] ?? '', /feynman-ascii-native-/);
      assert.match(cleanupAttempts[1] ?? '', /feynman-ascii-baseline-/);
    } finally {
      copyMock.mock.restore();
      fx.dispose();
    }
  });

  it('rejects a failed native skill read as activation proof', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { failedSkillRead: true });
    try {
      await assert.rejects(
        run(fx, transport, { taskIds: ['A01'], arms: ['native'] }),
        /Model attempt A01-native failed/,
      );
      assert.equal(transport.execCalls(), 1);
      const result: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'A01-native.json'), 'utf8'),
      );
      assert.ok(isRecord(result));
      assert.equal(result['nativeSkillRead'], false);
      const executions = result['commandExecutions'];
      assert.ok(Array.isArray(executions));
      assert.equal(executions.length, 1);
      const execution: unknown = executions[0];
      assert.ok(isRecord(execution));
      assert.match(String(execution['command']), /SKILL\.md/);
      assert.equal(execution['aggregatedOutput'], '');
      assert.equal(execution['exitCode'], 1);
      assert.equal(execution['status'], 'failed');
      assert.equal(fs.readdirSync(fx.temporaryRoot).length, 0);
    } finally {
      fx.dispose();
    }
  });

  it('rejects a partial native skill read as activation proof', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { partialSkillRead: true });
    try {
      await assert.rejects(
        run(fx, transport, { taskIds: ['A01'], arms: ['native'] }),
        /Model attempt A01-native failed/,
      );
      const result: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'A01-native.json'), 'utf8'),
      );
      assert.ok(isRecord(result));
      assert.equal(result['nativeSkillRead'], false);
      assert.equal(result['success'], false);
      assert.equal(result['externalToolReview'], 'missing');
      assert.equal(result['noUnexpectedTools'], false);
    } finally {
      fx.dispose();
    }
  });

  it('completes generation after an exact native skill read plus a computation', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { computationCommand: true });
    try {
      await run(fx, transport, { taskIds: ['A13'], arms: ['native'] });
      const result: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'A13-native.json'), 'utf8'),
      );
      assert.ok(isRecord(result));
      assert.equal(result['nativeSkillRead'], true);
      assert.equal(result['success'], true);
      assert.equal(result['noUnexpectedTools'], false);
      assert.equal(result['externalToolReview'], 'missing');
      assert.equal(result['toolActivityEventsFile'], 'A13-native.events.jsonl');
      assert.deepEqual(result['toolActivityItemTypes'], ['command_execution', 'command_execution']);
      const executions = result['commandExecutions'];
      assert.ok(Array.isArray(executions));
      assert.equal(executions.length, 2);
      assert.ok(isRecord(executions[1]));
      assert.equal(executions[1]['command'], "python3 -c 'print(46)'");
      assert.equal(executions[1]['aggregatedOutput'], '46\n');
      assert.equal(executions[1]['status'], 'completed');
      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
      );
      assert.ok(isRecord(manifest));
      assert.equal(manifest['generationComplete'], true);
      assert.equal(manifest['acceptanceComplete'], false);
      assert.deepEqual(manifest['acceptanceEvidence'], {
        externalBlindReview: 'missing',
        externalToolReview: 'missing',
      });
    } finally {
      fx.dispose();
    }
  });

  it('keeps baseline and hook generations complete when extra commands await review', async () => {
    for (const arm of ['baseline', 'hook'] as const) {
      const fx = fixture();
      const transport = fakeTransport(fx, { computationCommand: true });
      try {
        await run(fx, transport, { taskIds: ['A03'], arms: [arm] });
        const result: unknown = JSON.parse(
          fs.readFileSync(path.join(fx.output, `A03-${arm}.json`), 'utf8'),
        );
        assert.ok(isRecord(result));
        assert.equal(result['success'], true);
        assert.equal(result['noUnexpectedTools'], false);
        assert.equal(result['externalToolReview'], 'missing');
        if (arm === 'hook') assert.equal(result['hookEmissionProven'], true);
        const manifest: unknown = JSON.parse(
          fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
        );
        assert.ok(isRecord(manifest));
        assert.equal(manifest['generationComplete'], true);
        assert.equal(manifest['acceptanceComplete'], false);
      } finally {
        fx.dispose();
      }
    }
  });

  it('retains mutation attempts and unknown tool activity as unapproved review evidence', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { mutationCommand: true, unknownToolItem: true });
    try {
      await run(fx, transport, { taskIds: ['A03'], arms: ['native'] });
      const result: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'A03-native.json'), 'utf8'),
      );
      assert.ok(isRecord(result));
      assert.equal(result['nativeSkillRead'], true);
      assert.equal(result['success'], true);
      assert.equal(result['noUnexpectedTools'], false);
      assert.equal(result['externalToolReview'], 'missing');
      assert.deepEqual(result['toolActivityItemTypes'], [
        'web_search',
        'command_execution',
        'command_execution',
      ]);
      const executions = result['commandExecutions'];
      assert.ok(Array.isArray(executions));
      assert.equal(executions.length, 2);
      assert.ok(isRecord(executions[1]));
      assert.equal(executions[1]['command'], 'npx @albinocrabs/feynman install');
      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
      );
      assert.ok(isRecord(manifest));
      assert.equal(manifest['generationComplete'], true);
      assert.equal(manifest['acceptanceComplete'], false);
      assert.equal(fs.existsSync(path.join(fx.output, 'completion.json')), true);
    } finally {
      fx.dispose();
    }
  });

  it('accepts a complete installed skill read through its cwd-relative path', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { relativeSkillRead: true });
    try {
      await run(fx, transport, { taskIds: ['A03'], arms: ['native'] });
      const result: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'A03-native.json'), 'utf8'),
      );
      assert.ok(isRecord(result));
      assert.equal(result['nativeSkillRead'], true);
      assert.equal(result['success'], true);
      assert.match(String(result['commands']), /^sed .* \.codex\/plugins\/cache\//u);
    } finally {
      fx.dispose();
    }
  });

  it('accepts the original absolute cwd spelling of the installed skill path', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { originalAbsoluteSkillRead: true });
    try {
      await run(fx, transport, { taskIds: ['A03'], arms: ['native'] });
      const result: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'A03-native.json'), 'utf8'),
      );
      assert.ok(isRecord(result));
      assert.equal(result['nativeSkillRead'], true);
      assert.equal(result['success'], true);
    } finally {
      fx.dispose();
    }
  });

  it('rejects an exact skill payload read from a different relative path', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { wrongRelativeSkillRead: true });
    try {
      await assert.rejects(
        run(fx, transport, { taskIds: ['A03'], arms: ['native'] }),
        /Model attempt A03-native failed/,
      );
      const result: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'A03-native.json'), 'utf8'),
      );
      assert.ok(isRecord(result));
      assert.equal(result['nativeSkillRead'], false);
      assert.equal(result['success'], false);
    } finally {
      fx.dispose();
    }
  });

  it('proves hook delivery while preserving preferences and always cleans its home', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx);
    try {
      await run(fx, transport, { taskIds: ['A01'], arms: ['hook'] });
      const result: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'A01-hook.json'), 'utf8'),
      );
      assert.ok(typeof result === 'object' && result !== null && !Array.isArray(result));
      assert.equal('hookDeliveryProven' in result && result.hookDeliveryProven, true);
      assert.equal('hookEmissionProven' in result && result.hookEmissionProven, true);
      assert.equal('hookPreferencesUnchanged' in result && result.hookPreferencesUnchanged, true);
      assert.equal(transport.trustCalls(), 1);
      assert.deepEqual(transport.callOrder, ['trust', 'exec']);
      assert.match(
        fs.readFileSync(path.join(fx.output, 'hook-trust-verification.json'), 'utf8'),
        /"allSessionStartHooksTrusted": true/,
      );
      const wrapper: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'hook-capture-wrapper.json'), 'utf8'),
      );
      assert.ok(isRecord(wrapper));
      const frozenAdapter = fs.readFileSync(path.join(fx.output, 'capture-evaluation-hook.ts'));
      assert.equal(
        wrapper['adapterHash'],
        createHash('sha256').update(frozenAdapter).digest('hex'),
      );
      assert.notEqual(wrapper['originalCommand'], wrapper['wrappedCommand']);
      assert.equal(fs.readdirSync(fx.temporaryRoot).length, 0);
      assert.doesNotMatch(
        fs.readFileSync(path.join(fx.output, 'filesystem-final.json'), 'utf8'),
        /"exists": true/,
      );
    } finally {
      fx.dispose();
    }
  });

  it('does not treat an advanced hook counter or runtime events as emission proof', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { hookCaptureFailure: true });
    try {
      await assert.rejects(
        run(fx, transport, { taskIds: ['A01'], arms: ['hook'] }),
        /Model attempt A01-hook failed/,
      );
      assert.equal(transport.execCalls(), 1);
      const result: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'A01-hook.json'), 'utf8'),
      );
      assert.ok(isRecord(result));
      assert.equal(result['hookInvocationCounterAdvanced'], true);
      assert.equal(result['hookInvocationProven'], true);
      assert.equal(result['hookEmissionProven'], false);
      assert.equal(result['hookDeliveryProven'], false);
      assert.equal(fs.readdirSync(fx.temporaryRoot).length, 0);
    } finally {
      fx.dispose();
    }
  });

  it('retains hook trust failure evidence and does not start a model call', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { hookTrustFailure: true });
    try {
      await assert.rejects(
        run(fx, transport, { taskIds: ['A01'], arms: ['hook'] }),
        /Hook trust failed: synthetic hook trust failure/,
      );
      assert.equal(transport.trustCalls(), 1);
      assert.equal(transport.execCalls(), 0);
      assert.match(
        fs.readFileSync(path.join(fx.output, 'hook-trust.stderr.txt'), 'utf8'),
        /synthetic hook trust failure/,
      );
      assert.match(
        fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
        /"attemptsRecorded": 0/,
      );
      assert.equal(fs.readdirSync(fx.temporaryRoot).length, 0);
    } finally {
      fx.dispose();
    }
  });

  it('cleans isolated homes when completion evidence cannot be written', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { completionWriteFailure: true });
    try {
      await assert.rejects(run(fx, transport), /completion\.json/);
      assert.equal(transport.execCalls(), 1);
      assert.equal(fs.readdirSync(fx.temporaryRoot).length, 0);
      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
      );
      assert.ok(isRecord(manifest));
      assert.equal(manifest['generationComplete'], true);
      assert.equal(manifest['acceptanceComplete'], false);
    } finally {
      fx.dispose();
    }
  });

  it('preserves prior attempt count when a later settings change fails', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { settingFailureAfterCalls: 58 });
    try {
      await assert.rejects(
        run(fx, transport, { development: false, taskIds: [], arms: [] }),
        /SET-lite-short-set-intensity failed/,
      );
      assert.equal(transport.execCalls(), 58);
      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
      );
      assert.ok(isRecord(manifest));
      assert.equal(manifest['attemptsRecorded'], 58);
      assert.equal(manifest['generationComplete'], false);
      assert.equal(manifest['acceptanceComplete'], false);
      assert.equal(fs.existsSync(path.join(fx.output, 'completion.json')), false);
      assert.equal(fs.readdirSync(fx.temporaryRoot).length, 0);
    } finally {
      fx.dispose();
    }
  });

  it('retains a failed model attempt and does not retry or mark it complete', async () => {
    const fx = fixture();
    const transport = fakeTransport(fx, { modelFailure: true });
    try {
      await assert.rejects(run(fx, transport), /failed; evidence retained/);
      assert.equal(transport.execCalls(), 1);
      assert.match(
        fs.readFileSync(path.join(fx.output, 'A01-baseline.stderr.txt'), 'utf8'),
        /synthetic model failure/,
      );
      const manifestText = fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8');
      assert.match(manifestText, /"attemptsRecorded": 1/);
      assert.match(manifestText, /"stoppedAfterFailure": true/);
      assert.match(manifestText, /"acceptanceComplete": false/);
      assert.equal(fs.existsSync(path.join(fx.output, 'completion.json')), false);
      assert.equal(fs.readdirSync(fx.temporaryRoot).length, 0);
    } finally {
      fx.dispose();
    }
  });
});
