#!/usr/bin/env node
import path from 'node:path';
import {
  type SkillDiscoveryRunner,
  type HookTrustRunner,
  discoverInstalledSkills,
  trustInstalledHooks,
} from './ascii-app-server.ts';
import fs from 'node:fs';
import os from 'node:os';
import {
  isRecord,
  type Arm,
  type GenerationCall,
  parseAsciiFixture,
  parseSuppressionFixture,
  buildCallPlan,
  selectCalls,
  EXPECTED_MODEL_CALLS,
} from './ascii-call-plan.ts';
import { type EvaluationCommandRunner, runEvaluationCommand } from './evaluate.ts';
import {
  type IsolatedHome,
  type InstalledSkill,
  type HookWrapper,
  type DeliveryContext,
  hookPreferenceSnapshot,
  sameSnapshot,
  nativeSnapshot,
  applySetting,
  createSelectedHomes,
  configureDeliveries,
} from './ascii-delivery.ts';
import {
  type PackagedArtifact,
  REASONING,
  buildAndVerifyArtifact,
  writeJson,
  errorMessage,
  MAX_BUFFER_BYTES,
  eventSummary,
  type ManifestState,
  sha256,
  readInjectionCount,
  parseJsonLines,
  commandFailed,
  withManifestProgress,
  combinedError,
  checkedCommand,
  sourceFileHashes,
  newManifest,
  writeGenerationInputs,
} from './ascii-evidence.ts';
import { assertTagPairs, readRulesForIntensity, applyOutputStyle } from '../lib/state/index.ts';
export type { SkillDiscoveryResult } from './ascii-app-server.ts';
export type { SkillDiscoveryRunner } from './ascii-app-server.ts';
export type { HookTrustResult } from './ascii-app-server.ts';
export type { HookTrustRunner } from './ascii-app-server.ts';
export { discoverInstalledSkills } from './ascii-app-server.ts';
export { trustInstalledHooks } from './ascii-app-server.ts';

const MODEL_TIMEOUT_MS = 120_000;

export interface AsciiEvaluationOptions {
  readonly model: string;
  readonly outputDirectory: string;
  readonly root?: string;
  readonly authSource?: string;
  readonly temporaryRoot?: string;
  readonly development?: boolean;
  readonly taskIds?: readonly string[];
  readonly arms?: readonly Arm[];
  readonly runCommand?: EvaluationCommandRunner;
  readonly discoverSkills?: SkillDiscoveryRunner;
  readonly trustHooks?: HookTrustRunner;
  readonly environment?: Readonly<NodeJS.ProcessEnv>;
  readonly now?: () => Date;
  readonly onProgress?: (message: string) => void;
  readonly removeTemporaryHome?: (home: string) => void;
}

interface CliArguments {
  readonly model: string;
  readonly outputDirectory: string;
  readonly development: boolean;
  readonly taskIds: readonly string[];
  readonly arms: readonly Arm[];
}

function buildArtifactWithFailureEvidence(
  root: string,
  output: string,
  runner: EvaluationCommandRunner,
  environment: Readonly<NodeJS.ProcessEnv>,
): PackagedArtifact {
  try {
    return buildAndVerifyArtifact(root, output, runner, environment);
  } catch (error) {
    writeJson(path.join(output, 'failure.json'), {
      message: errorMessage(error),
      attemptsRecorded: 0,
      phase: 'package-preflight',
    });
    throw error instanceof Error ? error : new Error(errorMessage(error));
  }
}

function modelArguments(model: string, home: IsolatedHome, prompt: string): readonly string[] {
  return [
    'exec',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '--json',
    '-m',
    model,
    '-c',
    `model_reasoning_effort="${REASONING}"`,
    '-C',
    home.home,
    prompt,
  ];
}

