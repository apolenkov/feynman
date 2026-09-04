import fs from 'node:fs';
import path from 'node:path';
import { EXAMPLES_HELP } from '../cli/help.ts';

interface ExampleEntry {
  readonly name: string;
  readonly title: string;
  readonly question: string;
  readonly path: string;
}

// EXAMPLES_DIR resolves to <repo>/examples.
// import.meta.dirname is bin/commands/, so we need '../../' to reach repo root.
const EXAMPLES_DIR = path.resolve(import.meta.dirname, '..', '..', 'examples');

function examplesIndex(): ExampleEntry[] {
  if (!fs.existsSync(EXAMPLES_DIR)) return [];

  return fs
    .readdirSync(EXAMPLES_DIR)
    .filter((name) => name.endsWith('.md'))
    .toSorted()
    .map((name) => {
      const file = path.join(EXAMPLES_DIR, name);
      const content = fs.readFileSync(file, 'utf8');
      const title = /^#\s*(.+)$/m.exec(content)?.[1]?.trim() ?? name;
      const question = /^> (.*)$/m.exec(content)?.[1]?.trim() ?? '';
      return {
        name: name.replace(/\.md$/, ''),
        title,
        question,
        path: file,
      };
    });
}

export type ExampleArguments =
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly messages: readonly string[] }
  | { readonly kind: 'list' }
  | { readonly kind: 'random' }
  | { readonly kind: 'named'; readonly name: string };

function isNameValue(args: readonly string[], index: number): boolean {
  const value = args[index + 1];
  return value !== undefined && value !== '' && !value.startsWith('-');
}

export function parseExampleArguments(args: readonly string[]): ExampleArguments {
  if (args.includes('--help') || args.includes('-h')) return { kind: 'help' };

  const nameFlagIndices = args.flatMap((arg, index) =>
    arg === '--name' || arg === '-n' ? [index] : [],
  );
  const firstMissingIndex = nameFlagIndices.find((index) => !isNameValue(args, index));
  const validNameIndices = nameFlagIndices.filter((index) => isNameValue(args, index));
  const duplicateIndex = validNameIndices[1];
  if (
    firstMissingIndex !== undefined &&
    (duplicateIndex === undefined || firstMissingIndex < duplicateIndex)
  ) {
    return { kind: 'error', messages: ['feynman examples: --name requires a value'] };
  }
  if (duplicateIndex !== undefined) {
    return { kind: 'error', messages: ['feynman examples: duplicate --name'] };
  }

  const random = args.some((arg) => arg === '--random' || arg === '-r');
  const nameIndex = validNameIndices[0];
  const name = nameIndex === undefined ? undefined : args[nameIndex + 1];
  if (random && name !== undefined) {
    return { kind: 'error', messages: ['feynman examples: use either --random or --name'] };
  }

  const unknown = args.filter((arg, index) => {
    const previous = index > 0 ? args[index - 1] : undefined;
    const consumedAsName =
      previous !== undefined &&
      (previous === '--name' || previous === '-n') &&
      isNameValue(args, index - 1);
    return (
      arg !== '--name' && arg !== '-n' && arg !== '--random' && arg !== '-r' && !consumedAsName
    );
  });
  if (unknown.length > 0) {
    return {
      kind: 'error',
      messages: [
        `feynman examples: unexpected arguments "${unknown.join(' ')}"`,
        'Run `feynman examples --help` for usage.',
      ],
    };
  }
  if (random) return { kind: 'random' };
  if (name !== undefined) return { kind: 'named', name };
  return { kind: 'list' };
}

export function cmdExamples(args: readonly string[]): void {
  const parsed = parseExampleArguments(args);
  if (parsed.kind === 'help') {
    console.log(EXAMPLES_HELP);
    process.exit(0);
  }
  if (parsed.kind === 'error') {
    parsed.messages.forEach((message) => {
      console.error(message);
    });
    process.exit(2);
  }

  const entries = examplesIndex();
  if (!entries.length) {
    console.log('No examples found under examples/.');
    process.exit(0);
  }

  if (parsed.kind === 'random') {
    const entry = entries[Math.floor(Math.random() * entries.length)];
    if (!entry) {
      process.exit(0);
    }
    const content = fs.readFileSync(entry.path, 'utf8');
    console.log(`\n[${entry.name}] ${entry.title}\n`);
    console.log('Question:');
    console.log(entry.question !== '' ? `> ${entry.question}` : '(no question marker found)');
    console.log('\nPreview:\n');
    const lines = content.split('\n').slice(0, 26);
    console.log(lines.join('\n'));
    process.exit(0);
  }

  if (parsed.kind === 'named') {
    const entry = entries.find((item) => item.name === parsed.name);
    if (!entry) {
      console.error(`feynman examples: unknown example '${parsed.name}'`);
      process.exit(2);
    }
    const content = fs.readFileSync(entry.path, 'utf8');
    console.log(`\n[${entry.name}] ${entry.title}\n`);
    console.log(content);
    process.exit(0);
  }

  console.log('Available examples:\n');
  for (const entry of entries) {
    const q = entry.question !== '' ? ` — ${entry.question}` : '';
    console.log(`- ${entry.name}`);
    console.log(`  ${entry.title}${q !== '' ? ` — ${q}` : ''}`);
  }
  process.exit(0);
}
