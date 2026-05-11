#!/usr/bin/env node
// bin/feynman.ts — feynman unified CLI
// Subcommands: install, uninstall, doctor, lint, examples, bootstrap, version, help
// Zero runtime deps. ESM TypeScript. Node >= 22.6.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PKG = require('../package.json') as { version: string; name: string };

// ─── Types ────────────────────────────────────────────────────────────────────

interface Color { (s: string): string; }
interface ColorMap { bold: Color; green: Color; red: Color; dim: Color; }

interface TargetConfig {
  name: string;
  label: string;
  rootDir: string;
  settingsPath: string;
  feynmanDir: string;
  statePath: string;
  flagPath: string;
  commandsDir: string | null;
}

interface IdeTargetConfig {
  name: string;
  label: string;
  rootDir: string;
  dir: string;
  rulesPath: string;
  frontmatter: Record<string, string | boolean> | null;
}

interface FeynmanState {
  enabled: boolean;
  intensity: string;
  injections: number;
  malformed_rules?: boolean;
}

interface InstallResult { target: string; already: boolean; tc?: TargetConfig; }
interface UninstallResult { target: string; missing: boolean; hadHook?: boolean; }
interface IdeInstallResult { target: string; already: boolean; rulesPath: string; }
interface DoctorResult { target: string; ok: boolean; reason?: string; rulesPath?: string; bytes?: number; }

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const NO_COLOR = !!process.env['NO_COLOR'];
const c: ColorMap = {
  bold:  (s: string) => NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`,
  green: (s: string) => NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`,
  red:   (s: string) => NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`,
  dim:   (s: string) => NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const VERSION   = PKG.version;
const ROOT_DIR  = path.resolve(import.meta.dirname, '..');

// Resolve paths using os.homedir() — never tilde literal (bug #8810)
const HOME = os.homedir();

// Hook script lives relative to this file
const HOOK_PATH         = path.resolve(import.meta.dirname, '..', 'hooks', 'feynman-activate.ts');
const SESSION_HOOK_PATH = path.resolve(import.meta.dirname, '..', 'hooks', 'feynman-session-start.ts');
const RULES_PATH        = path.resolve(import.meta.dirname, '..', 'rules', 'feynman-activate.md');

const DEFAULT_STATE: FeynmanState = { enabled: true, intensity: 'full', injections: 0 };
const TARGET_ALIASES: Record<string, string> = {
  all: 'both',
  '*': 'both',
};
const VALID_TARGETS = ['claude', 'codex', 'both', 'all', '*', 'cline', 'cursor', 'windsurf'];

// IDE targets are project-local (write to CWD), unlike claude/codex which are
// user-global (write to HOME). They install a rules file, not a hook.
const IDE_TARGETS = ['cline', 'cursor', 'windsurf'];
function isIdeTarget(name: string): boolean { return IDE_TARGETS.includes(name); }

// Per-IDE rules-file location, filename, and frontmatter requirement.
// `frontmatter` keys map onto the YAML emitted at the top of the rules file
// (Cursor's `.mdc` format requires alwaysApply + globs).
function ideTargetConfig(name: string): IdeTargetConfig | null {
  const cwd = process.cwd();
  const configs: Record<string, { label: string; dir: string; file: string; frontmatter: Record<string, string | boolean> | null }> = {
    cline: {
      label: 'Cline / Windsurf-Cline',
      dir: '.clinerules',
      file: 'feynman-rules.md',
      frontmatter: null,
    },
    cursor: {
      label: 'Cursor',
      dir: path.join('.cursor', 'rules'),
      file: 'feynman.mdc',
      frontmatter: { description: 'feynman ASCII diagram rules', alwaysApply: true, globs: '**' },
    },
    windsurf: {
      label: 'Windsurf',
      dir: path.join('.windsurf', 'rules'),
      file: 'feynman.md',
      frontmatter: null,
    },
  };
  const cfg = configs[name];
  if (!cfg) return null;
  return {
    name,
    label: cfg.label,
    rootDir: cwd,
    dir: path.join(cwd, cfg.dir),
    rulesPath: path.join(cwd, cfg.dir, cfg.file),
    frontmatter: cfg.frontmatter,
  };
}

function targetConfig(name: string): TargetConfig {
  const dirName = name === 'codex' ? '.codex' : '.claude';
  const rootDir = path.join(HOME, dirName);
  return {
    name,
    label: name === 'codex' ? 'Codex' : 'Claude Code',
    rootDir,
    settingsPath: path.join(rootDir, name === 'codex' ? 'hooks.json' : 'settings.json'),
    feynmanDir: path.join(rootDir, '.feynman'),
    statePath: path.join(rootDir, '.feynman', 'state.json'),
    flagPath: path.join(rootDir, '.feynman-active'),
    commandsDir: name === 'claude' ? path.join(rootDir, 'commands') : null,
  };
}

function targetNames(target: string): string[] {
  return target === 'both' ? ['claude', 'codex'] : [target];
}

function parseTarget(args: string[], fallback = 'codex'): { target: string; args: string[] } {
  let target = fallback;
  const keep: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--target') {
      target = args[++i] ?? target;
    } else if (arg.startsWith('--target=')) {
      target = arg.slice('--target='.length);
    } else {
      keep.push(arg);
    }
  }
  if (!VALID_TARGETS.includes(target)) {
    console.error(`feynman: invalid --target '${target}' (expected claude, codex, both, all, *, cline, cursor, or windsurf)`);
    process.exit(2);
  }
  target = TARGET_ALIASES[target] ?? target;
  return { target, args: keep };
}

// ─── IDE install / doctor (project-local rules-file installs) ─────────────────

// Render YAML frontmatter (Cursor .mdc format) from an object. Keys emitted in
// stable order. Values are emitted unquoted for booleans/numbers, quoted for
// strings (single-quoted; no nested quotes expected).
function renderFrontmatter(obj: Record<string, string | boolean> | null): string {
  if (!obj) return '';
  const order = ['description', 'alwaysApply', 'globs'];
  const lines = ['---'];
  for (const k of order) {
    if (!(k in obj)) continue;
    const v = obj[k];
    if (typeof v === 'boolean' || typeof v === 'number') lines.push(`${k}: ${v}`);
    else lines.push(`${k}: "${String(v).replace(/"/g, '\\"')}"`);
  }
  lines.push('---', '');
  return lines.join('\n');
}