function nativeSkillReadIsProven(
  executions: ReturnType<typeof eventSummary>['commandExecutions'],
  installed: InstalledSkill,
  cwd: string,
): boolean {
  const expectedOutput = fs.readFileSync(installed.path, 'utf8');
  const installedRealPath = fs.realpathSync(installed.path);
  const cwdRealPath = fs.realpathSync(cwd);
  const relativePath = path.relative(cwdRealPath, installedRealPath);
  const allowedPaths = [
    installed.path,
    installedRealPath,
    path.resolve(cwd, relativePath),
    relativePath,
    `.${path.sep}${relativePath}`,
  ];
  const referencesInstalledSkill = (command: string): boolean =>
    !path.isAbsolute(relativePath) &&
    !relativePath.startsWith(`..${path.sep}`) &&
    allowedPaths.some((candidate) => {
      const index = command.indexOf(candidate);
      if (index < 0) return false;
      const before = command[index - 1];
      const after = command[index + candidate.length];
      const boundary = (value: string | undefined): boolean =>
        value === undefined || /[\s'"=]/u.test(value);
      return boundary(before) && boundary(after);
    });
  return executions.some(
    (execution) =>
      referencesInstalledSkill(execution.command) &&
      execution.status === 'completed' &&
      execution.exitCode === 0 &&
      execution.aggregatedOutput === expectedOutput,
  );
}

function assertOutputAvailable(output: string): void {
  if (fs.existsSync(output) && fs.readdirSync(output).length > 0) {
    throw new Error(`Refusing to overwrite non-empty evidence directory: ${output}`);
  }
}

function validateFinalMode(
  development: boolean,
  sourceStatus: string,
  taskIds: readonly string[],
  arms: readonly Arm[],
): void {
  if (!development && sourceStatus.length > 0) {
    throw new Error('Final ASCII evaluation requires a clean source revision');
  }
  if (!development && (taskIds.length > 0 || arms.length > 0)) {
    throw new Error('Task and arm filters require explicit --development mode');
  }
}

function parseArm(value: string): Arm {
  if (value === 'baseline' || value === 'native' || value === 'hook') return value;
  throw new Error(`Unknown arm: ${value}`);
}

export function parseAsciiEvaluationArguments(args: readonly string[]): CliArguments {
  const [model, outputDirectory, ...rest] = args;
  if (model === undefined || outputDirectory === undefined || model.startsWith('-')) {
    throw new Error(
      'usage: node scripts/evaluate-ascii.ts <model> <new-output-directory> [--development] [--tasks ID,...] [--arms baseline,native,hook]',
    );
  }
  const parsed = parseOptionalArguments(rest, {
    development: false,
    taskIds: [],
    arms: [],
  });
  return {
    model,
    outputDirectory,
    development: parsed.development,
    taskIds: [...new Set(parsed.taskIds)],
    arms: [...new Set(parsed.arms)],
  };
}

interface OptionalArguments {
  readonly development: boolean;
  readonly taskIds: readonly string[];
  readonly arms: readonly Arm[];
}

function parseOptionalArguments(
  args: readonly string[],
  parsed: OptionalArguments,
): OptionalArguments {
  const [argument, value, ...remaining] = args;
  if (argument === undefined) return parsed;
  if (argument === '--development') {
    return parseOptionalArguments(args.slice(1), { ...parsed, development: true });
  }
  if (
    (argument === '--task-id' ||
      argument === '--tasks' ||
      argument === '--arm' ||
      argument === '--arms') &&
    value === undefined
  ) {
    throw new Error(`${argument} requires a value`);
  }
  if (argument === '--task-id' && value !== undefined) {
    return parseOptionalArguments(remaining, {
      ...parsed,
      taskIds: [...parsed.taskIds, value],
    });
  }
  if (argument === '--arm' && value !== undefined) {
    return parseOptionalArguments(remaining, {
      ...parsed,
      arms: [...parsed.arms, parseArm(value)],
    });
  }
  if (argument === '--tasks' && value !== undefined) {
    const values = value.split(',').filter((taskId) => taskId.length > 0);
    if (values.length === 0) throw new Error('--tasks requires at least one task ID');
    return parseOptionalArguments(remaining, {
      ...parsed,
      taskIds: [...parsed.taskIds, ...values],
    });
  }
  if (argument === '--arms' && value !== undefined) {
    const values = value.split(',').filter((arm) => arm.length > 0);
    if (values.length === 0) throw new Error('--arms requires at least one arm');
    return parseOptionalArguments(remaining, {
      ...parsed,
      arms: [...parsed.arms, ...values.map(parseArm)],
    });
  }
  throw new Error(`Unknown argument: ${argument}`);
}

type ExecutionResult =
  | { readonly kind: 'success'; readonly manifest: ManifestState }
  | { readonly kind: 'failure'; readonly manifest: ManifestState; readonly error: Error };

function expectedHookOutput(packageRoot: string, call: GenerationCall): string {
  const rules = fs.readFileSync(path.join(packageRoot, 'rules', 'feynman-contract.md'), 'utf8');
  if (!assertTagPairs(rules))
    throw new Error('Packaged hook contract has unbalanced intensity tags');
  const intensity = call.setting?.intensity ?? 'full';
  const outputStyle = call.setting?.outputStyle ?? 'full';
  const selectedRules = readRulesForIntensity(rules, intensity);
  if (selectedRules === '') throw new Error(`Packaged hook contract has no ${intensity} rules`);
  return applyOutputStyle(selectedRules, outputStyle);
}

function verifyHookCapture(
  capturePath: string,
  wrapper: HookWrapper,
  expectedOutput: string,
): Readonly<Record<string, unknown>> {
  const read = (():
    | { readonly kind: 'value'; readonly value: unknown }
    | { readonly kind: 'error'; readonly message: string } => {
    try {
      const value: unknown = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
      return { kind: 'value', value };
    } catch (error) {
      return { kind: 'error', message: errorMessage(error) };
    }
  })();
  if (read.kind === 'error') {
    return {
      observed: false,
      emissionProven: false,
      parseError: read.message,
      expectedOutputHash: sha256(expectedOutput),
    };
  }
  const parsed = read.value;
  if (!isRecord(parsed)) {
    return {
      observed: true,
      emissionProven: false,
      parseError: 'Hook capture must be an object',
      expectedOutputHash: sha256(expectedOutput),
    };
  }
  const stdout = parsed['stdout'];
  const expectedOutputHash = sha256(expectedOutput);
  const observedOutputHash = typeof stdout === 'string' ? sha256(stdout) : null;
  const emissionProven =
    parsed['version'] === 1 &&
    parsed['originalCommand'] === wrapper.originalCommand &&
    parsed['exitCode'] === 0 &&
    parsed['signal'] === null &&
    parsed['relayError'] === null &&
    stdout === expectedOutput &&
    parsed['stdoutHash'] === expectedOutputHash &&
    observedOutputHash === expectedOutputHash;
  return {
    observed: true,
    emissionProven,
    parseError: null,
    version: parsed['version'],
    originalCommandMatches: parsed['originalCommand'] === wrapper.originalCommand,
    exitCode: parsed['exitCode'],
    signal: parsed['signal'],
    relayError: parsed['relayError'],
    stdoutLength: typeof stdout === 'string' ? Buffer.byteLength(stdout) : null,
    stdoutHash: parsed['stdoutHash'],
    observedOutputHash,
    expectedOutputLength: Buffer.byteLength(expectedOutput),
    expectedOutputHash,
  };
}

function executeModelCall(
  call: GenerationCall,
  options: Readonly<{
    root: string;
    output: string;
    model: string;
    runner: EvaluationCommandRunner;
    delivery: DeliveryContext;
  }>,
): boolean {
  const home = options.delivery.homesByArm.get(call.arm);
  if (home === undefined) throw new Error(`Missing isolated home for ${call.arm}`);
  const capturePath =
    call.arm === 'hook' ? path.join(options.output, `${call.id}.hook-capture.json`) : null;
  if (capturePath !== null && fs.existsSync(capturePath)) {
    throw new Error(`Refusing to overwrite hook capture: ${capturePath}`);
  }
  const hookEvidenceSetup = (() => {
    if (call.arm !== 'hook') return null;
    const wrapper = options.delivery.hookWrapper;
    const packageRoot = options.delivery.packageRootsByArm.get('hook');
    if (wrapper === null || packageRoot === undefined) {
      throw new Error('Hook capture wrapper or packaged contract is unavailable');
    }
    return { wrapper, expectedOutput: expectedHookOutput(packageRoot, call) };
  })();
  const hookPreferencesBefore = call.arm === 'hook' ? hookPreferenceSnapshot(home) : null;
  const injectionBefore = call.arm === 'hook' ? readInjectionCount(home.codexHome) : null;
  const started = performance.now();
  const result = options.runner('codex', modelArguments(options.model, home, call.prompt), {
    cwd: home.home,
    encoding: 'utf8',
    env:
      capturePath === null
        ? home.environment
        : { ...home.environment, FEYNMAN_EVAL_CAPTURE: capturePath },
    timeout: MODEL_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
  });
  const elapsedMs = Math.round(performance.now() - started);
  fs.writeFileSync(path.join(options.output, `${call.id}.events.jsonl`), result.stdout);
  fs.writeFileSync(path.join(options.output, `${call.id}.stderr.txt`), result.stderr);
  const parsed = parseJsonLines(result.stdout);
  const summary = eventSummary(parsed.events);
  const injectionAfter = call.arm === 'hook' ? readInjectionCount(home.codexHome) : null;
  const hookPreferencesAfter = call.arm === 'hook' ? hookPreferenceSnapshot(home) : null;
  const hookPreferencesUnchanged =
    call.arm !== 'hook' ||
    (hookPreferencesBefore !== null &&
      hookPreferencesAfter !== null &&
      sameSnapshot(hookPreferencesBefore, hookPreferencesAfter));
  const hookCounterAdvanced =
    injectionBefore !== null && injectionAfter !== null && injectionAfter > injectionBefore;
  const hookCapture =
    call.arm !== 'hook'
      ? null
      : hookEvidenceSetup === null || capturePath === null
        ? { observed: false, emissionProven: false, parseError: 'Hook wrapper is unavailable' }
        : verifyHookCapture(
            capturePath,
            hookEvidenceSetup.wrapper,
            hookEvidenceSetup.expectedOutput,
          );
  const hookInvocationProven =
    call.arm !== 'hook' || hookCounterAdvanced || hookCapture?.['observed'] === true;
  const hookEmissionProven = call.arm !== 'hook' || hookCapture?.['emissionProven'] === true;
  const hookDeliveryProven = hookEmissionProven;
  const nativeSkillRead =
    call.arm !== 'native' ||
    (options.delivery.installedSkill !== null &&
      nativeSkillReadIsProven(
        summary.commandExecutions,
        options.delivery.installedSkill,
        home.home,
      ));
  const toolActivityItemTypes = summary.activityItemTypes.filter(
    (itemType) => itemType !== 'agent_message' && itemType !== 'reasoning',
  );
  const noUnexpectedTools = toolActivityItemTypes.length === 0;
  const externalToolReview = noUnexpectedTools ? 'not-required' : 'missing';
  const nativeAfter =
    call.arm === 'native' && options.delivery.installedSkill !== null
      ? nativeSnapshot(home, options.delivery.installedSkill)
      : null;
  const nativeStateUnchanged =
    call.arm !== 'native' ||
    (options.delivery.nativeInitial !== null &&
      nativeAfter !== null &&
      sameSnapshot(options.delivery.nativeInitial, nativeAfter));
  const success =
    !commandFailed(result) &&
    parsed.parseError === null &&
    summary.completed &&
    summary.answer.length > 0 &&
    nativeSkillRead &&
    hookDeliveryProven &&
    hookPreferencesUnchanged &&
    nativeStateUnchanged;
  writeJson(path.join(options.output, `${call.id}.json`), {
    id: call.id,
    taskId: call.taskId,
    suite: call.suite,
    arm: call.arm,
    nativeActivation: call.nativeActivation,
    setting: call.setting,
    maxColumns: call.maxColumns,
    promptHash: sha256(call.prompt),
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
    elapsedMs,
    parseError: parsed.parseError,
    success,
    answer: summary.answer,
    answerLength: Array.from(summary.answer).length,
    usage: summary.usage,
    eventTypes: summary.eventTypes,
    itemTypes: summary.itemTypes,
    commands: summary.commands,
    commandExecutions: summary.commandExecutions,
    toolActivityItemTypes,
    toolActivityEventsFile: `${call.id}.events.jsonl`,
    externalToolReview,
    noUnexpectedTools,
    nativeSkillRead,
    nativeStateUnchanged,
    nativeStateAfter: nativeAfter,
    hookStarted: summary.hookStarted,
    hookCompleted: summary.hookCompleted,
    injectionBefore,
    injectionAfter,
    hookInvocationCounterAdvanced: hookCounterAdvanced,
    hookInvocationProven,
    hookEmissionProven,
    hookCapture,
    hookDeliveryProven,
    hookPreferencesBefore,
    hookPreferencesAfter,
    hookPreferencesUnchanged,
  });
  return success;
}

function executeSelectedCalls(
  calls: readonly GenerationCall[],
  index: number,
  manifest: ManifestState,
  options: Readonly<{
    root: string;
    output: string;
    model: string;
    runner: EvaluationCommandRunner;
    delivery: DeliveryContext;
    onProgress: (message: string) => void;
  }>,
): ExecutionResult {
  const call = calls[index];
  if (call === undefined) return { kind: 'success', manifest };
  if (call.setting !== null) {
    try {
      const home = options.delivery.homesByArm.get(call.arm);
      const packageRoot = options.delivery.packageRootsByArm.get('hook');
      if (home === undefined) throw new Error(`Missing isolated home for ${call.arm}`);
      if (packageRoot === undefined) throw new Error('Missing hook packaged artifact');
      applySetting(packageRoot, options.output, call, home, options.runner);
    } catch (error) {
      return failedExecution(
        manifest,
        error instanceof Error ? error : new Error(errorMessage(error)),
        manifest.attemptsRecorded,
        options.output,
      );
    }
  }
  const attempt = (():
    | { readonly kind: 'result'; readonly success: boolean }
    | { readonly kind: 'error'; readonly error: Error } => {
    try {
      return { kind: 'result', success: executeModelCall(call, options) };
    } catch (error) {
      return {
        kind: 'error',
        error: error instanceof Error ? error : new Error(errorMessage(error)),
      };
    }
  })();
  if (attempt.kind === 'error') {
    return failedExecution(manifest, attempt.error, manifest.attemptsRecorded + 1, options.output);
  }
  const success = attempt.success;
  const attemptsRecorded = manifest.attemptsRecorded + 1;
  const nextManifest = withManifestProgress(manifest, {
    generationComplete: false,
    fullGenerationComplete: false,
    acceptanceComplete: false,
    eligibleForReview: false,
    attemptsRecorded,
    stoppedAfterFailure: !success,
    ...(success ? {} : { failure: `Model attempt ${call.id} failed` }),
  });
  try {
    writeJson(path.join(options.output, 'manifest.json'), nextManifest);
    options.onProgress(`${call.id}: ${success ? 'recorded' : 'failed'}`);
  } catch (error) {
    return failedExecution(
      nextManifest,
      error instanceof Error ? error : new Error(errorMessage(error)),
      attemptsRecorded,
      options.output,
    );
  }
  return success
    ? executeSelectedCalls(calls, index + 1, nextManifest, options)
    : failedExecution(
        nextManifest,
        new Error(`Model attempt ${call.id} failed; evidence retained`),
        attemptsRecorded,
        options.output,
      );
}

function failedExecution(
  manifest: ManifestState,
  error: Error,
  attemptsRecorded: number,
  output: string,
): ExecutionResult {
  const failedManifest = withManifestProgress(manifest, {
    generationComplete: false,
    fullGenerationComplete: false,
    acceptanceComplete: false,
    eligibleForReview: false,
    attemptsRecorded,
    stoppedAfterFailure: true,
    failure: error.message,
  });
  try {
    writeJson(path.join(output, 'manifest.json'), failedManifest);
    return { kind: 'failure', manifest: failedManifest, error };
  } catch (recordingError) {
    return {
      kind: 'failure',
      manifest: failedManifest,
      error: combinedError(error, recordingError, 'Failure manifest write failed'),
    };
  }
}

export async function runAsciiEvaluation(options: Readonly<AsciiEvaluationOptions>): Promise<void> {
  const root = options.root ?? path.resolve(import.meta.dirname, '..');
  const output = path.resolve(options.outputDirectory);
  const development = options.development ?? false;
  const taskIds = options.taskIds ?? [];
  const arms = options.arms ?? [];
  const environment = options.environment ?? process.env;
  const runner = options.runCommand ?? runEvaluationCommand;
  const discover = options.discoverSkills ?? discoverInstalledSkills;
  const trustHooks = options.trustHooks ?? trustInstalledHooks;
  const now = options.now ?? (() => new Date());
  const onProgress =
    options.onProgress ?? ((message: string) => process.stdout.write(`${message}\n`));
  const temporaryRoot = options.temporaryRoot ?? os.tmpdir();
  const removeTemporaryHome =
    options.removeTemporaryHome ??
    ((home: string) => {
      fs.rmSync(home, { recursive: true, force: true });
    });
  const authSource =
    options.authSource ??
    path.join(environment['CODEX_HOME'] ?? path.join(os.homedir(), '.codex'), 'auth.json');

  assertOutputAvailable(output);
  const asciiFixturePath = path.join(root, 'evals', 'ascii-transformation.json');
  if (!fs.existsSync(asciiFixturePath)) {
    throw new Error(`Missing frozen ASCII evaluation fixture: ${asciiFixturePath}`);
  }
  const suppressionFixturePath = path.join(root, 'evals', 'evals.json');
  const asciiFixtureText = fs.readFileSync(asciiFixturePath, 'utf8');
  const suppressionFixtureText = fs.readFileSync(suppressionFixturePath, 'utf8');
  const asciiTasks = parseAsciiFixture(asciiFixtureText);
  const suppressionTasks = parseSuppressionFixture(suppressionFixtureText);
  const fullPlan = buildCallPlan(asciiTasks, suppressionTasks);
  const selectedCalls = selectCalls(fullPlan, taskIds, arms);
  if (selectedCalls.length === 0)
    throw new Error('The selected task and arm filters match no calls');

  const sourceHead = checkedCommand(
    runner,
    'git',
    ['rev-parse', 'HEAD'],
    { cwd: root, encoding: 'utf8' },
    'Source HEAD lookup',
  ).trim();
  const sourceTree = checkedCommand(
    runner,
    'git',
    ['rev-parse', 'HEAD^{tree}'],
    { cwd: root, encoding: 'utf8' },
    'Source tree lookup',
  ).trim();
  const sourceStatus = checkedCommand(
    runner,
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all'],
    { cwd: root, encoding: 'utf8' },
    'Source status lookup',
  ).trimEnd();
  const sourceDiff = checkedCommand(
    runner,
    'git',
    ['diff', 'HEAD', '--binary'],
    { cwd: root, encoding: 'utf8' },
    'Source diff lookup',
  );
  validateFinalMode(development, sourceStatus, taskIds, arms);
  const codexVersion = checkedCommand(
    runner,
    'codex',
    ['--version'],
    { encoding: 'utf8' },
    'Codex CLI version lookup',
  ).trim();
  if (!fs.existsSync(authSource))
    throw new Error('Managed file-based Codex auth.json is unavailable');

  fs.mkdirSync(output, { recursive: true });
  const artifact = buildArtifactWithFailureEvidence(root, output, runner, environment);
  const sourceFiles = sourceFileHashes(root);
  const protocolPath = path.join(root, 'evals', 'ascii-transformation-protocol.md');
  const manifest = newManifest({
    development,
    model: options.model,
    sourceHead,
    sourceTree,
    sourceStatus,
    sourceDiff,
    runnerHash: sha256(
      [
        'evaluate-ascii.ts',
        'ascii-app-server.ts',
        'ascii-call-plan.ts',
        'ascii-delivery.ts',
        'ascii-evidence.ts',
        'evaluation-tasks.ts',
      ]
        .map((file) => sha256(fs.readFileSync(path.join(import.meta.dirname, file))))
        .join(''),
    ),
    asciiFixtureHash: sha256(asciiFixtureText),
    suppressionFixtureHash: sha256(suppressionFixtureText),
    protocolHash: sha256(fs.readFileSync(protocolPath)),
    artifact,
    codexVersion,
    selectedCalls,
    selectedTaskIds: taskIds,
    selectedArms: arms,
    startedAt: now().toISOString(),
    sourceFiles,
  });
  writeJson(path.join(output, 'manifest.json'), manifest);
  writeGenerationInputs(output, selectedCalls);

  const selectedArms = (['baseline', 'native', 'hook'] as const).filter((arm) =>
    selectedCalls.some((call) => call.arm === arm),
  );
  const homes = createSelectedHomes(
    selectedArms,
    temporaryRoot,
    authSource,
    environment,
    removeTemporaryHome,
  );
  let terminalError: Error | null = null;
  try {
    let outcome: ExecutionResult;
    try {
      const delivery = await configureDeliveries(
        root,
        output,
        homes,
        artifact,
        runner,
        discover,
        trustHooks,
      );
      outcome = executeSelectedCalls(selectedCalls, 0, manifest, {
        root,
        output,
        model: options.model,
        runner,
        delivery,
        onProgress,
      });
    } catch (error) {
      outcome = failedExecution(
        manifest,
        error instanceof Error ? error : new Error(errorMessage(error)),
        manifest.attemptsRecorded,
        output,
      );
    }
    if (outcome.kind === 'failure') {
      terminalError = outcome.error;
      try {
        writeJson(path.join(output, 'failure.json'), {
          message: outcome.error.message,
          attemptsRecorded: outcome.manifest.attemptsRecorded,
        });
      } catch (error) {
        terminalError = combinedError(outcome.error, error, 'Failure evidence write failed');
      }
    } else {
      const fullGenerationComplete =
        !development && selectedCalls.length === EXPECTED_MODEL_CALLS && sourceStatus.length === 0;
      const completedManifest = withManifestProgress(outcome.manifest, {
        generationComplete: true,
        fullGenerationComplete,
        acceptanceComplete: false,
        eligibleForReview: fullGenerationComplete,
        attemptsRecorded: outcome.manifest.attemptsRecorded,
        stoppedAfterFailure: false,
        completedAt: now().toISOString(),
      });
      try {
        writeJson(path.join(output, 'manifest.json'), completedManifest);
        writeJson(path.join(output, 'completion.json'), {
          generationComplete: true,
          fullGenerationComplete,
          acceptanceComplete: false,
          eligibleForReview: fullGenerationComplete,
          acceptanceEvidence: completedManifest.acceptanceEvidence,
          attempts: completedManifest.attemptsRecorded,
          completedAt: completedManifest.completedAt,
        });
      } catch (error) {
        terminalError =
          error instanceof Error
            ? error
            : new Error(`Completion evidence failed: ${String(error)}`);
      }
    }
  } finally {
    const cleanupFailures = homes.flatMap((home): readonly string[] => {
      try {
        removeTemporaryHome(home.home);
        return [];
      } catch (error) {
        return [`${home.arm}: ${errorMessage(error)}`];
      }
    });
    if (cleanupFailures.length > 0) {
      const cleanupError = new Error(`Temporary cleanup failed: ${cleanupFailures.join('; ')}`);
      terminalError =
        terminalError === null
          ? cleanupError
          : combinedError(terminalError, cleanupError, 'Additional cleanup failure');
    }
    try {
      writeJson(path.join(output, 'filesystem-final.json'), {
        temporaryHomes: homes.map((home) => ({
          arm: home.arm,
          path: home.home,
          exists: fs.existsSync(home.home),
        })),
        cleanupFailures,
        authContentsRecorded: false,
      });
    } catch (error) {
      terminalError =
        terminalError === null
          ? error instanceof Error
            ? error
            : new Error(errorMessage(error))
          : combinedError(terminalError, error, 'Filesystem evidence write failed');
    }
  }
  if (terminalError !== null) throw terminalError;
}

async function asciiEvaluationMain(args: readonly string[]): Promise<void> {
  try {
    const parsed = parseAsciiEvaluationArguments(args);
    await runAsciiEvaluation(parsed);
  } catch (error) {
    process.stderr.write(`${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void asciiEvaluationMain(process.argv.slice(2));
}
