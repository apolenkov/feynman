#!/usr/bin/env node
// bin/feynman.js — feynman unified CLI
// Subcommands: install, uninstall, doctor, lint, examples, bootstrap, version, help
// Zero runtime deps. CJS only. Node >= 18.
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const NO_COLOR = !!process.env.NO_COLOR;
const c = {
  bold:  s => NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`,
  green: s => NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`,
  red:   s => NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`,
  dim:   s => NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PKG       = require('../package.json');
const VERSION   = PKG.version;
const ROOT_DIR = path.resolve(__dirname, '..');

// Resolve paths using os.homedir() — never tilde literal (bug #8810)
const HOME = os.homedir();

// Hook script lives relative to this file
const HOOK_PATH = path.resolve(__dirname, '..', 'hooks', 'feynman-activate.js');
const SESSION_HOOK_PATH = path.resolve(__dirname, '..', 'hooks', 'feynman-session-start.js');
const RULES_PATH = path.resolve(__dirname, '..', 'rules', 'feynman-activate.md');

const DEFAULT_STATE = { enabled: true, intensity: 'full', injections: 0 };
const TARGET_ALIASES = {
  all: 'both',
  '*': 'both',
};
const VALID_TARGETS = ['claude', 'codex', 'both', 'all', '*'];

function targetConfig(name) {
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

function targetNames(target) {
  return target === 'both' ? ['claude', 'codex'] : [target];
}

function parseTarget(args, fallback = 'codex') {
  let target = fallback;
  const keep = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--target') {
      target = args[++i];
    } else if (arg.startsWith('--target=')) {
      target = arg.slice('--target='.length);
    } else {
      keep.push(arg);
    }
  }
  if (!VALID_TARGETS.includes(target)) {
    console.error(`feynman: invalid --target '${target}' (expected claude, codex, both, all, or *)`);
    process.exit(2);
  }
  target = TARGET_ALIASES[target] || target;
  return { target, args: keep };
}

function hookCommandFor(target) {
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
  npx @albinocrabs/feynman install --target both
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

const EXAMPLES_DIR = path.resolve(__dirname, '..', 'examples');
const SKILL_SRC = path.resolve(ROOT_DIR, 'skills', 'feynman', 'SKILL.md');
const CLAUDE_PLUGIN = path.resolve(ROOT_DIR, '.claude-plugin', 'plugin.json');
const CODEX_PLUGIN = path.resolve(ROOT_DIR, '.codex-plugin', 'plugin.json');
const PACKAGE_HOOKS = path.resolve(ROOT_DIR, 'hooks', 'hooks.json');
const DEFAULT_BOOTSTRAP_DIR = 'feynman-package';
const ACTIVATOR_JS = path.resolve(ROOT_DIR, 'hooks', 'feynman-activate.js');
const CLI_JS = path.resolve(ROOT_DIR, 'bin', 'feynman.js');
const PACKAGE_JSON = path.resolve(ROOT_DIR, 'package.json');

const BOOTSTRAP_HELP = `${c.bold('feynman bootstrap')} — export Feynman assets into local folder

${c.bold('Usage:')}
  feynman bootstrap
  feynman bootstrap --out <directory>

${c.bold('Options:')}
  --out    Output folder (default: ./feynman-package)
  --force  Recreate output folder if it exists
  --help   Show this help
`;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyFileIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
  return true;
}

function copyMarkdownDir(src, dest) {
  if (!fs.existsSync(src)) return 0;
  let copied = 0;
  for (const entry of fs.readdirSync(src, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const sourcePath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

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

function examplesIndex() {
  if (!fs.existsSync(EXAMPLES_DIR)) return [];

  return fs.readdirSync(EXAMPLES_DIR)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const file = path.join(EXAMPLES_DIR, name);
      const content = fs.readFileSync(file, 'utf8');
      const title = (content.match(/^#\s*(.+)$/m) || [null, name])[1].trim();
      const question = (content.match(/^> (.*)$/m) || [null, ''])[1].trim();
      return {
        name: name.replace(/\.md$/, ''),
        title,
        question,
        path: file,
      };
    });
}

function cmdExamples(args) {
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
  let wantsName = null;
  const unknown = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
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

function cmdBootstrap(args) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(BOOTSTRAP_HELP);
    process.exit(0);
  }

  let out = path.resolve(process.cwd(), DEFAULT_BOOTSTRAP_DIR);
  let force = false;
  const unknown = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

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
    examples: copyMarkdownDir(EXAMPLES_DIR, path.join(out, 'examples')),
    rules: copyFileIfExists(RULES_PATH, path.join(out, 'rules', 'feynman-activate.md')) ? 1 : 0,
    hooks: copyFileIfExists(PACKAGE_HOOKS, path.join(out, 'hooks', 'hooks.json')) ? 1 : 0,
    hookRuntime: copyFileIfExists(ACTIVATOR_JS, path.join(out, 'hooks', 'feynman-activate.js')) ? 1 : 0,
    cliRuntime: copyFileIfExists(CLI_JS, path.join(out, 'bin', 'feynman.js')) ? 1 : 0,
    packageManifest: copyFileIfExists(PACKAGE_JSON, path.join(out, 'package.json')) ? 1 : 0,
    plugins:
      (copyFileIfExists(CLAUDE_PLUGIN, path.join(out, '.claude-plugin', 'plugin.json')) ? 1 : 0) +
      (copyFileIfExists(CODEX_PLUGIN, path.join(out, '.codex-plugin', 'plugin.json')) ? 1 : 0),
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

  const total = Object.values(counts).reduce((sum, count) => sum + (count || 0), 1);
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

Delegates to bin/feynman-lint.js. See feynman-lint --help for full docs.

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

function readSettings(target) {
  const cfg = targetConfig(target);
  try {
    return JSON.parse(fs.readFileSync(cfg.settingsPath, 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeSettings(target, settings) {
  const cfg = targetConfig(target);
  fs.mkdirSync(cfg.rootDir, { recursive: true });
  fs.writeFileSync(cfg.settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

function hasFeynmanHook(settings) {
  const promptHook = ((settings.hooks && settings.hooks.UserPromptSubmit) || []).some(g =>
    g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
  );
  const sessionHook = ((settings.hooks && settings.hooks.SessionStart) || []).some(g =>
    g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.js'))
  );
  return promptHook && sessionHook;
}

function removeFeynmanHooks(settings) {
  if (!settings.hooks) return settings;
  for (const eventName of ['SessionStart', 'UserPromptSubmit', 'Stop']) {
    if (!Array.isArray(settings.hooks[eventName])) continue;
    settings.hooks[eventName] = settings.hooks[eventName].filter(g =>
      !(g.hooks && g.hooks.some(h =>
        h.command && (
          h.command.includes('feynman-session-start.js') ||
          h.command.includes('feynman-activate.js') ||
          h.command.includes('feynman-lint.js')
        )
      ))
    );
    if (settings.hooks[eventName].length === 0) {
      delete settings.hooks[eventName];
    }
  }
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  return settings;
}

function bootstrapState(target) {
  const cfg = targetConfig(target);
  fs.mkdirSync(cfg.feynmanDir, { recursive: true });
  let state = DEFAULT_STATE;
  if (!fs.existsSync(cfg.statePath)) {
    fs.writeFileSync(cfg.statePath, JSON.stringify(DEFAULT_STATE, null, 2) + '\n');
  } else {
    try {
      state = { ...DEFAULT_STATE, ...JSON.parse(fs.readFileSync(cfg.statePath, 'utf8')) };
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

function installClaudeCommand() {
  const cfg = targetConfig('claude');
  const skillSrc = path.resolve(__dirname, '..', 'skills', 'feynman', 'SKILL.md');
  const commandDest = path.join(cfg.commandsDir, 'feynman.md');
  if (fs.existsSync(skillSrc)) {
    fs.mkdirSync(cfg.commandsDir, { recursive: true });
    if (!fs.existsSync(commandDest)) {
      fs.copyFileSync(skillSrc, commandDest);
    }
  }
}

// ─── Install ──────────────────────────────────────────────────────────────────

function installOne(target, opts) {
  const force = opts.force || false;
  const tc = targetConfig(target);

  // Read or create settings
  const cfg = readSettings(target);
  cfg.hooks = cfg.hooks || {};
  cfg.hooks.SessionStart = cfg.hooks.SessionStart || [];
  cfg.hooks.UserPromptSubmit = cfg.hooks.UserPromptSubmit || [];

  // Idempotency check
  const already = hasFeynmanHook(cfg);

  if (already && !force) {
    bootstrapState(target);
    if (target === 'claude') installClaudeCommand();
    return { target, already: true };
  }

  // If force or partial legacy install, remove old feynman entries first.
  if (already && force) {
    removeFeynmanHooks(cfg);
    cfg.hooks = cfg.hooks || {};
    cfg.hooks.SessionStart = cfg.hooks.SessionStart || [];
    cfg.hooks.UserPromptSubmit = cfg.hooks.UserPromptSubmit || [];
  } else if (!already) {
    removeFeynmanHooks(cfg);
    cfg.hooks = cfg.hooks || {};
    cfg.hooks.SessionStart = cfg.hooks.SessionStart || [];
    cfg.hooks.UserPromptSubmit = cfg.hooks.UserPromptSubmit || [];
  }

  // Append hook entries
  const sessionEntry = {
    hooks: [{
      type: 'command',
      command: hookCommandFor(target).replace(HOOK_PATH, SESSION_HOOK_PATH),
      timeout: 5,
    }]
  };
  if (target === 'codex') {
    sessionEntry.matcher = 'startup|resume';
  }
  cfg.hooks.SessionStart.push(sessionEntry);
  cfg.hooks.UserPromptSubmit.push({
    hooks: [{
      type: 'command',
      command: hookCommandFor(target),
      timeout: 5,
    }]
  });

  // Write settings
  writeSettings(target, cfg);

  // Bootstrap state dir + state.json
  bootstrapState(target);

  // Install /feynman command to ~/.claude/commands/ (preserves user's existing skill)
  if (target === 'claude') installClaudeCommand();

  return { target, already: false, tc };
}

function cmdInstall(opts) {
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

function uninstallOne(target) {
  const tc = targetConfig(target);
  if (!fs.existsSync(tc.settingsPath)) {
    if (fs.existsSync(tc.flagPath)) fs.unlinkSync(tc.flagPath);
    return { target, missing: true };
  }

  const cfg = readSettings(target);
  const hadHook = hasFeynmanHook(cfg);
  removeFeynmanHooks(cfg);
  writeSettings(target, cfg);

  // Remove flag file (NOT state.json — user data per D-11)
  if (fs.existsSync(tc.flagPath)) {
    fs.unlinkSync(tc.flagPath);
  }

  return { target, missing: false, hadHook };
}

function cmdUninstall(opts) {
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

function cmdDoctor(opts = {}) {
  const target = opts.target || 'claude';
  if (target === 'both') {
    targetNames(target).forEach(t => cmdDoctor({ target: t, noExit: true }));
    process.exit(0);
  }
  const tc = targetConfig(target);
  const checks = [];
  let failCount = 0;

  function check(label, pass, info = false) {
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
  let sessionHookAbsPath = null;
  let hookAbsPath = null;
  if (settingsExists) {
    const cfg = readSettings(target);
    const sessionEntries = (cfg.hooks && cfg.hooks.SessionStart) || [];
    const feynmanSessionEntry = sessionEntries.find(g =>
      g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-session-start.js'))
    );
    sessionHookRegistered = !!feynmanSessionEntry;
    if (feynmanSessionEntry) {
      const hookCmd = feynmanSessionEntry.hooks.find(h => h.command && h.command.includes('feynman-session-start.js')).command;
      const match = hookCmd.match(/"([^"]+feynman-session-start\.js)"/);
      if (match) sessionHookAbsPath = match[1];
    }

    const entries = (cfg.hooks && cfg.hooks.UserPromptSubmit) || [];
    const feynmanEntry = entries.find(g =>
      g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
    );
    hookRegistered = !!feynmanEntry;
    if (feynmanEntry) {
      // Extract the path from command: node "/abs/path/to/feynman-activate.js"
      const hookCmd = feynmanEntry.hooks.find(h => h.command && h.command.includes('feynman-activate.js')).command;
      const match = hookCmd.match(/"([^"]+feynman-activate\.js)"/);
      if (match) hookAbsPath = match[1];
    }
  }
  check('hook registered (feynman-session-start.js in SessionStart)', sessionHookRegistered);
  check('hook registered (feynman-activate.js in UserPromptSubmit)', hookRegistered);

  // 3. Hook script files exist + readable
  let sessionHookFileOk = false;
  if (sessionHookAbsPath) {
    try {
      fs.accessSync(sessionHookAbsPath, fs.constants.R_OK);
      sessionHookFileOk = true;
    } catch (_) {}
  } else if (sessionHookRegistered) {
    try {
      fs.accessSync(SESSION_HOOK_PATH, fs.constants.R_OK);
      sessionHookFileOk = true;
    } catch (_) {}
  }
  check('session hook script file exists and is readable', sessionHookFileOk);

  let hookFileOk = false;
  if (hookAbsPath) {
    try {
      fs.accessSync(hookAbsPath, fs.constants.R_OK);
      hookFileOk = true;
    } catch (_) {}
  } else if (hookRegistered) {
    // Hook registered but path extraction failed — check default location
    try {
      fs.accessSync(HOOK_PATH, fs.constants.R_OK);
      hookFileOk = true;
    } catch (_) {}
  }
  check('prompt hook script file exists and is readable', hookFileOk);

  // 4. Rules file exists + non-empty
  let rulesOk = false;
  try {
    const stat = fs.statSync(RULES_PATH);
    rulesOk = stat.size > 0;
  } catch (_) {}
  check('rules/feynman-activate.md exists and non-empty', rulesOk);

  // 5. state.json valid JSON + has enabled field
  let stateOk = false;
  let stateEnabled = false;
  try {
    const state = JSON.parse(fs.readFileSync(tc.statePath, 'utf8'));
    stateOk = 'enabled' in state;
    stateEnabled = state.enabled === true;
  } catch (_) {}
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
    // Check Stop hooks too
    const allHookGroups = [
      ...((cfg.hooks && cfg.hooks.UserPromptSubmit) || []),
      ...((cfg.hooks && cfg.hooks.Stop) || []),
    ];
    lintHookRegistered = allHookGroups.some(g =>
      g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-lint.js'))
    );
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
    const stripped = strippedLines[i];
    const pad = innerW - 1 - stripped.length; // 1 for leading space
    console.log(`│ ${checks[i]}${' '.repeat(Math.max(0, pad))}│`);
  }
  console.log(`└${border}┘`);

  const status = failCount === 0
    ? c.green('Status: OK')
    : c.red(`Status: ISSUES (${failCount})`);
  console.log(status);

  if (!opts.noExit) process.exit(0);
}

// ─── Lint (delegate to feynman-lint.js) ──────────────────────────────────────

function cmdLint(args) {
  // Re-invoke feynman-lint.js in-process by overriding process.argv
  // and calling it via require (D-04: delegate by require, NOT spawn)
  const lintArgs = args.filter(a => a !== '--help');
  if (args.includes('--help') || lintArgs.length === 0) {
    console.log(LINT_HELP);
    process.exit(0);
  }

  // Override argv and invoke lint module
  process.argv = ['node', 'feynman-lint.js', ...lintArgs];
  require('./feynman-lint.js');
}

// ─── Version ──────────────────────────────────────────────────────────────────

function cmdVersion(args) {
  if (args.includes('--help')) {
    console.log(VERSION_HELP);
    process.exit(0);
  }
  console.log(VERSION);
  process.exit(0);
}

// ─── Help ─────────────────────────────────────────────────────────────────────

function cmdHelp() {
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
