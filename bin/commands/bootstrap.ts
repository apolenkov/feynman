import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { BOOTSTRAP_HELP } from '../cli/help.ts';
import { ensureDir, copyFileIfExists, copyMarkdownDir } from '../cli/fs-utils.ts';

const require = createRequire(import.meta.url);
const PKG = require('../../package.json') as { version: string; name: string };
const VERSION = PKG.version;

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..');

// Hook script lives relative to this file.
// Prefer .ts (dev with strip-types); fall back to .js (installed npm package).
const _hookExt = fs.existsSync(path.resolve(import.meta.dirname, '..', '..', 'hooks', 'feynman-activate.ts')) ? '.ts' : '.js';
const HOOK_PATH         = path.resolve(import.meta.dirname, '..', '..', 'hooks', `feynman-activate${_hookExt}`);
const RULES_PATH        = path.resolve(import.meta.dirname, '..', '..', 'rules', 'feynman-activate.md');

const EXAMPLES_DIR = path.resolve(import.meta.dirname, '..', '..', 'examples');
const SKILL_SRC    = path.resolve(ROOT_DIR, 'skills', 'feynman', 'SKILL.md');
const CLAUDE_PLUGIN  = path.resolve(ROOT_DIR, '.claude-plugin', 'plugin.json');
const CODEX_PLUGIN   = path.resolve(ROOT_DIR, '.codex-plugin', 'plugin.json');
const PACKAGE_HOOKS  = path.resolve(ROOT_DIR, 'hooks', 'hooks.json');
const DEFAULT_BOOTSTRAP_DIR = 'feynman-package';
const ACTIVATOR_JS   = HOOK_PATH;   // activate hook path (dev: .ts, package: .js)
const CLI_JS         = path.resolve(ROOT_DIR, 'bin', `feynman${_hookExt}`);
const PACKAGE_JSON   = path.resolve(ROOT_DIR, 'package.json');

export function cmdBootstrap(args: string[]): void {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(BOOTSTRAP_HELP);
    process.exit(0);
  }

  let out = path.resolve(process.cwd(), DEFAULT_BOOTSTRAP_DIR);
  let force = false;
  const unknown: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--out') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        console.error('feynman bootstrap: --out requires a value');
        process.exit(2);
      }
      out = path.resolve(process.cwd(), value);
      i += 1;
      continue;
    }

    if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length);
      if (!value) {
        console.error('feynman bootstrap: invalid --out argument');
        process.exit(2);
      }
      out = path.resolve(process.cwd(), value);
      continue;
    }

    if (arg.startsWith('-')) {
      unknown.push(arg);
      continue;
    }

    unknown.push(arg);
  }

  if (unknown.length > 0) {
    console.error(`feynman bootstrap: unexpected arguments "${unknown.join(' ')}"`);
    console.error('Run `feynman bootstrap --help` for usage.');
    process.exit(2);
  }

  if (fs.existsSync(out) && !force) {
    console.log(`feynman bootstrap: output already exists at ${out}`);
    console.log('Use `--force` to recreate it.');
    process.exit(0);
  }

  if (fs.existsSync(out)) {
    fs.rmSync(out, { recursive: true, force: true });
  }

  const counts = {
    examples:        copyMarkdownDir(EXAMPLES_DIR, path.join(out, 'examples')),
    rules:           copyFileIfExists(RULES_PATH, path.join(out, 'rules', 'feynman-activate.md')) ? 1 : 0,
    hooks:           copyFileIfExists(PACKAGE_HOOKS, path.join(out, 'hooks', 'hooks.json')) ? 1 : 0,
    hookRuntime:     copyFileIfExists(ACTIVATOR_JS, path.join(out, 'hooks', `feynman-activate${_hookExt}`)) ? 1 : 0,
    cliRuntime:      copyFileIfExists(CLI_JS, path.join(out, 'bin', `feynman${_hookExt}`)) ? 1 : 0,
    packageManifest: copyFileIfExists(PACKAGE_JSON, path.join(out, 'package.json')) ? 1 : 0,
    plugins:
      (copyFileIfExists(CLAUDE_PLUGIN, path.join(out, '.claude-plugin', 'plugin.json')) ? 1 : 0) +
      (copyFileIfExists(CODEX_PLUGIN,  path.join(out, '.codex-plugin',  'plugin.json')) ? 1 : 0),
    skill: copyFileIfExists(SKILL_SRC, path.join(out, 'skills', 'feynman', 'SKILL.md')) ? 1 : 0,
  };

  ensureDir(out);
  fs.writeFileSync(
    path.join(out, 'feynman-bootstrap.json'),
    JSON.stringify({
      version: VERSION,
      createdAt: new Date().toISOString(),
      outputDir: out,
      counts,
    }, null, 2) + '\n'
  );

  const total = Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 1);
  console.log('');
  console.log('┌─ feynman bootstrap ────────────────────────────────────────┐');
  console.log(`│ output:   ${out}`);
  console.log(`│ examples: ${counts.examples}`);
  console.log(`│ rules:    ${counts.rules}`);
  console.log(`│ hooks:    ${counts.hooks}`);
  console.log(`│ runtime:  ${counts.hookRuntime + counts.cliRuntime + counts.packageManifest}`);
  console.log(`│ plugins:  ${counts.plugins}`);
  console.log(`│ skill:    ${counts.skill}`);
  console.log(`│ files:    ${total}`);
  console.log('└───────────────────────────────────────────────────────────┘');
  process.exit(0);
}
