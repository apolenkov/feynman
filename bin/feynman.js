#!/usr/bin/env node
// bin/feynman.js — feynman unified CLI
// Subcommands: install, uninstall, doctor, lint, version, help
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

// Resolve paths using os.homedir() — never tilde literal (bug #8810)
const HOME          = os.homedir();
const CLAUDE_DIR    = path.join(HOME, '.claude');
const SETTINGS_PATH = path.join(CLAUDE_DIR, 'settings.json');
const FEYNMAN_DIR   = path.join(CLAUDE_DIR, '.feynman');
const STATE_PATH    = path.join(FEYNMAN_DIR, 'state.json');
const FLAG_PATH     = path.join(CLAUDE_DIR, '.feynman-active');

// Hook script lives relative to this file
const HOOK_PATH = path.resolve(__dirname, '..', 'hooks', 'feynman-activate.js');
const RULES_PATH = path.resolve(__dirname, '..', 'rules', 'feynman-activate.md');

const DEFAULT_STATE = { enabled: true, intensity: 'full', injections: 0 };

// ─── Help text ────────────────────────────────────────────────────────────────

const HELP = `${c.bold('feynman')} v${VERSION} — auto-inject ASCII diagram rules into Claude Code

${c.bold('Usage:')}
  feynman <command> [options]

${c.bold('Commands:')}
  install      Register feynman hook in ~/.claude/settings.json
  uninstall    Remove feynman hook from settings.json (state preserved)
  doctor       Check installation health
  lint <file>  Lint a markdown file for diagram rule violations
  version      Print version number
  help         Show this help

${c.bold('Options:')}
  --help, -h   Show help for a command
  --force      (install) Re-register even if already installed

${c.bold('Examples:')}
  npx feynman install
  npx feynman doctor
  feynman lint response.md
  feynman uninstall
`;

const INSTALL_HELP = `${c.bold('feynman install')} — register feynman hook in ~/.claude/settings.json

${c.bold('Usage:')}
  feynman install [--force]

${c.bold('Options:')}
  --force   Re-register hook even if already installed

Creates:
  ~/.claude/.feynman/state.json   — feynman state (enabled, intensity, injections)
  ~/.claude/.feynman-active        — presence flag

Idempotent by default: skips if feynman-activate.js entry already exists.
`;

const UNINSTALL_HELP = `${c.bold('feynman uninstall')} — remove feynman hook from settings.json

${c.bold('Usage:')}
  feynman uninstall

Removes feynman hook entries from ~/.claude/settings.json.
Preserves ~/.claude/.feynman/state.json (user data).
Removes ~/.claude/.feynman-active flag.

Idempotent: safe to run multiple times.
`;

