import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
export const REASONING = 'medium';
import {
  isRecord,
  EXPECTED_MODEL_CALLS,
  type Arm,
  type GenerationCall,
  PROMPT_TEMPLATE,
  NATIVE_INVOCATION_PREFIX,
  EXPLICIT_NATIVE_TASKS,
  AUTOMATIC_NATIVE_TASKS,
} from './ascii-call-plan.ts';
import { hash } from 'node:crypto';
import type { EvaluationCommandResult, EvaluationCommandRunner } from './evaluate.ts';

export const MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export interface PackagedArtifact {
  readonly tarball: string;
  readonly tarballHash: string;
  readonly pointerHash: string;
}

export interface ManifestState {
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

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function combinedError(primary: Error, secondary: unknown, label: string): Error {
  return new Error(`${primary.message}\n${label}: ${errorMessage(secondary)}`, { cause: primary });
}

export function sha256(value: string | Buffer): string {
  return hash('sha256', value, 'hex');
}

export function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function commandFailed(result: EvaluationCommandResult): boolean {
  return result.status !== 0 || result.signal !== null || result.error !== undefined;
}

export function commandDiagnostic(result: EvaluationCommandResult): string {
  return [
    result.error?.message ?? '',
    result.signal === null ? '' : `signal ${result.signal}`,
    result.stderr,
    result.stdout,
  ]
    .filter((part) => part.length > 0)
    .join('\n');
}

export function checkedCommand(
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

export function parseJsonLines(
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

export function eventSummary(events: readonly unknown[]): Readonly<{
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

export function readInjectionCount(codexHome: string): number | null {
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

export function saveCommandEvidence(
  output: string,
  stem: string,
  result: EvaluationCommandResult,
): void {
  fs.writeFileSync(path.join(output, `${stem}.stdout.txt`), result.stdout);
  fs.writeFileSync(path.join(output, `${stem}.stderr.txt`), result.stderr);
  writeJson(path.join(output, `${stem}.status.json`), {
    status: result.status,
    signal: result.signal,
    error: result.error?.message ?? null,
  });
}

export function runRecordedCommand(
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

export function buildAndVerifyArtifact(
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

export function sourceFileHashes(root: string): Readonly<{
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

export function newManifest(
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

export function withManifestProgress(
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

export function writeGenerationInputs(output: string, calls: readonly GenerationCall[]): void {
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

export function fileHash(file: string): string | null {
  try {
    return sha256(fs.readFileSync(file));
  } catch {
    return null;
  }
}
