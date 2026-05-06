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
const HOME = os.homedir();

// Hook script lives relative to this file
const HOOK_PATH = path.resolve(__dirname, '..', 'hooks', 'feynman-activate.js');
const RULES_PATH = path.resolve(__dirname, '..', 'rules', 'feynman-activate.md');

const DEFAULT_STATE = { enabled: true, intensity: 'full', injections: 0 };
const VALID_TARGETS = ['claude', 'codex', 'both'];

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

function parseTarget(args, fallback = 'claude') {
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
    console.error(`feynman: invalid --target '${target}' (expected claude, codex, or both)`);
    process.exit(2);
  }
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
  version      Print version number
  help         Show this help

${c.bold('Options:')}
  --help, -h   Show help for a command
  --target     claude | codex | both (default: claude)
  --force      (install) Re-register even if already installed

${c.bold('Examples:')}
  npx feynman install
  npx feynman install --target codex
  npx feynman install --target both
  npx feynman doctor
  feynman lint response.md
  feynman uninstall
`;

const INSTALL_HELP = `${c.bold('feynman install')} — register feynman hook

${c.bold('Usage:')}
  feynman install [--target claude|codex|both] [--force]

${c.bold('Options:')}
  --target  Install into Claude Code, Codex, or both (default: claude)
  --force   Re-register hook even if already installed

Claude creates:
  ~/.claude/.feynman/state.json   — feynman state (enabled, intensity, injections)
  ~/.claude/.feynman-active        — presence flag

Codex creates:
  ~/.codex/hooks.json              — UserPromptSubmit hook registration
  ~/.codex/.feynman/state.json     — feynman state (enabled, intensity, injections)
  ~/.codex/.feynman-active         — presence flag

Idempotent by default: skips if feynman-activate.js entry already exists.
`;

const UNINSTALL_HELP = `${c.bold('feynman uninstall')} — remove feynman hook

${c.bold('Usage:')}
  feynman uninstall [--target claude|codex|both]

Removes feynman hook entries from target config.
Preserves .feynman/state.json (user data).
Removes .feynman-active flag.

Idempotent: safe to run multiple times.
`;

const DOCTOR_HELP = `${c.bold('feynman doctor')} — check feynman installation health

${c.bold('Usage:')}
  feynman doctor [--target claude|codex]

Checks:
  1. target hook config present
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
  return ((settings.hooks && settings.hooks.UserPromptSubmit) || []).some(g =>
    g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
  );
}

function removeFeynmanHooks(settings) {
  if (!settings.hooks || !Array.isArray(settings.hooks.UserPromptSubmit)) return settings;
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(g =>
    !(g.hooks && g.hooks.some(h =>
      h.command && (
        h.command.includes('feynman-activate.js') ||
        h.command.includes('feynman-lint.js')
      )
    ))
  );
  if (settings.hooks.UserPromptSubmit.length === 0) {
    delete settings.hooks.UserPromptSubmit;
  }
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }
  return settings;
}

function bootstrapState(target) {
  const cfg = targetConfig(target);
  fs.mkdirSync(cfg.feynmanDir, { recursive: true });
  if (!fs.existsSync(cfg.statePath)) {
    fs.writeFileSync(cfg.statePath, JSON.stringify(DEFAULT_STATE, null, 2) + '\n');
  }
  fs.writeFileSync(cfg.flagPath, DEFAULT_STATE.intensity);
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
  cfg.hooks.UserPromptSubmit = cfg.hooks.UserPromptSubmit || [];

  // Idempotency check
  const already = hasFeynmanHook(cfg);

  if (already && !force) {
    bootstrapState(target);
    if (target === 'claude') installClaudeCommand();
    return { target, already: true };
  }

  // If force + already, remove old entry first
  if (already && force) {
    removeFeynmanHooks(cfg);
    cfg.hooks = cfg.hooks || {};
    cfg.hooks.UserPromptSubmit = cfg.hooks.UserPromptSubmit || [];
  }

  // Append hook entry
  cfg.hooks.UserPromptSubmit.push({
    hooks: [{
      type: 'command',
      command: hookCommandFor(target),
      timeout: 5,
      statusMessage: 'Injecting diagram rules...',
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
  console.log('Restart Claude Code or Codex to activate feynman.');

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
    console.log(`feynman disabled for ${labels}. State preserved. Re-enable: npx feynman install --target ${opts.target}`);
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

  // 2. UserPromptSubmit hook references feynman-activate.js
  let hookRegistered = false;
  let hookAbsPath = null;
  if (settingsExists) {
    const cfg = readSettings(target);
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
    const state = JSON.parse(fs.readFileSync(tc.statePath, 'utf8'));
    stateOk = 'enabled' in state;
  } catch (_) {}
  check('state.json valid (has enabled field)', stateOk);

  // 6. .feynman-active flag present
  const flagPresent = fs.existsSync(tc.flagPath);
  check('.feynman-active flag present', flagPresent);

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
