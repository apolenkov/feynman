export const EXPECTED_MODEL_CALLS = 67;

const SETTINGS_TASK_ID = 'A02';

export const NATIVE_INVOCATION_PREFIX = 'Use $feynman for this request.';

export const EXPLICIT_NATIVE_TASKS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`),
);

export const AUTOMATIC_NATIVE_TASKS = Object.freeze(['A11', 'A12', 'A13', 'A14']);

export const PROMPT_TEMPLATE =
  '{prompt}\n\n{source}\n\nMaximum diagram width: {maxColumns} display columns. ' +
  'ASCII means ASCII structural marks with source-language Unicode labels permitted. ' +
  'Preserve names and use fenced monospaced text for the visual.';

export type Arm = 'baseline' | 'native' | 'hook';

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

export interface GenerationCall {
  readonly id: string;
  readonly taskId: string;
  readonly suite: Suite;
  readonly arm: Arm;
  readonly prompt: string;
  readonly maxColumns: number | null;
  readonly setting: Readonly<{ intensity: Intensity; outputStyle: OutputStyle }> | null;
  readonly nativeActivation: 'explicit' | 'automatic' | null;
}

export function parseAsciiFixture(text: string): readonly AsciiTask[] {
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

export function parseSuppressionFixture(text: string): readonly SuppressionTask[] {
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

export function buildCallPlan(
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

export function selectCalls(
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

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
