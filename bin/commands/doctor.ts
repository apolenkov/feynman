import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readState } from '../adapters/state-store.ts';
import { c } from '../cli/ansi.ts';
import {
  readSettings,
  isSessionStartHookCommand,
  extractHookScriptPath,
  codexConfig,
} from '../adapters/codex-config.ts';

const HOME = os.homedir();
const RULES_PATH = path.resolve(import.meta.dirname, '..', '..', 'rules', 'feynman-contract.md');

function renderDoctorReport(checks: string[], failCount: number): void {
  const stripped = checks.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ''));
  const innerW = Math.max(Math.max(...stripped.map((line) => line.length)) + 2, 48);
  const title = 'feynman doctor Codex ';
  console.log(`┌─ ${title}${'─'.repeat(Math.max(1, innerW - title.length - 1))}┐`);
  checks.forEach((line, i) => {
    console.log(`│ ${line}${' '.repeat(Math.max(0, innerW - 1 - (stripped[i]?.length ?? 0)))}│`);
  });
  console.log(`└${'─'.repeat(innerW)}┘`);
  console.log(failCount === 0 ? c.green('Status: OK') : c.red(`Status: ISSUES (${failCount})`));
}

export function cmdDoctor(opts: { noExit?: boolean } = {}): void {
  const tc = codexConfig();
  const checks: string[] = [];
  let failCount = 0;
  const check = (label: string, pass: boolean, info = false): void => {
    const marker = info ? '[INFO]' : pass ? '[OK]  ' : '[FAIL]';
    checks.push((info ? c.dim : pass ? c.green : c.red)(`${marker} ${label}`));
    if (!info && !pass) failCount++;
  };
  const settingsExists = fs.existsSync(tc.settingsPath);
  check(`${tc.settingsPath.replace(HOME, '~')} present`, settingsExists);
  let hookPath: string | null = null;
  if (settingsExists) {
    const hooks = readSettings()['hooks'] as
      Record<string, Array<Record<string, unknown>>> | undefined;
    const entry = (hooks?.['SessionStart'] ?? []).find((group) =>
      (group['hooks'] as Array<Record<string, unknown>> | undefined)?.some((h) =>
        isSessionStartHookCommand(h['command']),
      ),
    );
    const hook = (entry?.['hooks'] as Array<Record<string, unknown>> | undefined)?.find((h) =>
      isSessionStartHookCommand(h['command']),
    );
    hookPath = hook
      ? (extractHookScriptPath(String(hook['command']), 'feynman-session-start.ts') ??
        extractHookScriptPath(String(hook['command']), 'feynman-session-start.js'))
      : null;
  }
  check('hook registered (feynman-session-start in SessionStart)', hookPath !== null);
  let hookReadable = false;
  try {
    if (hookPath) fs.accessSync(hookPath, fs.constants.R_OK);
    hookReadable = hookPath !== null;
  } catch (_) {
    /* advisory check */
  }
  check('session hook script file exists and is readable', hookReadable);
  let rulesOk = false;
  try {
    rulesOk = fs.statSync(RULES_PATH).size > 0;
  } catch (_) {
    /* advisory check */
  }
  check('rules/feynman-contract.md exists and non-empty', rulesOk);
  const state = readState(tc.rootDir);
  const stateOk = state !== null && 'enabled' in state;
  check('state.json valid (has enabled field)', stateOk);
  if (fs.existsSync(tc.statePath + '.bak'))
    check('state.json recovered from corruption (backup: state.json.bak)', true, true);
  const enabled = state?.['enabled'] === true;
  check(
    enabled
      ? '.feynman-active flag present when enabled'
      : '.feynman-active flag absent when disabled',
    enabled === fs.existsSync(tc.flagPath),
  );
  renderDoctorReport(checks, failCount);
  if (!opts.noExit) process.exit(0);
}
