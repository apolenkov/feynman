#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { hash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { applyOutputStyle, assertTagPairs, readRulesForIntensity } from '../lib/state/index.ts';
import { runEvaluationCommand } from './evaluate.ts';
import type { EvaluationCommandResult, EvaluationCommandRunner } from './evaluate.ts';

const EXPECTED_MODEL_CALLS = 67;
const REASONING = 'medium';
const MODEL_TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const NATIVE_PLUGIN_ID = 'feynman@feynman';
const SETTINGS_TASK_ID = 'A02';
const NATIVE_INVOCATION_PREFIX = 'Use $feynman for this request.';
const EXPLICIT_NATIVE_TASKS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`),
);
const AUTOMATIC_NATIVE_TASKS = Object.freeze(['A11', 'A12', 'A13', 'A14']);
const PROMPT_TEMPLATE =
  '{prompt}\n\n{source}\n\nMaximum diagram width: {maxColumns} display columns. ' +
  'ASCII means ASCII structural marks with source-language Unicode labels permitted. ' +
  'Preserve names and use fenced monospaced text for the visual.';
const NETWORK_VARIABLE =
  /^(HTTPS?_PROXY|ALL_PROXY|NO_PROXY|https?_proxy|all_proxy|no_proxy|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$/;

type Arm = 'baseline' | 'native' | 'hook';
type Suite = 'ascii-transformation' | 'original-suppression' | 'settings-matrix';
type Intensity = 'lite' | 'full' | 'ultra';
type OutputStyle = 'short' | 'middle' | 'full';

interface AsciiTask {
  readonly id: string;
  readonly prompt: string;
  readonly source: string;
  readonly maxColumns: number;
}

interface SuppressionTask {
  readonly id: string;
  readonly prompt: string;
}

interface GenerationCall {
  readonly id: string;
  readonly taskId: string;
  readonly suite: Suite;
  readonly arm: Arm;
  readonly prompt: string;
  readonly maxColumns: number | null;
  readonly setting: Readonly<{ intensity: Intensity; outputStyle: OutputStyle }> | null;
  readonly nativeActivation: 'explicit' | 'automatic' | null;
}

interface IsolatedHome {
  readonly arm: Arm;
  readonly home: string;
  readonly codexHome: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
}

interface InstalledSkill {
  readonly path: string;
  readonly settingsPath: string;
}

interface HookWrapper {
  readonly originalCommand: string;
  readonly wrappedCommand: string;
  readonly adapterPath: string;
  readonly adapterHash: string;
}

interface PackagedArtifact {
  readonly tarball: string;
  readonly tarballHash: string;
  readonly pointerHash: string;
}

interface ManifestState {
  readonly protocol: 1;
  readonly mode: 'final' | 'development';
  readonly model: string;
  readonly reasoning: typeof REASONING;
  readonly sourceHead: string;
  readonly sourceTree: string;
  readonly sourceStatus: string;
  readonly sourceStatusHash: string;
  readonly sourceDiffHash: string;
  readonly sourceHash: string;
  readonly runnerHash: string;
  readonly asciiFixtureHash: string;
  readonly suppressionFixtureHash: string;
  readonly protocolHash: string;
  readonly promptTemplateHash: string;
  readonly promptTemplate: string;
  readonly nativeInvocationPrefix: string;
  readonly nativeInvocationPrefixHash: string;
  readonly packageTarballHash: string;
  readonly packagePointerHash: string;
  readonly marketplaceHash: string;
  readonly pluginManifestHash: string;
  readonly skillHash: string;
  readonly settingsHash: string;
  readonly rulesHash: string;
  readonly captureAdapterHash: string;
  readonly runtime: Readonly<{
    node: string;
    codex: string;
    platform: NodeJS.Platform;
    architecture: string;
    release: string;
  }>;
  readonly expectedFullModelCalls: typeof EXPECTED_MODEL_CALLS;
  readonly baselineIncluded: true;
  readonly nativeActivation: Readonly<{
    explicitMainTaskIds: readonly string[];
    automaticMainTaskIds: readonly string[];
    suppression: 'explicit';
  }>;
  readonly providerBuildFingerprint: 'unavailable';
  readonly selectedModelCalls: number;
  readonly selectedTaskIds: readonly string[] | 'all';
  readonly selectedArms: readonly Arm[] | 'all';
  readonly startedAt: string;
  readonly generationComplete: boolean;
  readonly fullGenerationComplete: boolean;
  readonly acceptanceComplete: boolean;
  readonly eligibleForReview: boolean;
  readonly acceptanceEvidence: Readonly<{
    externalBlindReview: 'missing';
    externalToolReview: 'missing';
  }>;
  readonly attemptsRecorded: number;
  readonly stoppedAfterFailure: boolean;
  readonly completedAt?: string;
  readonly failure?: string;
}

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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function combinedError(primary: Error, secondary: unknown, label: string): Error {
  return new Error(`${primary.message}\n${label}: ${errorMessage(secondary)}`, { cause: primary });
}

function sha256(value: string | Buffer): string {
  return hash('sha256', value, 'hex');
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function commandFailed(result: EvaluationCommandResult): boolean {
  return result.status !== 0 || result.signal !== null || result.error !== undefined;
}

function commandDiagnostic(result: EvaluationCommandResult): string {
  return [
    result.error?.message ?? '',
    result.signal === null ? '' : `signal ${result.signal}`,
    result.stderr,
    result.stdout,
  ]
    .filter((part) => part.length > 0)
    .join('\n');
}

function checkedCommand(
  runner: EvaluationCommandRunner,
  command: string,
  args: readonly string[],
  options: Readonly<{
    cwd?: string;
    encoding: 'utf8';
    env?: Readonly<NodeJS.ProcessEnv>;
    timeout?: number;
    maxBuffer?: number;
  }>,
  purpose: string,
): string {
  const result = runner(command, args, options);
  if (commandFailed(result)) {
    const diagnostic = commandDiagnostic(result);
    throw new Error(`${purpose} failed${diagnostic.length === 0 ? '' : `:\n${diagnostic}`}`);
  }
  return result.stdout;
}

function parseAsciiFixture(text: string): readonly AsciiTask[] {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || parsed['version'] !== 1 || !Array.isArray(parsed['tasks'])) {
    throw new Error('Invalid evals/ascii-transformation.json: expected version 1 and tasks');
  }
  if (parsed['tasks'].length !== 14) {
    throw new Error('Invalid evals/ascii-transformation.json: expected exactly 14 tasks');
  }
  return parsed['tasks'].map((value: unknown, index): AsciiTask => {
    const expectedId = `A${String(index + 1).padStart(2, '0')}`;
    if (
      !isRecord(value) ||
      value['id'] !== expectedId ||
      typeof value['prompt'] !== 'string' ||
      value['prompt'].length === 0 ||
      typeof value['source'] !== 'string' ||
      value['source'].length === 0 ||
      typeof value['maxColumns'] !== 'number' ||
      !Number.isSafeInteger(value['maxColumns']) ||
      value['maxColumns'] <= 0 ||
      !Array.isArray(value['facts']) ||
      value['facts'].length === 0 ||
      !Array.isArray(value['questions']) ||
      value['questions'].length === 0
    ) {
      throw new Error(`Invalid ASCII transformation task ${expectedId}`);
    }
    return {
      id: expectedId,
      prompt: value['prompt'],
      source: value['source'],
      maxColumns: value['maxColumns'],
    };
  });
}

function parseSuppressionFixture(text: string): readonly SuppressionTask[] {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || !Array.isArray(parsed['evals']) || parsed['evals'].length !== 20) {
    throw new Error('Invalid evals/evals.json: expected the frozen 20-task set');
  }
  const selected = parsed['evals'].flatMap((value: unknown): readonly SuppressionTask[] => {
    if (!isRecord(value)) throw new Error('Invalid original evaluation task');
    if (value['category'] !== 'should-not-trigger') return [];
    if (
      typeof value['id'] !== 'number' ||
      !Number.isSafeInteger(value['id']) ||
      typeof value['prompt'] !== 'string' ||
      value['prompt'].length === 0
    ) {
      throw new Error('Invalid original suppression task');
    }
    return [{ id: `R${value['id']}`, prompt: value['prompt'] }];
  });
  if (selected.length !== 8 || selected.some((task, index) => task.id !== `R${index + 13}`)) {
    throw new Error('Invalid evals/evals.json: expected suppression tasks R13-R20');
  }
  return selected;
}

function generationPrompt(task: AsciiTask): string {
  return `${task.prompt}\n\n${task.source}\n\nMaximum diagram width: ${task.maxColumns} display columns. ASCII means ASCII structural marks with source-language Unicode labels permitted. Preserve names and use fenced monospaced text for the visual.`;
}

function nativeActivation(taskId: string, suite: Suite): 'explicit' | 'automatic' {
  if (suite === 'original-suppression') return 'explicit';
  return EXPLICIT_NATIVE_TASKS.includes(taskId) ? 'explicit' : 'automatic';
}

function armPrompt(arm: Arm, prompt: string, activation: 'explicit' | 'automatic' | null): string {
  return arm === 'native' && activation === 'explicit'
    ? `${NATIVE_INVOCATION_PREFIX}\n\n${prompt}`
    : prompt;
}

function rotated<T>(values: readonly T[], offset: number): readonly T[] {
  const start = offset % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

function buildCallPlan(
  asciiTasks: readonly AsciiTask[],
  suppressionTasks: readonly SuppressionTask[],
): readonly GenerationCall[] {
  const threeArms: readonly Arm[] = ['baseline', 'native', 'hook'];
  const twoArms: readonly Arm[] = ['native', 'hook'];
  const transformations = asciiTasks.flatMap((task, index) =>
    rotated(threeArms, index + 2).map((arm): GenerationCall => ({
      id: `${task.id}-${arm}`,
      taskId: task.id,
      suite: 'ascii-transformation',
      arm,
      prompt: armPrompt(
        arm,
        generationPrompt(task),
        arm === 'native' ? nativeActivation(task.id, 'ascii-transformation') : null,
      ),
      maxColumns: task.maxColumns,
      setting: null,
      nativeActivation: arm === 'native' ? nativeActivation(task.id, 'ascii-transformation') : null,
    })),
  );
  const suppressions = suppressionTasks.flatMap((task, index) =>
    rotated(twoArms, index).map((arm): GenerationCall => ({
      id: `${task.id}-${arm}`,
      taskId: task.id,
      suite: 'original-suppression',
      arm,
      prompt: armPrompt(
        arm,
        task.prompt,
        arm === 'native' ? nativeActivation(task.id, 'original-suppression') : null,
      ),
      maxColumns: null,
      setting: null,
      nativeActivation: arm === 'native' ? nativeActivation(task.id, 'original-suppression') : null,
    })),
  );
  const settingsTask = asciiTasks.find((task) => task.id === SETTINGS_TASK_ID);
  if (settingsTask === undefined)
    throw new Error(`Missing settings probe task ${SETTINGS_TASK_ID}`);
  const intensities: readonly Intensity[] = ['lite', 'full', 'ultra'];
  const styles: readonly OutputStyle[] = ['short', 'middle', 'full'];
  const settings = intensities.flatMap((intensity) =>
    styles.map((outputStyle): GenerationCall => ({
      id: `SET-${intensity}-${outputStyle}`,
      taskId: `SET-${intensity}-${outputStyle}`,
      suite: 'settings-matrix',
      arm: 'hook',
      prompt: generationPrompt(settingsTask),
      maxColumns: settingsTask.maxColumns,
      setting: { intensity, outputStyle },
      nativeActivation: null,
    })),
  );
  const plan = [...transformations, ...suppressions, ...settings];
  if (plan.length !== EXPECTED_MODEL_CALLS) {
    throw new Error(
      `Internal error: expected ${EXPECTED_MODEL_CALLS} model calls, got ${plan.length}`,
    );
  }
  return plan;
}

function selectCalls(
  plan: readonly GenerationCall[],
  taskIds: readonly string[],
  arms: readonly Arm[],
): readonly GenerationCall[] {
  const requestedTasks = new Set(taskIds);
  const requestedArms = new Set(arms);
  const knownTasks = new Set(plan.map((call) => call.taskId));
  const unknownTasks = taskIds.filter((taskId) => !knownTasks.has(taskId));
  if (unknownTasks.length > 0) throw new Error(`Unknown task ID: ${unknownTasks.join(', ')}`);
  return plan.filter(
    (call) =>
      (requestedTasks.size === 0 || requestedTasks.has(call.taskId)) &&
      (requestedArms.size === 0 || requestedArms.has(call.arm)),
  );
}

function isolatedEnvironment(
  environment: Readonly<NodeJS.ProcessEnv>,
  home: string,
  codexHome: string,
): Readonly<NodeJS.ProcessEnv> {
  const network = Object.fromEntries(
    Object.entries(environment).filter(([name]) => NETWORK_VARIABLE.test(name)),
  );
  return {
    PATH: environment['PATH'],
    HOME: home,
    CODEX_HOME: codexHome,
    NO_COLOR: '1',
    ...network,
  };
}

function createIsolatedHome(
  arm: Arm,
  temporaryRoot: string,
  authSource: string,
  environment: Readonly<NodeJS.ProcessEnv>,
): IsolatedHome {
  const home = fs.mkdtempSync(path.join(temporaryRoot, `feynman-ascii-${arm}-`));
  try {
    const codexHome = path.join(home, '.codex');
    fs.mkdirSync(codexHome, { mode: 0o700 });
    const authTarget = path.join(codexHome, 'auth.json');
    fs.copyFileSync(authSource, authTarget);
    fs.chmodSync(authTarget, 0o600);
    return {
      arm,
      home,
      codexHome,
      environment: isolatedEnvironment(environment, home, codexHome),
    };
  } catch (error) {
    fs.rmSync(home, { recursive: true, force: true });
    throw error instanceof Error ? error : new Error(errorMessage(error));
  }
}

function fileHash(file: string): string | null {
  try {
    return sha256(fs.readFileSync(file));
  } catch {
    return null;
  }
}

function pathExists(file: string): boolean {
  return fs.existsSync(file);
}

function baselineSnapshot(home: IsolatedHome): Readonly<Record<string, unknown>> {
  return {
    hooksPresent: pathExists(path.join(home.codexHome, 'hooks.json')),
    globalInstructionsPresent: pathExists(path.join(home.codexHome, 'AGENTS.md')),
    userSkillsPresent: pathExists(path.join(home.codexHome, 'skills')),
    feynmanStatePresent: pathExists(path.join(home.codexHome, '.feynman')),
    feynmanActivePresent: pathExists(path.join(home.codexHome, '.feynman-active')),
    pluginCachePresent: pathExists(path.join(home.codexHome, 'plugins', 'cache', 'feynman')),
  };
}

function hookPreferenceSnapshot(home: IsolatedHome): Readonly<Record<string, unknown>> {
  const statePath = path.join(home.codexHome, '.feynman', 'state.json');
  const preferences = readHookPreferences(statePath);
  return {
    preferences,
    configHash: fileHash(path.join(home.codexHome, 'config.toml')),
    hooksHash: fileHash(path.join(home.codexHome, 'hooks.json')),
    activeFlagHash: fileHash(path.join(home.codexHome, '.feynman-active')),
  };
}

function readHookPreferences(statePath: string): unknown {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return isRecord(parsed)
      ? {
          enabled: parsed['enabled'],
          intensity: parsed['intensity'],
          output_style: parsed['output_style'],
        }
      : null;
  } catch {
    return null;
  }
}

function nativeSnapshot(
  home: IsolatedHome,
  installed: InstalledSkill,
): Readonly<Record<string, unknown>> {
  return {
    hooksPresent: pathExists(path.join(home.codexHome, 'hooks.json')),
    feynmanStatePresent: pathExists(path.join(home.codexHome, '.feynman')),
    feynmanActivePresent: pathExists(path.join(home.codexHome, '.feynman-active')),
    configHash: fileHash(path.join(home.codexHome, 'config.toml')),
    skillHash: fileHash(installed.path),
    settingsHash: fileHash(installed.settingsPath),
  };
}

function sameSnapshot(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function parseJsonLines(
  stdout: string,
):
  | { readonly events: readonly unknown[]; readonly parseError: null }
  | { readonly events: readonly unknown[]; readonly parseError: string } {
  if (stdout.trim().length === 0) return { events: [], parseError: null };
  try {
    const events = stdout
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line): unknown => JSON.parse(line));
    return { events, parseError: null };
  } catch (error) {
    return { events: [], parseError: errorMessage(error) };
  }
}

function eventSummary(events: readonly unknown[]): Readonly<{
  eventTypes: readonly string[];
  itemTypes: readonly string[];
  activityItemTypes: readonly string[];
  commands: readonly string[];
  commandExecutions: readonly Readonly<{
    command: string;
    aggregatedOutput: string | null;
    exitCode: number | null;
    status: string | null;
  }>[];
  answer: string;
  usage: unknown;
  completed: boolean;
  hookStarted: boolean;
  hookCompleted: boolean;
}> {
  const records = events.filter(isRecord);
  const activityItems = records
    .filter((event) => event['type'] === 'item.started' || event['type'] === 'item.completed')
    .map((event) => event['item'])
    .filter(isRecord);
  const items = records
    .filter((event) => event['type'] === 'item.completed')
    .map((event) => event['item'])
    .filter(isRecord);
  const eventTypes = records.map((event) =>
    typeof event['type'] === 'string' ? event['type'] : 'unknown',
  );
  const itemTypes = items.map((item) =>
    typeof item['type'] === 'string' ? item['type'] : 'unknown',
  );
  const activityItemTypes = activityItems.map((item) =>
    typeof item['type'] === 'string' ? item['type'] : 'unknown',
  );
  const commandExecutions = items
    .filter((item) => item['type'] === 'command_execution')
    .map((item) => ({
      command: typeof item['command'] === 'string' ? item['command'] : '',
      aggregatedOutput:
        typeof item['aggregated_output'] === 'string' ? item['aggregated_output'] : null,
      exitCode: typeof item['exit_code'] === 'number' ? item['exit_code'] : null,
      status: typeof item['status'] === 'string' ? item['status'] : null,
    }));
  const commands = commandExecutions.map((execution) => execution.command);
  const answer = items
    .filter((item) => item['type'] === 'agent_message')
    .map((item) => (typeof item['text'] === 'string' ? item['text'] : ''))
    .join('\n');
  const completion = records.find((event) => event['type'] === 'turn.completed');
  const normalizedTypes = [...eventTypes, ...itemTypes].map((type) =>
    type.toLowerCase().replaceAll(/[^a-z]/g, ''),
  );
  return {
    eventTypes,
    itemTypes,
    activityItemTypes,
    commands,
    commandExecutions,
    answer,
    usage: completion?.['usage'] ?? 'unavailable',
    completed: completion !== undefined,
    hookStarted: normalizedTypes.some((type) => type.includes('hookstart')),
    hookCompleted: normalizedTypes.some(
      (type) =>
        type.includes('hookcomplete') || type.includes('hookfinish') || type.includes('hookend'),
    ),
  };
}

function readInjectionCount(codexHome: string): number | null {
  const counterPath = path.join(codexHome, '.feynman', 'injections');
  try {
    const value = fs.readFileSync(counterPath, 'utf8').trim();
    const count = Number(value);
    return /^\d+$/.test(value) && Number.isSafeInteger(count) ? count : null;
  } catch {
    const statePath = path.join(codexHome, '.feynman', 'state.json');
    try {
      const state: unknown = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (!isRecord(state) || typeof state['injections'] !== 'number') return null;
      return Number.isSafeInteger(state['injections']) ? state['injections'] : null;
    } catch {
      return null;
    }
  }
}

function saveCommandEvidence(output: string, stem: string, result: EvaluationCommandResult): void {
  fs.writeFileSync(path.join(output, `${stem}.stdout.txt`), result.stdout);
  fs.writeFileSync(path.join(output, `${stem}.stderr.txt`), result.stderr);
  writeJson(path.join(output, `${stem}.status.json`), {
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
  });
}

function runRecordedCommand(
  runner: EvaluationCommandRunner,
  output: string,
  stem: string,
  command: string,
  args: readonly string[],
  options: Readonly<{
    cwd?: string;
    encoding: 'utf8';
    env?: Readonly<NodeJS.ProcessEnv>;
    timeout?: number;
    maxBuffer?: number;
  }>,
): void {
  const result = runner(command, args, options);
  saveCommandEvidence(output, stem, result);
  if (commandFailed(result)) {
    const diagnostic = commandDiagnostic(result);
    throw new Error(`${stem} failed${diagnostic.length === 0 ? '' : `:\n${diagnostic}`}`);
  }
}

function buildAndVerifyArtifact(
  root: string,
  output: string,
  runner: EvaluationCommandRunner,
  environment: Readonly<NodeJS.ProcessEnv>,
): PackagedArtifact {
  const buildEnvironment: Readonly<NodeJS.ProcessEnv> = {
    ...environment,
    NO_COLOR: '1',
    npm_config_offline: 'true',
  };
  runRecordedCommand(runner, output, 'package-build', 'npm', ['run', 'build'], {
    cwd: root,
    encoding: 'utf8',
    env: buildEnvironment,
    timeout: 120_000,
    maxBuffer: MAX_BUFFER_BYTES,
  });
  const pointer = path.join(root, 'dist', 'TARBALL.txt');
  if (!fs.existsSync(pointer)) throw new Error('Package build did not create dist/TARBALL.txt');
  const pointerText = fs.readFileSync(pointer, 'utf8');
  const relativeTarball = pointerText.trim();
  if (relativeTarball.length === 0 || path.isAbsolute(relativeTarball)) {
    throw new Error('dist/TARBALL.txt must name a repository-relative artifact');
  }
  const tarball = path.resolve(root, relativeTarball);
  const distRoot = `${path.resolve(root, 'dist')}${path.sep}`;
  if (!tarball.startsWith(distRoot) || !fs.existsSync(tarball)) {
    throw new Error('dist/TARBALL.txt points outside dist or to a missing artifact');
  }
  runRecordedCommand(runner, output, 'package-release-smoke', 'npm', ['run', 'test:release'], {
    cwd: root,
    encoding: 'utf8',
    env: buildEnvironment,
    timeout: 120_000,
    maxBuffer: MAX_BUFFER_BYTES,
  });
  const tarballBytes = fs.readFileSync(tarball);
  const tarballHash = sha256(tarballBytes);
  const frozenTarball = path.join(output, 'candidate-package.tgz');
  fs.writeFileSync(frozenTarball, tarballBytes, { flag: 'wx', mode: 0o400 });
  if (fileHash(frozenTarball) !== tarballHash) {
    throw new Error('Frozen candidate package differs from the verified build artifact');
  }
  return {
    tarball: frozenTarball,
    tarballHash,
    pointerHash: sha256(pointerText),
  };
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

function extractPackagedArtifact(
  root: string,
  output: string,
  artifact: PackagedArtifact,
  home: IsolatedHome,
  runner: EvaluationCommandRunner,
): string {
  const extractionRoot = path.join(home.home, 'artifact');
  fs.mkdirSync(extractionRoot, { mode: 0o700 });
  runRecordedCommand(
    runner,
    output,
    `${home.arm}-package-extract`,
    'tar',
    ['-xzf', artifact.tarball, '-C', extractionRoot],
    {
      cwd: root,
      encoding: 'utf8',
      env: home.environment,
      timeout: 30_000,
      maxBuffer: MAX_BUFFER_BYTES,
    },
  );
  const packageRoot = path.join(extractionRoot, 'package');
  const comparisons: readonly (readonly [string, string])[] = [
    ['plugins/feynman/skills/feynman/SKILL.md', 'plugins/feynman/skills/feynman/SKILL.md'],
    [
      'plugins/feynman/skills/feynman/references/settings.md',
      'plugins/feynman/skills/feynman/references/settings.md',
    ],
    ['rules/feynman-contract.md', 'rules/feynman-contract.md'],
  ];
  for (const [packagedPath, sourcePath] of comparisons) {
    const packaged = path.join(packageRoot, packagedPath);
    const source = path.join(root, sourcePath);
    if (!fs.existsSync(packaged) || !fs.readFileSync(packaged).equals(fs.readFileSync(source))) {
      throw new Error(`Packaged delivery differs from recorded source: ${packagedPath}`);
    }
  }
  if (!fs.existsSync(path.join(packageRoot, 'bin', 'feynman.js'))) {
    throw new Error('Packaged feynman CLI is missing');
  }
  writeJson(path.join(output, `${home.arm}-package-verification.json`), {
    tarballHash: artifact.tarballHash,
    extractedUnderIsolatedHome: true,
    skillMatchesSource: true,
    settingsMatchSource: true,
    rulesMatchSource: true,
    packagedCliPresent: true,
  });
  return packageRoot;
}

function checkedSetupCommand(
  runner: EvaluationCommandRunner,
  output: string,
  stem: string,
  command: string,
  args: readonly string[],
  home: IsolatedHome,
): void {
  const result = runner(command, args, {
    cwd: home.home,
    encoding: 'utf8',
    env: home.environment,
    timeout: 30_000,
    maxBuffer: MAX_BUFFER_BYTES,
  });
  saveCommandEvidence(output, stem, result);
  if (commandFailed(result)) {
    throw new Error(
      `${stem} failed${commandDiagnostic(result).length === 0 ? '' : `:\n${commandDiagnostic(result)}`}`,
    );
  }
}

function canonicalPath(file: string): string {
  return fs.realpathSync(file);
}

function installedSkillFromDiscovery(
  result: unknown,
  codexHome: string,
  sourceSkill: string,
  sourceSettings: string,
): InstalledSkill {
  if (!isRecord(result) || !Array.isArray(result['data'])) {
    throw new Error('skills/list returned no data');
  }
  const skills = result['data'].flatMap((entry: unknown): readonly unknown[] => {
    return isRecord(entry) && Array.isArray(entry['skills']) ? entry['skills'] : [];
  });
  const installed = skills.find(
    (skill) =>
      isRecord(skill) &&
      skill['pluginId'] === NATIVE_PLUGIN_ID &&
      skill['enabled'] === true &&
      typeof skill['path'] === 'string',
  );
  if (!isRecord(installed) || typeof installed['path'] !== 'string') {
    throw new Error('Installed feynman skill was not discovered');
  }
  const installedPath = canonicalPath(installed['path']);
  const canonicalCodexHome = `${canonicalPath(codexHome)}${path.sep}`;
  if (!installedPath.startsWith(canonicalCodexHome)) {
    throw new Error('Discovered feynman skill is outside the isolated CODEX_HOME');
  }
  const settingsPath = path.join(path.dirname(installedPath), 'references', 'settings.md');
  if (!fs.existsSync(settingsPath))
    throw new Error('Installed feynman settings reference is missing');
  if (!fs.readFileSync(installedPath).equals(fs.readFileSync(sourceSkill))) {
    throw new Error('Installed feynman SKILL.md differs from source');
  }
  if (!fs.readFileSync(settingsPath).equals(fs.readFileSync(sourceSettings))) {
    throw new Error('Installed feynman settings reference differs from source');
  }
  return { path: installedPath, settingsPath };
}

async function setupNative(
  packageRoot: string,
  output: string,
  home: IsolatedHome,
  runner: EvaluationCommandRunner,
  discover: SkillDiscoveryRunner,
): Promise<InstalledSkill> {
  checkedSetupCommand(
    runner,
    output,
    'native-marketplace-add',
    'codex',
    ['plugin', 'marketplace', 'add', packageRoot, '--json'],
    home,
  );
  checkedSetupCommand(
    runner,
    output,
    'native-plugin-add',
    'codex',
    ['plugin', 'add', NATIVE_PLUGIN_ID, '--json'],
    home,
  );
  const discovery = await discover(home.environment, home.home);
  fs.writeFileSync(path.join(output, 'native-skills-list.events.jsonl'), discovery.stdout);
  fs.writeFileSync(path.join(output, 'native-skills-list.stderr.txt'), discovery.stderr);
  writeJson(path.join(output, 'native-skills-list.status.json'), {
    status: discovery.status,
    error: discovery.error ?? null,
  });
  if (discovery.status !== 0 || discovery.error !== undefined) {
    throw new Error(
      `skills/list failed${discovery.error === undefined ? '' : `: ${discovery.error}`}`,
    );
  }
  const sourceSkill = path.join(packageRoot, 'plugins', 'feynman', 'skills', 'feynman', 'SKILL.md');
  const sourceSettings = path.join(
    packageRoot,
    'plugins',
    'feynman',
    'skills',
    'feynman',
    'references',
    'settings.md',
  );
  const installed = installedSkillFromDiscovery(
    discovery.result,
    home.codexHome,
    sourceSkill,
    sourceSettings,
  );
  writeJson(path.join(output, 'native-skill-verification.json'), {
    pluginId: NATIVE_PLUGIN_ID,
    installedSkillPath: installed.path,
    underIsolatedCodexHome: true,
    skillMatchesSource: true,
    settingsMatchSource: true,
    skillHash: fileHash(installed.path),
    settingsHash: fileHash(installed.settingsPath),
  });
  return installed;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function installHookCaptureWrapper(root: string, output: string, home: IsolatedHome): HookWrapper {
  const hooksPath = path.join(home.codexHome, 'hooks.json');
  const parsed: unknown = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  if (!isRecord(parsed) || !isRecord(parsed['hooks'])) {
    throw new Error('Installed hooks.json has no hooks object');
  }
  const groups = parsed['hooks']['SessionStart'];
  if (!Array.isArray(groups)) throw new Error('Installed hooks.json has no SessionStart groups');
  const originalCommands = groups.flatMap((group): readonly string[] => {
    if (!isRecord(group) || !Array.isArray(group['hooks'])) return [];
    return group['hooks'].flatMap((hook): readonly string[] => {
      if (!isRecord(hook) || typeof hook['command'] !== 'string') return [];
      return hook['command'].includes('feynman-session-start.') ? [hook['command']] : [];
    });
  });
  if (originalCommands.length !== 1 || originalCommands[0] === undefined) {
    throw new Error('Expected exactly one installed Feynman SessionStart command');
  }
  const originalCommand = originalCommands[0];
  const adapterSource = path.join(root, 'scripts', 'capture-evaluation-hook.ts');
  const adapterBytes = fs.readFileSync(adapterSource);
  const adapterHash = sha256(adapterBytes);
  const adapterPath = path.join(home.home, 'artifact', 'evaluation', 'capture-evaluation-hook.ts');
  fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
  fs.writeFileSync(adapterPath, adapterBytes, { flag: 'wx', mode: 0o500 });
  const evidenceCopy = path.join(output, 'capture-evaluation-hook.ts');
  fs.writeFileSync(evidenceCopy, adapterBytes, { flag: 'wx', mode: 0o400 });
  if (fileHash(adapterPath) !== adapterHash || fileHash(evidenceCopy) !== adapterHash) {
    throw new Error('Frozen hook capture adapter differs from its source bytes');
  }
  const encodedCommand = Buffer.from(originalCommand).toString('base64url');
  const wrappedCommand = [
    shellQuote(process.execPath),
    shellQuote(adapterPath),
    shellQuote(encodedCommand),
  ].join(' ');
  const wrappedGroups = (groups as readonly unknown[]).map((group): unknown => {
    if (!isRecord(group) || !Array.isArray(group['hooks'])) return group;
    const groupHooks: readonly unknown[] = group['hooks'];
    return {
      ...group,
      hooks: groupHooks.map((hook): unknown =>
        isRecord(hook) && hook['command'] === originalCommand
          ? { ...hook, command: wrappedCommand }
          : hook,
      ),
    };
  });
  writeJson(hooksPath, {
    ...parsed,
    hooks: { ...parsed['hooks'], SessionStart: wrappedGroups },
  });
  const wrapper = { originalCommand, wrappedCommand, adapterPath, adapterHash };
  writeJson(path.join(output, 'hook-capture-wrapper.json'), wrapper);
  return wrapper;
}

async function setupHook(
  root: string,
  packageRoot: string,
  output: string,
  home: IsolatedHome,
  runner: EvaluationCommandRunner,
  trustHooks: HookTrustRunner,
): Promise<HookWrapper> {
  fs.writeFileSync(path.join(home.codexHome, 'config.toml'), '[features]\nhooks = true\n', {
    mode: 0o600,
  });
  checkedSetupCommand(
    runner,
    output,
    'hook-install',
    process.execPath,
    [path.join(packageRoot, 'bin', 'feynman.js'), 'install'],
    home,
  );
  if (
    !fs.existsSync(path.join(home.codexHome, 'hooks.json')) ||
    !fs.existsSync(path.join(home.codexHome, '.feynman', 'state.json')) ||
    !fs.existsSync(path.join(home.codexHome, '.feynman-active'))
  ) {
    throw new Error('Hook install did not create its isolated hook and state files');
  }
  writeJson(path.join(output, 'hook-install-verification.json'), {
    hooksFeatureEnabled: true,
    hooksPresent: true,
    statePresent: true,
    activeFlagPresent: true,
    injectionsBeforeRequests: readInjectionCount(home.codexHome),
  });
  const wrapper = installHookCaptureWrapper(root, output, home);
  const trust = await trustHooks(home.environment, home.home);
  fs.writeFileSync(path.join(output, 'hook-trust.events.jsonl'), trust.stdout);
  fs.writeFileSync(path.join(output, 'hook-trust.stderr.txt'), trust.stderr);
  writeJson(path.join(output, 'hook-trust.status.json'), {
    status: trust.status,
    error: trust.error ?? null,
  });
  if (trust.status !== 0 || trust.error !== undefined) {
    throw new Error(`Hook trust failed${trust.error === undefined ? '' : `: ${trust.error}`}`);
  }
  const sessionStartHooks = listedHooks(trust.verified).filter(
    (hook) => hook.eventName === 'sessionStart' && hook.command === wrapper.wrappedCommand,
  );
  const trustedCount = sessionStartHooks.filter((hook) => hook.trustStatus === 'trusted').length;
  if (sessionStartHooks.length === 0 || trustedCount !== sessionStartHooks.length) {
    throw new Error('Hook trust verification did not prove every SessionStart hook trusted');
  }
  writeJson(path.join(output, 'hook-trust-verification.json'), {
    sessionStartHooks: sessionStartHooks.length,
    trustedSessionStartHooks: trustedCount,
    allSessionStartHooksTrusted: true,
  });
  return wrapper;
}

function applySetting(
  packageRoot: string,
  output: string,
  call: GenerationCall,
  home: IsolatedHome,
  runner: EvaluationCommandRunner,
): void {
  if (call.setting === null) return;
  checkedSetupCommand(
    runner,
    output,
    `${call.id}-set-intensity`,
    process.execPath,
    [path.join(packageRoot, 'bin', 'feynman.js'), 'state', call.setting.intensity],
    home,
  );
  checkedSetupCommand(
    runner,
    output,
    `${call.id}-set-style`,
    process.execPath,
    [path.join(packageRoot, 'bin', 'feynman.js'), 'state', 'style', call.setting.outputStyle],
    home,
  );
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

function sourceFileHashes(root: string): Readonly<{
  marketplaceHash: string;
  pluginManifestHash: string;
  skillHash: string;
  settingsHash: string;
  rulesHash: string;
  captureAdapterHash: string;
}> {
  const read = (...segments: readonly string[]): Buffer =>
    fs.readFileSync(path.join(root, ...segments));
  return {
    marketplaceHash: sha256(read('.agents', 'plugins', 'marketplace.json')),
    pluginManifestHash: sha256(read('plugins', 'feynman', '.codex-plugin', 'plugin.json')),
    skillHash: sha256(read('plugins', 'feynman', 'skills', 'feynman', 'SKILL.md')),
    settingsHash: sha256(
      read('plugins', 'feynman', 'skills', 'feynman', 'references', 'settings.md'),
    ),
    rulesHash: sha256(read('rules', 'feynman-contract.md')),
    captureAdapterHash: sha256(read('scripts', 'capture-evaluation-hook.ts')),
  };
}

function newManifest(
  options: Readonly<{
    development: boolean;
    model: string;
    sourceHead: string;
    sourceTree: string;
    sourceStatus: string;
    sourceDiff: string;
    runnerHash: string;
    asciiFixtureHash: string;
    suppressionFixtureHash: string;
    protocolHash: string;
    artifact: PackagedArtifact;
    codexVersion: string;
    selectedCalls: readonly GenerationCall[];
    selectedTaskIds: readonly string[];
    selectedArms: readonly Arm[];
    startedAt: string;
    sourceFiles: ReturnType<typeof sourceFileHashes>;
  }>,
): ManifestState {
  return {
    protocol: 1,
    mode: options.development ? 'development' : 'final',
    model: options.model,
    reasoning: REASONING,
    sourceHead: options.sourceHead,
    sourceTree: options.sourceTree,
    sourceStatus: options.sourceStatus,
    sourceStatusHash: sha256(options.sourceStatus),
    sourceDiffHash: sha256(options.sourceDiff),
    sourceHash: sha256(
      `${options.sourceHead}\0${options.sourceTree}\0${options.sourceStatus}\0${options.sourceDiff}`,
    ),
    runnerHash: options.runnerHash,
    asciiFixtureHash: options.asciiFixtureHash,
    suppressionFixtureHash: options.suppressionFixtureHash,
    protocolHash: options.protocolHash,
    promptTemplateHash: sha256(PROMPT_TEMPLATE),
    promptTemplate: PROMPT_TEMPLATE,
    nativeInvocationPrefix: NATIVE_INVOCATION_PREFIX,
    nativeInvocationPrefixHash: sha256(NATIVE_INVOCATION_PREFIX),
    packageTarballHash: options.artifact.tarballHash,
    packagePointerHash: options.artifact.pointerHash,
    ...options.sourceFiles,
    runtime: {
      node: process.version,
      codex: options.codexVersion,
      platform: process.platform,
      architecture: process.arch,
      release: os.release(),
    },
    expectedFullModelCalls: EXPECTED_MODEL_CALLS,
    baselineIncluded: true,
    nativeActivation: {
      explicitMainTaskIds: EXPLICIT_NATIVE_TASKS,
      automaticMainTaskIds: AUTOMATIC_NATIVE_TASKS,
      suppression: 'explicit',
    },
    providerBuildFingerprint: 'unavailable',
    selectedModelCalls: options.selectedCalls.length,
    selectedTaskIds: options.selectedTaskIds.length === 0 ? 'all' : options.selectedTaskIds,
    selectedArms: options.selectedArms.length === 0 ? 'all' : options.selectedArms,
    startedAt: options.startedAt,
    generationComplete: false,
    fullGenerationComplete: false,
    acceptanceComplete: false,
    eligibleForReview: false,
    acceptanceEvidence: {
      externalBlindReview: 'missing',
      externalToolReview: 'missing',
    },
    attemptsRecorded: 0,
    stoppedAfterFailure: false,
  };
}

function withManifestProgress(
  manifest: ManifestState,
  progress: Readonly<{
    generationComplete: boolean;
    fullGenerationComplete: boolean;
    acceptanceComplete: boolean;
    eligibleForReview: boolean;
    attemptsRecorded: number;
    stoppedAfterFailure: boolean;
    completedAt?: string;
    failure?: string;
  }>,
): ManifestState {
  return { ...manifest, ...progress };
}

function writeGenerationInputs(output: string, calls: readonly GenerationCall[]): void {
  writeJson(
    path.join(output, 'generation-inputs.json'),
    calls.map((call) => ({
      id: call.id,
      taskId: call.taskId,
      suite: call.suite,
      arm: call.arm,
      nativeActivation: call.nativeActivation,
      prompt: call.prompt,
      promptHash: sha256(call.prompt),
      maxColumns: call.maxColumns,
      setting: call.setting,
    })),
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
    let stdout = '';
    let stderr = '';
    let buffer = '';
    let settled = false;
    let skillsRequestSent = false;
    const finish = (status: number, result: unknown, error?: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      resolve({ status, stdout, stderr, result, ...(error === undefined ? {} : { error }) });
    };
    const sendSkillsRequest = (): void => {
      if (skillsRequestSent) return;
      skillsRequestSent = true;
      child.stdin.write(`${skillsRequest}\n`);
    };
    const timer = setTimeout(() => {
      finish(1, null, 'skills/list timed out');
    }, 10_000);
    child.stdout.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stdout) + chunk.length > MAX_BUFFER_BYTES) {
        finish(1, null, 'skills/list stdout exceeded the byte limit');
        return;
      }
      const text = chunk.toString();
      stdout += text;
      buffer += text;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        handleDiscoveryLine(line, sendSkillsRequest, finish);
        newline = buffer.indexOf('\n');
      }
    });
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

function listedHooks(value: unknown): readonly ListedHook[] {
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
    let stdout = '';
    let stderr = '';
    let buffer = '';
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
        stdout,
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
    child.stdout.on('data', (chunk: Buffer) => {
      if (Buffer.byteLength(stdout) + chunk.length > MAX_BUFFER_BYTES) {
        finish(1, 'hook trust stdout exceeded the byte limit');
        return;
      }
      const text = chunk.toString();
      stdout += text;
      buffer += text;
      let newline = buffer.indexOf('\n');
      while (newline >= 0 && !settled) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim().length > 0) {
          try {
            const message: unknown = JSON.parse(line);
            if (isRecord(message) && typeof message['id'] === 'number') {
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
            }
          } catch (error) {
            finish(1, `Invalid hook trust app-server response: ${errorMessage(error)}`);
          }
        }
        newline = buffer.indexOf('\n');
      }
    });
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

interface DeliveryContext {
  readonly homesByArm: ReadonlyMap<Arm, IsolatedHome>;
  readonly packageRootsByArm: ReadonlyMap<Arm, string>;
  readonly installedSkill: InstalledSkill | null;
  readonly nativeInitial: Readonly<Record<string, unknown>> | null;
  readonly hookWrapper: HookWrapper | null;
}

type ExecutionResult =
  | { readonly kind: 'success'; readonly manifest: ManifestState }
  | { readonly kind: 'failure'; readonly manifest: ManifestState; readonly error: Error };

function createSelectedHomes(
  arms: readonly Arm[],
  temporaryRoot: string,
  authSource: string,
  environment: Readonly<NodeJS.ProcessEnv>,
): readonly IsolatedHome[] {
  const [arm, ...remaining] = arms;
  if (arm === undefined) return [];
  const home = createIsolatedHome(arm, temporaryRoot, authSource, environment);
  try {
    return [home, ...createSelectedHomes(remaining, temporaryRoot, authSource, environment)];
  } catch (error) {
    fs.rmSync(home.home, { recursive: true, force: true });
    throw error instanceof Error ? error : new Error(errorMessage(error));
  }
}

async function configureDeliveries(
  root: string,
  output: string,
  homes: readonly IsolatedHome[],
  artifact: PackagedArtifact,
  runner: EvaluationCommandRunner,
  discover: SkillDiscoveryRunner,
  trustHooks: HookTrustRunner,
): Promise<DeliveryContext> {
  const homesByArm: ReadonlyMap<Arm, IsolatedHome> = new Map(homes.map((home) => [home.arm, home]));
  const packageRootsByArm: ReadonlyMap<Arm, string> = new Map(
    homes
      .filter((home) => home.arm !== 'baseline')
      .map((home) => [home.arm, extractPackagedArtifact(root, output, artifact, home, runner)]),
  );
  const baselineHome = homesByArm.get('baseline');
  if (baselineHome !== undefined) {
    const snapshot = baselineSnapshot(baselineHome);
    writeJson(path.join(output, 'baseline-initial-state.json'), snapshot);
    if (Object.values(snapshot).some((value) => value === true)) {
      throw new Error('Baseline home unexpectedly contains inherited delivery state');
    }
  }
  const nativeHome = homesByArm.get('native');
  const nativePackage = packageRootsByArm.get('native');
  const installedSkill =
    nativeHome === undefined || nativePackage === undefined
      ? null
      : await setupNative(nativePackage, output, nativeHome, runner, discover);
  const nativeInitial =
    nativeHome === undefined || installedSkill === null
      ? null
      : nativeSnapshot(nativeHome, installedSkill);
  if (nativeInitial !== null) {
    writeJson(path.join(output, 'native-initial-state.json'), nativeInitial);
    if (
      nativeInitial['hooksPresent'] === true ||
      nativeInitial['feynmanStatePresent'] === true ||
      nativeInitial['feynmanActivePresent'] === true
    ) {
      throw new Error('Native skill home unexpectedly contains hook state');
    }
  }
  const hookHome = homesByArm.get('hook');
  const hookPackage = packageRootsByArm.get('hook');
  const hookWrapper =
    hookHome === undefined || hookPackage === undefined
      ? null
      : await setupHook(root, hookPackage, output, hookHome, runner, trustHooks);
  return { homesByArm, packageRootsByArm, installedSkill, nativeInitial, hookWrapper };
}

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
    runnerHash: sha256(fs.readFileSync(import.meta.filename)),
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
  const homes = createSelectedHomes(selectedArms, temporaryRoot, authSource, environment);
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
