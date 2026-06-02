import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readState } from '../../lib/feynman-state.ts';
import { c } from '../cli/ansi.ts';
import { readSettings, isSessionStartHookCommand, extractHookScriptPath, targetConfig } from '../cli/settings.ts';
import { targetNames } from '../cli/targets.ts';
import { readOpenCodeSettings } from './install.ts';

// Resolve paths using os.homedir() — never tilde literal (bug #8810)
const HOME = os.homedir();

const RULES_PATH = path.resolve(import.meta.dirname, '..', '..', 'rules', 'feynman-activate.md');

// Render a doctor report: a titled frame around the check lines, then a status
// line. Shared by both doctor entry points (the only difference was the target
// name in the title). Frame width = longest stripped line + 2, min 48.
function renderDoctorReport(target: string, checks: string[], failCount: number): void {
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
}

function cmdDoctorOpenCode(): void {
  const tc = targetConfig('opencode');
  const rulesDestPath = path.join(tc.feynmanDir, 'rules.md');
  const checks: string[] = [];
  let failCount = 0;

  function check(label: string, pass: boolean): void {
    const marker = pass ? '[OK]  ' : '[FAIL]';
    const colorFn = pass ? c.green : c.red;
    checks.push(colorFn(`${marker} ${label}`));
    if (!pass) failCount++;
  }

  // 1. opencode.json exists
  const settingsExists = fs.existsSync(tc.settingsPath);
  check(`${tc.settingsPath.replace(HOME, '~')} present`, settingsExists);

  // 2. our path in instructions[]
  let pathInInstructions = false;
  if (settingsExists) {
    const settings = readOpenCodeSettings(tc.settingsPath);
    const instructions = (settings['instructions'] as string[] | undefined) ?? [];
    pathInInstructions = instructions.includes(rulesDestPath);
  }
  check(`rules path in instructions[] (${rulesDestPath.replace(HOME, '~')})`, pathInInstructions);

  // 3. rules.md exists and non-empty
  let rulesOk = false;
  try {
    const stat = fs.statSync(rulesDestPath);
    rulesOk = stat.size > 0;
  } catch (_) { /* intentionally empty */ }
  check('rules.md exists and non-empty', rulesOk);

  // 4. state.json valid
  // Raw read (no DEFAULT merge) so a state.json missing `enabled` correctly fails.
  const state = readState(tc.rootDir);
  const stateOk = state !== null && 'enabled' in state;
  const stateEnabled = state?.enabled === true;
  check('state.json valid (has enabled field)', stateOk);

  // ADR-0005: a leftover .bak means a corrupt state.json was self-healed — surface
  // it so the user knows their settings were reset to defaults. (This doctor's
  // check() has no INFO arg; the line always passes.)
  if (fs.existsSync(tc.statePath + '.bak')) {
    check('state.json recovered from corruption (backup: state.json.bak)', true);
  }

  // 5. flag matches state
  const flagPresent = fs.existsSync(tc.flagPath);
  check(
    stateEnabled ? '.feynman-active flag present when enabled' : '.feynman-active flag absent when disabled',
    stateEnabled ? flagPresent : !flagPresent
  );

  renderDoctorReport('opencode', checks, failCount);
}

// ─── Doctor ───────────────────────────────────────────────────────────────────

export function cmdDoctor(opts: { target?: string; noExit?: boolean } = {}): void {
  const target = opts.target ?? 'claude';

  if (target === 'opencode') {
    cmdDoctorOpenCode();
    process.exit(0);
  }

  if (target === 'both' || target === 'all' || target === '*') {
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

  // 2. SessionStart hook references feynman-session-start script
  let sessionHookRegistered = false;
  let sessionHookAbsPath: string | null = null;
  if (settingsExists) {
    const cfg = readSettings(target);
    const hooks = cfg['hooks'] as Record<string, Array<Record<string, unknown>>> | undefined;
    const sessionEntries = hooks?.['SessionStart'] ?? [];
    const feynmanSessionEntry = sessionEntries.find(g => {
      const hs = g['hooks'] as Array<Record<string, unknown>> | undefined;
      return hs?.some(h => isSessionStartHookCommand(h['command']));
    });
    sessionHookRegistered = !!feynmanSessionEntry;
    if (feynmanSessionEntry) {
      const hs = feynmanSessionEntry['hooks'] as Array<Record<string, unknown>>;
      const hookCmd = hs.find(h => isSessionStartHookCommand(h['command']))?.['command'] as string | undefined;
      if (hookCmd) {
        sessionHookAbsPath =
          extractHookScriptPath(hookCmd, 'feynman-session-start.ts') ??
          extractHookScriptPath(hookCmd, 'feynman-session-start.js');
      }
    }
  }
  check('hook registered (feynman-session-start in SessionStart)', sessionHookRegistered);

  // 3. Hook script file exists + readable
  let sessionHookFileOk = false;
  if (sessionHookAbsPath) {
    try {
      fs.accessSync(sessionHookAbsPath, fs.constants.R_OK);
      sessionHookFileOk = true;
    } catch (_) { /* intentionally empty */ }
  }
  check('session hook script file exists and is readable', sessionHookFileOk);

  // 4. Rules file exists + non-empty
  let rulesOk = false;
  try {
    const stat = fs.statSync(RULES_PATH);
    rulesOk = stat.size > 0;
  } catch (_) { /* intentionally empty */ }
  check('rules/feynman-activate.md exists and non-empty', rulesOk);

  // 5. state.json valid JSON + has enabled field
  // Raw read (no DEFAULT merge) so a state.json missing `enabled` correctly fails.
  const state = readState(tc.rootDir);
  const stateOk = state !== null && 'enabled' in state;
  const stateEnabled = state?.enabled === true;
  check('state.json valid (has enabled field)', stateOk);

  // ADR-0005: a leftover .bak means a corrupt state.json was self-healed — surface
  // it so the user knows their settings were reset to defaults.
  if (fs.existsSync(tc.statePath + '.bak')) {
    check('state.json recovered from corruption (backup: state.json.bak)', true, true);
  }

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

  renderDoctorReport(target, checks, failCount);

  if (!opts.noExit) process.exit(0);
}
