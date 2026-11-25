import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { applyOutputStyle, readRulesForIntensity } from '../../lib/state/index.ts';
import {
  runAsciiEvaluation,
  type AsciiEvaluationOptions,
  type HookTrustRunner,
  type SkillDiscoveryRunner,
} from '../../scripts/evaluate-ascii.ts';
import type { EvaluationCommandResult, EvaluationCommandRunner } from '../../scripts/evaluate.ts';
import { isRecord, write, type TestFixture } from './ascii-fixture.ts';

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

export function fakeTransport(
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

export async function run(
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
