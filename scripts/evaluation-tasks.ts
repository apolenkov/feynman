export const USEFULNESS_PREAMBLE =
  'These facts completely define the fictional system for this task.';

interface EvaluationTask {
  readonly id: number;
  readonly sourceTaskId: number | string;
  readonly suite: 'regression' | 'usefulness';
  readonly prompt: string;
}

interface UsefulnessFact {
  readonly id: string;
  readonly text: string;
}

export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseOriginalTasks(text: string): readonly EvaluationTask[] {
  const parsed: unknown = JSON.parse(text);
  if (!record(parsed) || !Array.isArray(parsed['evals']) || parsed['evals'].length !== 20)
    throw new Error('Expected the frozen 20-task evaluation set');
  const tasks = parsed['evals'].map((task: unknown, index): EvaluationTask => {
    if (!record(task) || task['id'] !== index + 1 || typeof task['prompt'] !== 'string')
      throw new Error('Invalid evaluation task');
    return {
      id: task['id'],
      sourceTaskId: task['id'],
      suite: 'regression',
      prompt: task['prompt'],
    };
  });
  return tasks;
}

function usefulnessPrompt(task: Record<string, unknown>, facts: readonly UsefulnessFact[]): string {
  const prompt = task['prompt'];
  const question = task['comprehensionQuestion'];
  if (typeof prompt !== 'string' || typeof question !== 'string')
    throw new Error('Invalid usefulness evaluation task');
  return `${USEFULNESS_PREAMBLE}\n\n${prompt}\n\n${facts.map(({ id, text }) => `${id}: ${text}`).join('\n')}\n\nComprehension question: ${question}`;
}

export function parseUsefulnessTasks(text: string): readonly EvaluationTask[] {
  const parsed: unknown = JSON.parse(text);
  if (!record(parsed) || !Array.isArray(parsed['tasks']) || parsed['tasks'].length !== 12)
    throw new Error('Expected the frozen 12-task usefulness set');
  return parsed['tasks'].map((task: unknown, index): EvaluationTask => {
    if (!record(task) || task['id'] !== `N${String(index + 1).padStart(2, '0')}`)
      throw new Error('Invalid usefulness evaluation task ID sequence');
    if (!Array.isArray(task['facts']) || task['facts'].length === 0)
      throw new Error('Invalid usefulness evaluation task facts');
    const facts = task['facts'].map((fact: unknown): UsefulnessFact => {
      if (!record(fact) || typeof fact['id'] !== 'string' || typeof fact['text'] !== 'string')
        throw new Error('Invalid usefulness evaluation fact');
      return { id: fact['id'], text: fact['text'] };
    });
    if (
      !Array.isArray(task['requiredFactIds']) ||
      !task['requiredFactIds'].every((id) => typeof id === 'string') ||
      typeof task['answerKey'] !== 'string'
    ) {
      throw new Error('Invalid usefulness evaluation grading data');
    }
    return {
      id: index + 21,
      sourceTaskId: task['id'],
      suite: 'usefulness',
      prompt: usefulnessPrompt(task, facts),
    };
  });
}
