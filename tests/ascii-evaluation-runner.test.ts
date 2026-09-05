import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { applyOutputStyle, readRulesForIntensity } from '../lib/state/index.ts';
import {
  discoverInstalledSkills,
  parseAsciiEvaluationArguments,
  runAsciiEvaluation,
  trustInstalledHooks,
  type AsciiEvaluationOptions,
  type HookTrustRunner,
  type SkillDiscoveryRunner,
} from '../scripts/evaluate-ascii.ts';
import type { EvaluationCommandResult, EvaluationCommandRunner } from '../scripts/evaluate.ts';

interface TestFixture {
  readonly base: string;
  readonly root: string;
  readonly output: string;
  readonly temporaryRoot: string;
  readonly authSource: string;
  readonly dispose: () => void;
}

interface FakeTransport {
  readonly runner: EvaluationCommandRunner;
  readonly discover: SkillDiscoveryRunner;
  readonly trust: HookTrustRunner;
  readonly execPrompts: readonly string[];
  readonly execCalls: () => number;
  readonly trustCalls: () => number;
  readonly callOrder: readonly string[];
  readonly extractedTarballs: readonly string[];
}

const ok = (stdout = ''): EvaluationCommandResult => ({
  status: 0,
  signal: null,
  stdout,
  stderr: '',
});

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
      result = { data: [{ skills: [{ name: 'feynman:feynman', enabled: true }] }] };
    }
    if (request.method === 'hooks/list') {
      result = { data: [{ hooks: [{
        key: 'SessionStart:fake', currentHash: 'sha256:fake', command: 'fake command',
        eventName: 'sessionStart', trustStatus: trusted ? 'trusted' : 'untrusted'
      }] }] };
    }
    if (request.method === 'config/batchWrite') trusted = true;
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