// Build the rules content for IDE installs. Uses the same rules file the
// runtime hook reads, but always emits the `full` intensity (IDEs are
// developer tools, default to richest variant). The full intensity content
// is extracted from rules/feynman-activate.md by the same XML matcher used
// in hooks/feynman-activate.ts.
function readFullIntensityRules(): string {
  const rulesPath = path.resolve(ROOT_DIR, 'rules', 'feynman-activate.md');
  const content = fs.readFileSync(rulesPath, 'utf8');
  const xml = /<intensity\s+name\s*=\s*["']full["'][^>]*>([\s\S]*?)<\/intensity>/i.exec(content);
  if (xml) return (xml[1] ?? '').trim();
  // Legacy fallback (matches hook).
  const open = '<!-- full -->';
  const close = '<!-- /full -->';
  const i1 = content.indexOf(open);
  const i2 = content.indexOf(close, i1);
  if (i1 === -1 || i2 === -1) return content; // raw fallback
  return content.slice(i1 + open.length, i2).trim();
}

function installIde(target: string): IdeInstallResult {
  const cfg = ideTargetConfig(target);
  if (!cfg) throw new Error(`unknown IDE target: ${target}`);
  ensureDir(cfg.dir);
  const rules = readFullIntensityRules();
  const fm = renderFrontmatter(cfg.frontmatter);
  const body = fm + '# feynman — ASCII diagram rules (auto-injected for ' + cfg.label + ')\n\n' + rules + '\n';
  const already = fs.existsSync(cfg.rulesPath);
  fs.writeFileSync(cfg.rulesPath, body);
  return { target, already, rulesPath: cfg.rulesPath };
}

function doctorIde(target: string): DoctorResult {
  const cfg = ideTargetConfig(target);
  if (!cfg) return { target, ok: false, reason: 'unknown target' };
  if (!fs.existsSync(cfg.rulesPath)) {
    return { target, ok: false, reason: 'rules file missing — run install --target ' + target };
  }
  const content = fs.readFileSync(cfg.rulesPath, 'utf8');
  if (cfg.frontmatter) {
    if (!/^---\n[\s\S]*?\nalwaysApply:\s*true/m.test(content)) {
      return { target, ok: false, reason: 'frontmatter missing or alwaysApply≠true' };
    }
  }
  if (!content.includes('feynman') && content.length < 100) {
    return { target, ok: false, reason: 'rules content suspiciously short' };
  }
  return { target, ok: true, rulesPath: cfg.rulesPath, bytes: content.length };
}

function hookCommandFor(target: string): string {
  const cfg = targetConfig(target);
  return `FEYNMAN_HOME="${cfg.rootDir}" node "${HOOK_PATH}"`;
}

// ─── Help text ────────────────────────────────────────────────────────────────

const HELP = `${c.bold('feynman')} v${VERSION} — auto-inject ASCII diagram rules into Claude Code and Codex

${c.bold('Usage:')}
  feynman <command> [options]

${c.bold('Commands:')}
  install      Register feynman hook
  uninstall    Remove feynman hook (state preserved)
  doctor       Check installation health
  lint <file>  Lint a markdown file for diagram rule violations
  examples     List and display example prompts from the repository
  bootstrap    Export shared Feynman assets to a local folder
  version      Print version number
  help         Show this help

${c.bold('Options:')}
  --help, -h   Show help for a command
  --target     claude | codex | both | all | *
  --force      (install) Re-register even if already installed

${c.bold('Examples:')}
  npx @albinocrabs/feynman install
  npx @albinocrabs/feynman install --target codex
  npx @albinocrabs/feynman install --target all
  npx @albinocrabs/feynman install --target all
  npx @albinocrabs/feynman doctor
  feynman lint response.md
  feynman bootstrap --out ./feynman-package
  feynman examples
  feynman uninstall
`;

const EXAMPLES_HELP = `${c.bold('feynman examples')} — print built-in demonstration prompts

${c.bold('Usage:')}
  feynman examples                     # list available examples
  feynman examples --name <fileBase>   # print a specific example
  feynman examples --random            # print a random example

${c.bold('Options:')}
  --name    Example filename without .md extension (examples/feature-planning)
  --random  Show one random example in full
  --help    Show this help

Example filenames:
  - architecture-review
  - api-flow
  - c4-platform-diagramming
  - db-schema
  - algorithm-explain
  - deploy-pipeline
  - code-review
  - incident-response
  - feature-planning
`;

const EXAMPLES_DIR = path.resolve(import.meta.dirname, '..', 'examples');
const SKILL_SRC    = path.resolve(ROOT_DIR, 'skills', 'feynman', 'SKILL.md');
const CLAUDE_PLUGIN  = path.resolve(ROOT_DIR, '.claude-plugin', 'plugin.json');
const CODEX_PLUGIN   = path.resolve(ROOT_DIR, '.codex-plugin', 'plugin.json');
const PACKAGE_HOOKS  = path.resolve(ROOT_DIR, 'hooks', 'hooks.json');
const DEFAULT_BOOTSTRAP_DIR = 'feynman-package';
const ACTIVATOR_JS   = path.resolve(ROOT_DIR, 'hooks', 'feynman-activate.ts');  // name kept for backward compat
const CLI_JS         = path.resolve(ROOT_DIR, 'bin', 'feynman.ts');
const PACKAGE_JSON   = path.resolve(ROOT_DIR, 'package.json');

const BOOTSTRAP_HELP = `${c.bold('feynman bootstrap')} — export Feynman assets into local folder

${c.bold('Usage:')}
  feynman bootstrap
  feynman bootstrap --out <directory>

${c.bold('Options:')}
  --out    Output folder (default: ./feynman-package)
  --force  Recreate output folder if it exists
  --help   Show this help
`;

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileIfExists(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyMarkdownDir(src: string, dest: string): number {
  if (!fs.existsSync(src)) return 0;
  let copied = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const sourcePath = path.join(src, entry.name);
    const destPath   = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copied += copyMarkdownDir(sourcePath, destPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    ensureDir(path.dirname(destPath));
    fs.copyFileSync(sourcePath, destPath);
    copied += 1;
  }
  return copied;
}

interface ExampleEntry {
  name: string;
  title: string;
  question: string;
  path: string;
}

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

function cmdExamples(args: string[]): void {
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

function cmdBootstrap(args: string[]): void {
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
    hookRuntime:     copyFileIfExists(ACTIVATOR_JS, path.join(out, 'hooks', 'feynman-activate.ts')) ? 1 : 0,
    cliRuntime:      copyFileIfExists(CLI_JS, path.join(out, 'bin', 'feynman.ts')) ? 1 : 0,
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

const INSTALL_HELP = `${c.bold('feynman install')} — register feynman hook

${c.bold('Usage:')}
  feynman install [--target claude|codex|both|all|*] [--force]

${c.bold('Options:')}
  --target  Install into Claude Code, Codex, both, all, or * (default: codex)
  --force   Re-register hook even if already installed

Claude creates:
  ~/.claude/.feynman/state.json   — feynman state (enabled, intensity, injections)
  ~/.claude/.feynman-active        — presence flag

Codex creates:
  ~/.codex/hooks.json              — SessionStart + UserPromptSubmit hook registration
  ~/.codex/.feynman/state.json     — feynman state (enabled, intensity, injections)
  ~/.codex/.feynman-active         — presence flag

Idempotent by default: skips if feynman hook entries already exist.
`;

const UNINSTALL_HELP = `${c.bold('feynman uninstall')} — remove feynman hook

${c.bold('Usage:')}
  feynman uninstall [--target claude|codex|both|all|*]

Removes feynman hook entries from target config.
Preserves .feynman/state.json (user data).
Removes .feynman-active flag.

Idempotent: safe to run multiple times.
`;

const DOCTOR_HELP = `${c.bold('feynman doctor')} — check feynman installation health

${c.bold('Usage:')}
  feynman doctor [--target claude|codex|both|all|*]

Checks:
  1. target hook config present
  2. SessionStart and UserPromptSubmit hooks reference feynman scripts
  3. Hook script files exist and are readable
  4. Rules file exists and is non-empty
  5. state.json valid JSON with enabled field
  6. .feynman-active flag matches enabled state
  7. (INFO) lint hook registered (optional)

Exit code: always 0 (advisory only).
`;

const LINT_HELP = `${c.bold('feynman lint')} — lint a markdown file for ASCII diagram rule violations

${c.bold('Usage:')}
  feynman lint <file.md>
  feynman lint -          (read from stdin)
  feynman lint --json <file>
  feynman lint --strict <file>

${c.bold('Options:')}
  --json    Output issues as JSON
  --strict  Treat warnings as errors (exit 1 on any issue)

Delegates to bin/feynman-lint.ts. See feynman-lint --help for full docs.

Exit codes:
  0   No errors
  1   Lint failure
  2   Usage error
`;

const VERSION_HELP = `${c.bold('feynman version')} — print version

${c.bold('Usage:')}
  feynman version

Prints: ${VERSION}
`;

// ─── Settings helpers ─────────────────────────────────────────────────────────

function readSettings(target: string): Record<string, unknown> {
  const cfg = targetConfig(target);
  try {
    return JSON.parse(fs.readFileSync(cfg.settingsPath, 'utf8')) as Record<string, unknown>;
  } catch (_) {
    return {};
  }
}

function writeSettings(target: string, settings: Record<string, unknown>): void {
  const cfg = targetConfig(target);
  fs.mkdirSync(cfg.rootDir, { recursive: true });
  fs.writeFileSync(cfg.settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

function isFeynmanHookCommand(command: string): boolean {
  return (
    command.includes('feynman-session-start.ts') ||
    command.includes('feynman-session-start.js') ||
    command.includes('feynman-activate.ts') ||
    command.includes('feynman-activate.js') ||
    command.includes('feynman-lint.ts') ||
    command.includes('feynman-lint.js')
  );
}

function hasFeynmanHook(settings: Record<string, unknown>): boolean {
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  const promptHook = ((hooks?.['UserPromptSubmit'] ?? []) as Array<Record<string, unknown>>).some(g => {
    const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
    return hs?.some(h => typeof h['command'] === 'string' && (
      (h['command'] as string).includes('feynman-activate.ts') ||
      (h['command'] as string).includes('feynman-activate.js')
    ));
  });
  const sessionHook = ((hooks?.['SessionStart'] ?? []) as Array<Record<string, unknown>>).some(g => {
    const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
    return hs?.some(h => typeof h['command'] === 'string' && (
      (h['command'] as string).includes('feynman-session-start.ts') ||
      (h['command'] as string).includes('feynman-session-start.js')
    ));
  });
  return promptHook && sessionHook;
}

function hasAnyFeynmanHook(settings: Record<string, unknown>): boolean {
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  if (!hooks) return false;
  return ['SessionStart', 'UserPromptSubmit', 'Stop'].some(eventName =>
    ((hooks[eventName] ?? []) as Array<Record<string, unknown>>).some(g => {
      const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
      return hs?.some(h => typeof h['command'] === 'string' && isFeynmanHookCommand(h['command'] as string));
    })
  );
}

function extractHookScriptPath(command: string, scriptName: string): string | null {
  if (typeof command !== 'string') return null;
  const escaped = scriptName.replace(/\./g, '\\.');
  const quotedPattern = new RegExp("[\"']([^\"']*" + escaped + ")[\"']");
  const quoted = command.match(quotedPattern);
  if (quoted) return quoted[1] ?? null;

  const unquotedPattern = new RegExp("(?:^|\\s)(/[^\\s\"';&|<>]*" + escaped + ")(?=$|\\s)");
  const unquoted = command.match(unquotedPattern);
  return unquoted ? (unquoted[1] ?? null) : null;
}

function removeFeynmanHooks(settings: Record<string, unknown>): Record<string, unknown> {
  const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
  if (!hooks) return settings;
  for (const eventName of ['SessionStart', 'UserPromptSubmit', 'Stop']) {
    if (!Array.isArray(hooks[eventName])) continue;
    const groups = hooks[eventName] as Array<Record<string, unknown>>;
    hooks[eventName] = groups
      .map(g => {
        const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(hs)) return g;
        return {
          ...g,
          hooks: hs.filter(h => !(typeof h['command'] === 'string' && isFeynmanHookCommand(h['command'] as string))),
        };
      })
      .filter(g => {
        const hs = g['hooks'] as Array<unknown> | undefined;
        return !Array.isArray(hs) || hs.length > 0;
      });
    if ((hooks[eventName] as unknown[]).length === 0) {
      delete hooks[eventName];
    }
  }
  if (Object.keys(hooks).length === 0) {
    delete settings['hooks'];
  }
  return settings;
}

function bootstrapState(target: string): void {
  const cfg = targetConfig(target);
  fs.mkdirSync(cfg.feynmanDir, { recursive: true });
  let state: FeynmanState = { ...DEFAULT_STATE };
  if (!fs.existsSync(cfg.statePath)) {
    fs.writeFileSync(cfg.statePath, JSON.stringify(DEFAULT_STATE, null, 2) + '\n');
  } else {
    try {
      state = { ...DEFAULT_STATE, ...(JSON.parse(fs.readFileSync(cfg.statePath, 'utf8')) as Partial<FeynmanState>) };
    } catch (_) {
      fs.writeFileSync(cfg.statePath, JSON.stringify(DEFAULT_STATE, null, 2) + '\n');
    }
  }
  if (state.enabled) {
    fs.writeFileSync(cfg.flagPath, state.intensity || DEFAULT_STATE.intensity);
  } else if (fs.existsSync(cfg.flagPath)) {
    fs.unlinkSync(cfg.flagPath);
  }
}

function installClaudeCommand(): void {
  const cfg = targetConfig('claude');
  const skillSrc = path.resolve(import.meta.dirname, '..', 'skills', 'feynman', 'SKILL.md');
  if (!cfg.commandsDir) return;
  const commandDest = path.join(cfg.commandsDir, 'feynman.md');
  if (fs.existsSync(skillSrc)) {
    fs.mkdirSync(cfg.commandsDir, { recursive: true });
    if (!fs.existsSync(commandDest)) {
      fs.copyFileSync(skillSrc, commandDest);
    }
  }
}

// ─── Install ──────────────────────────────────────────────────────────────────

function installOne(target: string, opts: { force: boolean }): InstallResult {
  const force = opts.force ?? false;

  // Read or create settings
  const cfg = readSettings(target) as Record<string, Record<string, unknown[]>>;
  cfg['hooks'] = cfg['hooks'] ?? {};
  cfg['hooks']['SessionStart'] = cfg['hooks']['SessionStart'] ?? [];
  cfg['hooks']['UserPromptSubmit'] = cfg['hooks']['UserPromptSubmit'] ?? [];

  // Idempotency check
  const already = hasFeynmanHook(cfg as Record<string, unknown>);

  if (already && !force) {
    bootstrapState(target);
    if (target === 'claude') installClaudeCommand();
    return { target, already: true };
  }

  // If force or partial legacy install, remove old feynman entries first.
  if (already && force) {
    removeFeynmanHooks(cfg as Record<string, unknown>);
    cfg['hooks'] = cfg['hooks'] ?? {};
    cfg['hooks']['SessionStart'] = cfg['hooks']['SessionStart'] ?? [];
    cfg['hooks']['UserPromptSubmit'] = cfg['hooks']['UserPromptSubmit'] ?? [];
  } else if (!already) {
    removeFeynmanHooks(cfg as Record<string, unknown>);
    cfg['hooks'] = cfg['hooks'] ?? {};
    cfg['hooks']['SessionStart'] = cfg['hooks']['SessionStart'] ?? [];
    cfg['hooks']['UserPromptSubmit'] = cfg['hooks']['UserPromptSubmit'] ?? [];
  }

  // Append hook entries
  const sessionEntry: Record<string, unknown> = {
    hooks: [{
      type: 'command',
      command: hookCommandFor(target).replace(HOOK_PATH, SESSION_HOOK_PATH),
      timeout: 5,
    }]
  };
  if (target === 'codex') {
    sessionEntry['matcher'] = 'startup|resume';
  }
  cfg['hooks']['SessionStart'].push(sessionEntry);
  cfg['hooks']['UserPromptSubmit'].push({
    hooks: [{
      type: 'command',
      command: hookCommandFor(target),
      timeout: 5,
    }]
  });

  // Write settings
  writeSettings(target, cfg as Record<string, unknown>);

  // Bootstrap state dir + state.json
  bootstrapState(target);

  // Install /feynman command to ~/.claude/commands/ (preserves user's existing skill)
  if (target === 'claude') installClaudeCommand();

  return { target, already: false, tc: targetConfig(target) };
}

function cmdInstall(opts: { force: boolean; target: string }): void {
  // IDE targets follow a different install path — project-local rules file,
  // no hook registration, no HOME writes. Route early and return.
  if (isIdeTarget(opts.target)) {
    const r = installIde(opts.target);
    const cfg = ideTargetConfig(opts.target);
    if (!cfg) { process.exit(1); }
    console.log('');
    console.log(`feynman ${r.already ? 'updated' : 'installed'}: ${cfg.label}`);
    console.log(`  rules: ${r.rulesPath.replace(process.cwd(), '.')}`);
    console.log('');
    process.exit(0);
  }

  const results = targetNames(opts.target).map(t => installOne(t, opts));

  if (results.every(r => r.already)) {
    const labels = results.map(r => targetConfig(r.target).label).join(' + ');
    console.log(`hook: already installed (${labels})`);
    process.exit(0);
  }

  // Print status frame
  console.log('');
  console.log('┌─ feynman installed ──────────────────────────────────────────┐');
  console.log(`│ hook:     ${HOOK_PATH}`);
  for (const result of results) {
    const tc = targetConfig(result.target);
    console.log(`│ target:   ${tc.label}${result.already ? ' (already installed)' : ''}`);
    console.log(`│ config:   ${tc.settingsPath.replace(HOME, '~')}`);
    console.log(`│ state:    ${tc.statePath.replace(HOME, '~')}`);
    console.log(`│ flag:     ${tc.flagPath.replace(HOME, '~')}`);
  }
  console.log('└──────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('Restart Claude Code or Codex to activate feynman full mode.');

  process.exit(0);
}

// ─── Uninstall ────────────────────────────────────────────────────────────────

function uninstallOne(target: string): UninstallResult {
  const tc = targetConfig(target);
  if (!fs.existsSync(tc.settingsPath)) {
    if (fs.existsSync(tc.flagPath)) fs.unlinkSync(tc.flagPath);
    return { target, missing: true };
  }

  const cfg = readSettings(target);
  const hadHook = hasAnyFeynmanHook(cfg);
  removeFeynmanHooks(cfg);
  writeSettings(target, cfg);

  // Remove flag file (NOT state.json — user data per D-11)
  if (fs.existsSync(tc.flagPath)) {
    fs.unlinkSync(tc.flagPath);
  }

  return { target, missing: false, hadHook };
}

function cmdUninstall(opts: { target: string }): void {
  const results = targetNames(opts.target).map(uninstallOne);
  const labels = results.map(r => targetConfig(r.target).label).join(' + ');
  if (results.every(r => r.missing || !r.hadHook)) {
    console.log(`feynman: no hook found for ${labels} — nothing to uninstall.`);
  } else {
    console.log(`feynman disabled for ${labels}. State preserved. Re-enable: npx @albinocrabs/feynman install --target ${opts.target}`);
  }
  process.exit(0);
}

// ─── Doctor ───────────────────────────────────────────────────────────────────

function cmdDoctor(opts: { target?: string; noExit?: boolean } = {}): void {
  const target = opts.target ?? 'claude';

  // IDE doctor — simpler check: rules file exists, frontmatter valid.
  if (isIdeTarget(target)) {
    const r = doctorIde(target);
    const cfg = ideTargetConfig(target);
    if (!cfg) { process.exit(1); }
    console.log('');
    console.log(`feynman doctor — ${cfg.label}`);
    if (r.ok) {
      console.log(`  [OK]   ${(r.rulesPath ?? '').replace(process.cwd(), '.')} (${r.bytes} bytes)`);
      console.log('');
      process.exit(0);
    } else {
      console.log(`  [FAIL] ${r.reason}`);
      console.log('');
      process.exit(1);
    }
  }

  if (target === 'both') {
    targetNames(target).forEach(t => cmdDoctor({ target: t, noExit: true }));
    process.exit(0);
  }
  const tc = targetConfig(target);
  const checks: string[] = [];
  let failCount = 0;

  function check(label: string, pass: boolean, info = false): void {
    const marker = info ? '[INFO]' : (pass ? '[OK]  ' : '[FAIL]');
    const colorFn = info ? c.dim : (pass ? c.green : c.red);
    checks.push(colorFn(`${marker} ${label}`));
    if (!info && !pass) failCount++;
  }

  // 1. settings/hooks config exists
  const settingsExists = fs.existsSync(tc.settingsPath);
  check(`${tc.settingsPath.replace(HOME, '~')} present`, settingsExists);

  // 2. SessionStart and UserPromptSubmit hooks reference feynman scripts
  let sessionHookRegistered = false;
  let hookRegistered = false;
  let sessionHookAbsPath: string | null = null;
  let hookAbsPath: string | null = null;
  if (settingsExists) {
    const cfg = readSettings(target);
    const hooks = cfg['hooks'] as Record<string, Array<Record<string, unknown>>> | undefined;
    const sessionEntries = hooks?.['SessionStart'] ?? [];
    const feynmanSessionEntry = sessionEntries.find(g => {
      const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
      return hs?.some(h => typeof h['command'] === 'string' && (
        (h['command'] as string).includes('feynman-session-start.ts') ||
        (h['command'] as string).includes('feynman-session-start.js')
      ));
    });
    sessionHookRegistered = !!feynmanSessionEntry;
    if (feynmanSessionEntry) {
      const hs = feynmanSessionEntry['hooks'] as Array<Record<string, unknown>>;
      const hookCmd = hs.find(h => typeof h['command'] === 'string' && (
        (h['command'] as string).includes('feynman-session-start.ts') ||
        (h['command'] as string).includes('feynman-session-start.js')
      ))?. ['command'] as string | undefined;
      if (hookCmd) {
        sessionHookAbsPath =
          extractHookScriptPath(hookCmd, 'feynman-session-start.ts') ??
          extractHookScriptPath(hookCmd, 'feynman-session-start.js');
      }
    }

    const entries = hooks?.['UserPromptSubmit'] ?? [];
    const feynmanEntry = entries.find(g => {
      const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
      return hs?.some(h => typeof h['command'] === 'string' && (
        (h['command'] as string).includes('feynman-activate.ts') ||
        (h['command'] as string).includes('feynman-activate.js')
      ));
    });
    hookRegistered = !!feynmanEntry;
    if (feynmanEntry) {
      const hs = feynmanEntry['hooks'] as Array<Record<string, unknown>>;
      const hookCmd = hs.find(h => typeof h['command'] === 'string' && (
        (h['command'] as string).includes('feynman-activate.ts') ||
        (h['command'] as string).includes('feynman-activate.js')
      ))?. ['command'] as string | undefined;
      if (hookCmd) {
        hookAbsPath =
          extractHookScriptPath(hookCmd, 'feynman-activate.ts') ??
          extractHookScriptPath(hookCmd, 'feynman-activate.js');
      }
    }
  }
  check('hook registered (feynman-session-start in SessionStart)', sessionHookRegistered);
  check('hook registered (feynman-activate in UserPromptSubmit)', hookRegistered);

  // 3. Hook script files exist + readable
  let sessionHookFileOk = false;
  if (sessionHookAbsPath) {
    try {
      fs.accessSync(sessionHookAbsPath, fs.constants.R_OK);
      sessionHookFileOk = true;
    } catch (_) { /* intentionally empty */ }
  }
  check('session hook script file exists and is readable', sessionHookFileOk);

  let hookFileOk = false;
  if (hookAbsPath) {
    try {
      fs.accessSync(hookAbsPath, fs.constants.R_OK);
      hookFileOk = true;
    } catch (_) { /* intentionally empty */ }
  }
  check('prompt hook script file exists and is readable', hookFileOk);

  // 4. Rules file exists + non-empty
  let rulesOk = false;
  try {
    const stat = fs.statSync(RULES_PATH);
    rulesOk = stat.size > 0;
  } catch (_) { /* intentionally empty */ }
  check('rules/feynman-activate.md exists and non-empty', rulesOk);

  // 5. state.json valid JSON + has enabled field
  let stateOk = false;
  let stateEnabled = false;
  try {
    const state = JSON.parse(fs.readFileSync(tc.statePath, 'utf8')) as Record<string, unknown>;
    stateOk = 'enabled' in state;
    stateEnabled = state['enabled'] === true;
  } catch (_) { /* intentionally empty */ }
  check('state.json valid (has enabled field)', stateOk);

  // 6. .feynman-active flag matches state
  const flagPresent = fs.existsSync(tc.flagPath);
  check(
    stateEnabled ? '.feynman-active flag present when enabled' : '.feynman-active flag absent when disabled',
    stateEnabled ? flagPresent : !flagPresent
  );

  // 7. (INFO) lint hook registered
  let lintHookRegistered = false;
  if (settingsExists) {
    const cfg = readSettings(target);
    const hooks = cfg['hooks'] as Record<string, Array<Record<string, unknown>>> | undefined;
    // Check Stop hooks too
    const allHookGroups = [
      ...(hooks?.['UserPromptSubmit'] ?? []),
      ...(hooks?.['Stop'] ?? []),
    ];
    lintHookRegistered = allHookGroups.some(g => {
      const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
      return hs?.some(h => typeof h['command'] === 'string' && (
        (h['command'] as string).includes('feynman-lint.ts') ||
        (h['command'] as string).includes('feynman-lint.js')
      ));
    });
  }
  const lintStatus = lintHookRegistered ? 'registered' : 'not registered (optional)';
  check(`lint hook: ${lintStatus}`, true, true); // always INFO

  // Compute frame width from longest stripped line (innerW = max content + 2 for "│ " and " │")
  const strippedLines = checks.map(l => l.replace(/\x1b\[[0-9;]*m/g, ''));
  const maxLen = Math.max(...strippedLines.map(l => l.length));
  const innerW = Math.max(maxLen + 2, 48); // +2 for one space on each side; min 48
  const titlePart = `feynman doctor ${target} `;
  const border = '─'.repeat(innerW);
  const topDashes = '─'.repeat(innerW - titlePart.length - 1);
  console.log(`┌─ ${titlePart}${topDashes}┐`);
  for (let i = 0; i < checks.length; i++) {
    const stripped = strippedLines[i] ?? '';
    const pad = innerW - 1 - stripped.length; // 1 for leading space
    console.log(`│ ${checks[i] ?? ''}${' '.repeat(Math.max(0, pad))}│`);
  }
  console.log(`└${border}┘`);

  const status = failCount === 0
    ? c.green('Status: OK')
    : c.red(`Status: ISSUES (${failCount})`);
  console.log(status);

  if (!opts.noExit) process.exit(0);
}

// ─── Lint (delegate to feynman-lint.ts via spawnSync) ─────────────────────────

function cmdLint(args: string[]): void {
  const lintArgs = args.filter(a => a !== '--help');
  if (args.includes('--help') || lintArgs.length === 0) {
    console.log(LINT_HELP);
    process.exit(0);
  }

  const lintBin = path.resolve(import.meta.dirname, 'feynman-lint.ts');
  const result = spawnSync(process.execPath, [lintBin, ...lintArgs], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

// ─── Version ──────────────────────────────────────────────────────────────────

function cmdVersion(args: string[]): void {
  if (args.includes('--help')) {
    console.log(VERSION_HELP);
    process.exit(0);
  }
  console.log(VERSION);
  process.exit(0);
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function cmdHelp(): void {
  console.log(HELP);
  process.exit(0);
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const sub  = argv[0];
const rest = argv.slice(1);

// Top-level --help / -h / no args
if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
  if (!sub) {
    // No args → help + exit 2
    console.log(HELP);
    process.exit(2);
  }
  cmdHelp();
}

switch (sub) {
  case 'install': {
    if (rest.includes('--help')) { console.log(INSTALL_HELP); process.exit(0); }
    const parsed = parseTarget(rest);
    const force = parsed.args.includes('--force');
    cmdInstall({ force, target: parsed.target });
    break;
  }
  case 'uninstall': {
    if (rest.includes('--help')) { console.log(UNINSTALL_HELP); process.exit(0); }
    const parsed = parseTarget(rest);
    cmdUninstall({ target: parsed.target });
    break;
  }
  case 'doctor': {
    if (rest.includes('--help')) { console.log(DOCTOR_HELP); process.exit(0); }
    const parsed = parseTarget(rest);
    cmdDoctor({ target: parsed.target });
    break;
  }
  case 'lint': {
    cmdLint(rest);
    break;
  }
  case 'examples': {
    cmdExamples(rest);
    break;
  }
  case 'bootstrap': {
    cmdBootstrap(rest);
    break;
  }
  case 'version': {
    cmdVersion(rest);
    break;
  }
  default: {
    console.error(`feynman: unknown subcommand '${sub}'`);
    console.log(HELP);
    process.exit(2);
  }
}