const DOCTOR_HELP = `${c.bold('feynman doctor')} — check feynman installation health

${c.bold('Usage:')}
  feynman doctor

Checks:
  1. settings.json present
  2. UserPromptSubmit hook references feynman-activate.js
  3. Hook script file exists and is readable
  4. Rules file exists and is non-empty
  5. state.json valid JSON with enabled field
  6. .feynman-active flag present
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

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
  } catch (_) {
    return {};
  }
}

function writeSettings(cfg) {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(cfg, null, 2) + '\n');
}

// ─── Install ──────────────────────────────────────────────────────────────────

function cmdInstall(opts) {
  const force = opts.force || false;

  // Read or create settings
  const cfg = readSettings();
  cfg.hooks = cfg.hooks || {};
  cfg.hooks.UserPromptSubmit = cfg.hooks.UserPromptSubmit || [];

  // Idempotency check
  const already = cfg.hooks.UserPromptSubmit.some(g =>
    g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
  );

  if (already && !force) {
    console.log('hook: already installed');
    process.exit(0);
  }

  // If force + already, remove old entry first
  if (already && force) {
    cfg.hooks.UserPromptSubmit = cfg.hooks.UserPromptSubmit.filter(g =>
      !(g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js')))
    );
  }

  // Append hook entry
  cfg.hooks.UserPromptSubmit.push({
    hooks: [{
      type: 'command',
      command: `node "${HOOK_PATH}"`,
      timeout: 5,
      statusMessage: 'Injecting diagram rules...',
    }]
  });

  // Write settings
  writeSettings(cfg);

  // Bootstrap state dir + state.json
  fs.mkdirSync(FEYNMAN_DIR, { recursive: true });
  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(STATE_PATH, JSON.stringify(DEFAULT_STATE, null, 2) + '\n');
  }

  // Touch flag file
  fs.writeFileSync(FLAG_PATH, DEFAULT_STATE.intensity);

  // Install /feynman command to ~/.claude/commands/ (preserves user's existing skill)
  const COMMANDS_DIR = path.join(CLAUDE_DIR, 'commands');
  const SKILL_SRC    = path.resolve(__dirname, '..', 'skills', 'feynman', 'SKILL.md');
  const COMMAND_DEST = path.join(COMMANDS_DIR, 'feynman.md');
  if (fs.existsSync(SKILL_SRC)) {
    fs.mkdirSync(COMMANDS_DIR, { recursive: true });
    if (!fs.existsSync(COMMAND_DEST)) {
      fs.copyFileSync(SKILL_SRC, COMMAND_DEST);
    }
  }

  // Print status frame
  const homeSym = SETTINGS_PATH.replace(HOME, '~');
  const stateSymSym = STATE_PATH.replace(HOME, '~');
  const flagSym = FLAG_PATH.replace(HOME, '~');

  console.log('');
  console.log('┌─ feynman installed ──────────────────────────────────────────┐');
  console.log(`│ hook:     ${HOOK_PATH}`);
  console.log(`│ settings: ${homeSym}`);
  console.log(`│ state:    ${stateSymSym}`);
  console.log(`│ flag:     ${flagSym}`);
  console.log('└──────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('Restart Claude Code to activate feynman.');

  process.exit(0);
}

// ─── Uninstall ────────────────────────────────────────────────────────────────

function cmdUninstall() {
  if (!fs.existsSync(SETTINGS_PATH)) {
    console.log('feynman: settings.json not found — nothing to uninstall.');
    process.exit(0);
  }

  const cfg = readSettings();

  if (cfg.hooks && Array.isArray(cfg.hooks.UserPromptSubmit)) {
    // Remove entries whose hooks contain feynman-activate.js or feynman-lint.js
    cfg.hooks.UserPromptSubmit = cfg.hooks.UserPromptSubmit.filter(g =>
      !(g.hooks && g.hooks.some(h =>
        h.command && (
          h.command.includes('feynman-activate.js') ||
          h.command.includes('feynman-lint.js')
        )
      ))
    );

    // Clean up empty arrays/objects
    if (cfg.hooks.UserPromptSubmit.length === 0) {
      delete cfg.hooks.UserPromptSubmit;
    }
    if (Object.keys(cfg.hooks).length === 0) {
      delete cfg.hooks;
    }
  }

  writeSettings(cfg);

  // Remove flag file (NOT state.json — user data per D-11)
  if (fs.existsSync(FLAG_PATH)) {
    fs.unlinkSync(FLAG_PATH);
  }

  console.log('feynman disabled. State preserved at ~/.claude/.feynman/. Re-enable: npx feynman install');
  process.exit(0);
}

// ─── Doctor ───────────────────────────────────────────────────────────────────

function cmdDoctor() {
  const checks = [];
  let failCount = 0;

  function check(label, pass, info = false) {
    const marker = info ? '[INFO]' : (pass ? '[OK]  ' : '[FAIL]');
    const colorFn = info ? c.dim : (pass ? c.green : c.red);
    checks.push(colorFn(`${marker} ${label}`));
    if (!info && !pass) failCount++;
  }

  // 1. settings.json exists
  const settingsExists = fs.existsSync(SETTINGS_PATH);
  check('settings.json present', settingsExists);

  // 2. UserPromptSubmit hook references feynman-activate.js
  let hookRegistered = false;
  let hookAbsPath = null;
  if (settingsExists) {
    const cfg = readSettings();
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
  check('hook registered (feynman-activate.js in UserPromptSubmit)', hookRegistered);

  // 3. Hook script file exists + readable
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
  check('hook script file exists and is readable', hookFileOk);

  // 4. Rules file exists + non-empty
  let rulesOk = false;
  try {
    const stat = fs.statSync(RULES_PATH);
    rulesOk = stat.size > 0;
  } catch (_) {}
  check('rules/feynman-activate.md exists and non-empty', rulesOk);

  // 5. state.json valid JSON + has enabled field
  let stateOk = false;
  try {
    const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    stateOk = 'enabled' in state;
  } catch (_) {}
  check('state.json valid (has enabled field)', stateOk);

  // 6. .feynman-active flag present
  const flagPresent = fs.existsSync(FLAG_PATH);
  check('.feynman-active flag present', flagPresent);

  // 7. (INFO) lint hook registered
  let lintHookRegistered = false;
  if (settingsExists) {
    const cfg = readSettings();
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
  const titlePart = 'feynman doctor ';
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

  process.exit(0);
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
    const force = rest.includes('--force');
    cmdInstall({ force });
    break;
  }
  case 'uninstall': {
    if (rest.includes('--help')) { console.log(UNINSTALL_HELP); process.exit(0); }
    cmdUninstall();
    break;
  }
  case 'doctor': {
    if (rest.includes('--help')) { console.log(DOCTOR_HELP); process.exit(0); }
    cmdDoctor();
    break;
  }
  case 'lint': {
    cmdLint(rest);
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