function write(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function isRecord(value: unknown): value is Record<string, unknown> {
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

function fixture(): TestFixture {
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

function copyPackagedFiles(root: string, extractionRoot: string): void {
  const packageRoot = path.join(extractionRoot, 'package');
  for (const relative of [
    'plugins/feynman/skills/feynman/SKILL.md',
    'plugins/feynman/skills/feynman/references/settings.md',
    'rules/feynman-contract.md',
  ]) {
    const source = path.join(root, relative);
    const destination = path.join(packageRoot, relative);
    write(destination, fs.readFileSync(source, 'utf8'));
  }
  write(path.join(packageRoot, 'bin', 'feynman.js'), '#!/usr/bin/env node\n');
}

function writeHookInstall(codexHome: string, hookScript: string): void {
  write(
    path.join(codexHome, 'hooks.json'),
    `${JSON.stringify({
      hooks: {
        SessionStart: [
          {
            matcher: 'startup|resume|compact|clear',
            hooks: [
              {
                type: 'command',
                command: `FEYNMAN_HOME='${codexHome}' node '${hookScript}'`,
                timeout: 5,
              },
            ],
          },
        ],
      },
    })}\n`,
  );
  write(
    path.join(codexHome, '.feynman', 'state.json'),
    `${JSON.stringify({
      enabled: true,
      intensity: 'full',
      output_style: 'full',
      injections: 0,
    })}\n`,
  );
  write(path.join(codexHome, '.feynman-active'), 'full\n');
}

function updateHookState(codexHome: string, args: readonly string[]): void {
  const statePath = path.join(codexHome, '.feynman', 'state.json');
  const parsed: unknown = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (!isRecord(parsed)) throw new Error('synthetic hook state must be an object');
  const command = args.at(-1);
  const intensityChange =
    args.at(-2) !== 'style' && (command === 'lite' || command === 'full' || command === 'ultra')
      ? { intensity: command }
      : {};
  const styleChange =
    args.at(-2) === 'style' && command !== undefined ? { output_style: command } : {};
  write(statePath, `${JSON.stringify({ ...parsed, ...intensityChange, ...styleChange })}\n`);
}

function wrappedHookCommand(codexHome: string): string {
  const parsed: unknown = JSON.parse(fs.readFileSync(path.join(codexHome, 'hooks.json'), 'utf8'));
  assert.ok(isRecord(parsed));
  const hooks = parsed['hooks'];
  assert.ok(isRecord(hooks));
  const groups = hooks['SessionStart'];
  assert.ok(Array.isArray(groups));
  const group: unknown = groups[0];
  assert.ok(isRecord(group));
  const entries = group['hooks'];
  assert.ok(Array.isArray(entries));
  const entry: unknown = entries[0];
  assert.ok(isRecord(entry));
  const wrapped = entry['command'];
  assert.ok(typeof wrapped === 'string');
  return wrapped;
}

function originalCommandFromWrapper(codexHome: string): string {
  const wrapped = wrappedHookCommand(codexHome);
  const match = /'([A-Za-z0-9_-]+)'$/u.exec(wrapped);
  const encodedCommand = match?.[1];
  if (typeof encodedCommand !== 'string') throw new Error('missing encoded hook command');
  return Buffer.from(encodedCommand, 'base64url').toString('utf8');
}

function selectedHookOutput(root: string, codexHome: string): string {
  const state: unknown = JSON.parse(
    fs.readFileSync(path.join(codexHome, '.feynman', 'state.json'), 'utf8'),
  );
  assert.ok(isRecord(state));
  const rules = fs.readFileSync(path.join(root, 'rules', 'feynman-contract.md'), 'utf8');
  return applyOutputStyle(
    readRulesForIntensity(rules, String(state['intensity'])),
    state['output_style'],
  );
}

function modelEvents(
  options: Readonly<{
    command?: string;
    commandOutput?: string;
    commandExitCode?: number;
    commandStatus?: string;
    additionalCommandExecutions?: readonly Readonly<{
      command: string;
      aggregatedOutput: string;
      exitCode: number;
      status: string;
    }>[];
    additionalItems?: readonly Readonly<Record<string, unknown>>[];
    additionalStartedItems?: readonly Readonly<Record<string, unknown>>[];
    hook?: boolean;
  }> = {},
): string {
  const commandExecutions = [
    ...(options.command === undefined
      ? []
      : [
          {
            command: options.command,
            aggregatedOutput: options.commandOutput ?? '',
            exitCode: options.commandExitCode ?? 0,
            status: options.commandStatus ?? 'completed',
          },
        ]),
    ...(options.additionalCommandExecutions ?? []),
  ];
  const records: unknown[] = [
    ...(options.hook === true ? [{ type: 'hook_started' }, { type: 'hook_completed' }] : []),
    ...(options.additionalStartedItems ?? []).map((item) => ({ type: 'item.started', item })),
    ...commandExecutions.map((execution) => ({
      type: 'item.completed',
      item: {
        type: 'command_execution',
        command: execution.command,
        aggregated_output: execution.aggregatedOutput,
        exit_code: execution.exitCode,
        status: execution.status,
      },
    })),
    ...(options.additionalItems ?? []).map((item) => ({ type: 'item.completed', item })),
    { type: 'item.completed', item: { type: 'agent_message', text: 'answer' } },
    { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 2 } },
  ];
  return records.map((record) => JSON.stringify(record)).join('\n');
}

function fakeTransport(
  fx: TestFixture,
  options: Readonly<{
    dirty?: boolean;
    pluginFailure?: boolean;
    modelFailure?: boolean;
    hookTrustFailure?: boolean;
    failedSkillRead?: boolean;
    settingFailureAfterCalls?: number;
    completionWriteFailure?: boolean;
    hookCaptureFailure?: boolean;
    relativeSkillRead?: boolean;
    originalAbsoluteSkillRead?: boolean;
    wrongRelativeSkillRead?: boolean;
    partialSkillRead?: boolean;
    computationCommand?: boolean;
    mutationCommand?: boolean;
    unknownToolItem?: boolean;
  }> = {},
): FakeTransport {
  const prompts: string[] = [];
  const callOrder: string[] = [];
  const extractedTarballs: string[] = [];
  let modelCalls = 0;
  let trustCalls = 0;
  const runner: EvaluationCommandRunner = (command, args, commandOptions) => {
    if (command === 'git') {
      if (args[0] === 'status')
        return ok(options.dirty === true ? ' M rules/feynman-contract.md\n' : '');
      if (args[0] === 'diff') return ok(options.dirty === true ? 'dirty diff\n' : '');
      if (args[1] === 'HEAD^{tree}') return ok('tree123\n');
      return ok('head123\n');
    }
    if (command === 'npm') return ok('package command complete\n');
    if (command === 'tar') {
      const tarball = args[1];
      assert.ok(typeof tarball === 'string');
      extractedTarballs.push(tarball);
      const destinationIndex = args.indexOf('-C') + 1;
      const destination = args[destinationIndex];
      assert.ok(typeof destination === 'string');
      copyPackagedFiles(fx.root, destination);
      return ok();
    }
    if (command === 'codex' && args[0] === '--version') return ok('codex-test 1\n');
    if (command === 'codex' && args[0] === 'plugin') {
      return options.pluginFailure === true && args[1] === 'add'
        ? { status: 1, signal: null, stdout: '', stderr: 'synthetic plugin failure\n' }
        : ok('{}\n');
    }
    if (command === process.execPath && args.at(-1) === 'install') {
      const codexHome = commandOptions.env?.['CODEX_HOME'];
      assert.ok(typeof codexHome === 'string');
      const packagedCli = args[0];
      assert.ok(typeof packagedCli === 'string');
      writeHookInstall(
        codexHome,
        path.join(path.dirname(path.dirname(packagedCli)), 'hooks', 'feynman-session-start.js'),
      );
      return ok('installed\n');
    }
    if (command === process.execPath && args.includes('state')) {
      if (options.settingFailureAfterCalls === modelCalls) {
        return {
          status: 1,
          signal: null,
          stdout: '',
          stderr: 'synthetic setting failure\n',
        };
      }
      const codexHome = commandOptions.env?.['CODEX_HOME'];
      assert.ok(typeof codexHome === 'string');
      updateHookState(codexHome, args);
      return ok('state updated\n');
    }
    if (command === 'codex' && args[0] === 'exec') {
      modelCalls += 1;
      callOrder.push('exec');
      const prompt = args.at(-1);
      assert.ok(typeof prompt === 'string');
      prompts.push(prompt);
      if (options.modelFailure === true) {
        return {
          status: 1,
          signal: null,
          stdout: modelEvents(),
          stderr: 'synthetic model failure\n',
        };
      }
      const codexHome = commandOptions.env?.['CODEX_HOME'];
      assert.ok(typeof codexHome === 'string');
      const isNative =
        prompt.includes('$feynman') || fs.existsSync(path.join(codexHome, 'plugins'));
      const isHook = fs.existsSync(path.join(codexHome, 'hooks.json'));
      if (isHook) {
        assert.equal(fs.existsSync(path.join(codexHome, '.hook-trusted')), true);
        const counter = path.join(codexHome, '.feynman', 'injections');
        const before = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0;
        write(counter, `${before + 1}\n`);
        const capturePath = commandOptions.env?.['FEYNMAN_EVAL_CAPTURE'];
        assert.ok(typeof capturePath === 'string');
        const originalCommand = originalCommandFromWrapper(codexHome);
        const stdout =
          options.hookCaptureFailure === true ? 'partial' : selectedHookOutput(fx.root, codexHome);
        write(
          capturePath,
          `${JSON.stringify({
            version: 1,
            originalCommand,
            exitCode: options.hookCaptureFailure === true ? 7 : 0,
            signal: null,
            stdout,
            stderr: '',
            stdoutHash: createHash('sha256').update(stdout).digest('hex'),
            relayError: null,
          })}\n`,
        );
      }
      const installedSkill = path.join(
        codexHome,
        'plugins',
        'cache',
        'feynman',
        'feynman',
        '2.0.0',
        'skills',
        'feynman',
        'SKILL.md',
      );
      if (options.completionWriteFailure === true) {
        fs.mkdirSync(path.join(fx.output, 'completion.json'), { recursive: true });
      }
      const nativeModelEvent = (() => {
        if (!isNative) return {};
        let commandSkillPath = fs.realpathSync(installedSkill);
        if (options.wrongRelativeSkillRead === true) {
          commandSkillPath = '.codex/plugins/cache/feynman/feynman/2.0.0/skills/other/SKILL.md';
        } else if (options.originalAbsoluteSkillRead === true) {
          const commandCwd = commandOptions.cwd ?? '';
          commandSkillPath = path.resolve(
            commandCwd,
            path.relative(fs.realpathSync(commandCwd), fs.realpathSync(installedSkill)),
          );
        } else if (options.relativeSkillRead === true) {
          commandSkillPath = path.relative(
            fs.realpathSync(commandOptions.cwd ?? ''),
            fs.realpathSync(installedSkill),
          );
        }
        return {
          command: `sed -n 1,220p ${commandSkillPath}`,
          commandOutput:
            options.failedSkillRead === true
              ? ''
              : options.partialSkillRead === true
                ? fs.readFileSync(installedSkill, 'utf8').slice(0, -1)
                : fs.readFileSync(installedSkill, 'utf8'),
          commandExitCode: options.failedSkillRead === true ? 1 : 0,
          commandStatus: options.failedSkillRead === true ? 'failed' : 'completed',
        };
      })();
      return ok(
        modelEvents({
          ...nativeModelEvent,
          additionalCommandExecutions: [
            ...(options.computationCommand === true
              ? [
                  {
                    command: "python3 -c 'print(46)'",
                    aggregatedOutput: '46\n',
                    exitCode: 0,
                    status: 'completed',
                  },
                ]
              : []),
            ...(options.mutationCommand === true
              ? [
                  {
                    command: 'npx @albinocrabs/feynman install',
                    aggregatedOutput: 'installed\n',
                    exitCode: 0,
                    status: 'completed',
                  },
                ]
              : []),
          ],
          additionalStartedItems:
            options.unknownToolItem === true
              ? [{ type: 'web_search', id: 'synthetic-search' }]
              : [],
          hook: isHook,
        }),
      );
    }
    throw new Error(`Unexpected fake command: ${command} ${args.join(' ')}`);
  };
  const discover: SkillDiscoveryRunner = (environment) => {
    const codexHome = environment['CODEX_HOME'];
    assert.ok(typeof codexHome === 'string');
    const cacheRoot = path.join(
      codexHome,
      'plugins',
      'cache',
      'feynman',
      'feynman',
      '2.0.0',
      'skills',
      'feynman',
    );
    write(
      path.join(cacheRoot, 'SKILL.md'),
      fs.readFileSync(
        path.join(fx.root, 'plugins', 'feynman', 'skills', 'feynman', 'SKILL.md'),
        'utf8',
      ),
    );
    write(
      path.join(cacheRoot, 'references', 'settings.md'),
      fs.readFileSync(
        path.join(fx.root, 'plugins', 'feynman', 'skills', 'feynman', 'references', 'settings.md'),
        'utf8',
      ),
    );
    const installed = path.join(cacheRoot, 'SKILL.md');
    return Promise.resolve({
      status: 0,
      stdout: `${JSON.stringify({ id: 2, result: { data: [] } })}\n`,
      stderr: '',
      result: {
        data: [
          {
            skills: [
              {
                name: 'feynman:feynman',
                enabled: true,
                pluginId: 'feynman@feynman',
                path: installed,
              },
            ],
          },
        ],
      },
    });
  };
  const trust: HookTrustRunner = (environment) => {
    trustCalls += 1;
    callOrder.push('trust');
    const codexHome = environment['CODEX_HOME'];
    assert.ok(typeof codexHome === 'string');
    const command = wrappedHookCommand(codexHome);
    const initial = {
      data: [
        {
          hooks: [
            {
              key: 'SessionStart:synthetic',
              currentHash: 'synthetic-hash',
              command,
              eventName: 'sessionStart',
              trustStatus: 'untrusted',
            },
          ],
        },
      ],
    };
    if (options.hookTrustFailure === true) {
      return Promise.resolve({
        status: 1,
        stdout: `${JSON.stringify({ id: 2, result: initial })}\n`,
        stderr: 'synthetic hook trust failure\n',
        initial,
        verified: null,
        error: 'synthetic hook trust failure',
      });
    }
    const configPath = path.join(codexHome, 'config.toml');
    fs.appendFileSync(configPath, '[hooks]\ntrusted = true\n');
    write(path.join(codexHome, '.hook-trusted'), 'true\n');
    const verified = {
      data: [
        {
          hooks: [
            {
              key: 'SessionStart:synthetic',
              currentHash: 'synthetic-hash',
              command,
              eventName: 'sessionStart',
              trustStatus: 'trusted',
            },
          ],
        },
      ],
    };
    return Promise.resolve({
      status: 0,
      stdout: [
        JSON.stringify({ id: 1, result: {} }),
        JSON.stringify({ id: 2, result: initial }),
        JSON.stringify({ id: 3, result: {} }),
        JSON.stringify({ id: 4, result: verified }),
      ].join('\n'),
      stderr: '',
      initial,
      verified,
    });
  };
  return {
    runner,
    discover,
    trust,
    execPrompts: prompts,
    execCalls: () => modelCalls,
    trustCalls: () => trustCalls,
    callOrder,
    extractedTarballs,
  };
}

async function run(
  fx: TestFixture,
  transport: FakeTransport,
  overrides: Readonly<Partial<AsciiEvaluationOptions>> = {},
): Promise<void> {
  await runAsciiEvaluation({
    model: 'gpt-5.6-luna',
    outputDirectory: fx.output,
    root: fx.root,
    authSource: fx.authSource,
    temporaryRoot: fx.temporaryRoot,
    development: true,
    taskIds: ['A01'],
    arms: ['baseline'],
    environment: { PATH: '/synthetic' },
    runCommand: transport.runner,
    discoverSkills: transport.discover,
    trustHooks: transport.trust,
    now: () => new Date('2026-09-05T12:00:00.000Z'),
    onProgress: () => undefined,
    ...overrides,
  });
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
      assert.equal(fs.readFileSync(frozenTarball).equals(builtBytes), true);
      assert.equal(fs.statSync(frozenTarball).mode & 0o777, 0o400);
      assert.deepEqual(transport.extractedTarballs, [frozenTarball]);
      const manifest: unknown = JSON.parse(
        fs.readFileSync(path.join(fx.output, 'manifest.json'), 'utf8'),
      );
      assert.ok(isRecord(manifest));
      assert.equal(
        manifest['packageTarballHash'],
        createHash('sha256').update(builtBytes).digest('hex'),
      );
      fs.writeFileSync(builtTarball, 'later build bytes\n');
      assert.equal(fs.readFileSync(frozenTarball).equals(builtBytes), true);
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
