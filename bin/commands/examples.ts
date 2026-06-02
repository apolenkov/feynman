import fs from 'node:fs';
import path from 'node:path';
import type { ExampleEntry } from '../cli/types.ts';
import { EXAMPLES_HELP } from '../cli/help.ts';

// EXAMPLES_DIR resolves to <repo>/examples.
// import.meta.dirname is bin/commands/, so we need '../../' to reach repo root.
const EXAMPLES_DIR = path.resolve(import.meta.dirname, '..', '..', 'examples');

function examplesIndex(): ExampleEntry[] {
  if (!fs.existsSync(EXAMPLES_DIR)) return [];

  return fs.readdirSync(EXAMPLES_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const file = path.join(EXAMPLES_DIR, name);
      const content = fs.readFileSync(file, 'utf8');
      const title = (content.match(/^#\s*(.+)$/m) ?? [null, name])[1]?.trim() ?? name;
      const question = (content.match(/^> (.*)$/m) ?? [null, ''])[1]?.trim() ?? '';
      return {
        name: name.replace(/\.md$/, ''),
        title,
        question,
        path: file,
      };
    });
}

export function cmdExamples(args: string[]): void {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(EXAMPLES_HELP);
    process.exit(0);
  }

  const entries = examplesIndex();
  if (!entries.length) {
    console.log('No examples found under examples/.');
    process.exit(0);
  }

  let random = false;
  let wantsName: string | null = null;
  const unknown: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';
    if (arg === '--name' || arg === '-n') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        console.error('feynman examples: --name requires a value');
        process.exit(2);
      }
      if (wantsName !== null) {
        console.error('feynman examples: duplicate --name');
        process.exit(2);
      }
      wantsName = value;
      i += 1;
      continue;
    }

    if (arg === '--random' || arg === '-r') {
      random = true;
      continue;
    }

    if (arg.startsWith('-')) {
      unknown.push(arg);
      continue;
    }

    unknown.push(arg);
  }

  if (random && wantsName) {
    console.error('feynman examples: use either --random or --name');
    process.exit(2);
  }

  if (unknown.length > 0) {
    console.error(`feynman examples: unexpected arguments "${unknown.join(' ')}"`);
    console.error('Run `feynman examples --help` for usage.');
    process.exit(2);
  }

  if (random) {
    const entry = entries[Math.floor(Math.random() * entries.length)];
    if (!entry) { process.exit(0); }
    const content = fs.readFileSync(entry.path, 'utf8');
    console.log(`\n[${entry.name}] ${entry.title}\n`);
    console.log('Question:');
    console.log(entry.question ? `> ${entry.question}` : '(no question marker found)');
    console.log('\nPreview:\n');
    const lines = content.split('\n').slice(0, 26);
    console.log(lines.join('\n'));
    process.exit(0);
  }

  if (wantsName) {
    const entry = entries.find((item) => item.name === wantsName);
    if (!entry) {
      console.error(`feynman examples: unknown example '${wantsName}'`);
      process.exit(2);
    }
    const content = fs.readFileSync(entry.path, 'utf8');
    console.log(`\n[${entry.name}] ${entry.title}\n`);
    console.log(content);
    process.exit(0);
  }

  if (args.length === 0) {
    console.log('Available examples:\n');
    for (const entry of entries) {
      const q = entry.question ? ` — ${entry.question}` : '';
      console.log(`- ${entry.name}`);
      console.log(`  ${entry.title}${q ? ` — ${q}` : ''}`);
    }
    process.exit(0);
  }
}
