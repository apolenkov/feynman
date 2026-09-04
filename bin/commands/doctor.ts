import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { readState } from '../adapters/state-store.ts';
import { c } from '../cli/ansi.ts';
import {
  inspectJsonConfig,
  isSessionStartHookCommand,
  extractHookScriptPath,
  codexConfig,
  type ValidatedCodexConfig,
} from '../adapters/codex-config.ts';

const HOME = os.homedir();
const RULES_PATH = path.resolve(import.meta.dirname, '..', '..', 'rules', 'feynman-contract.md');

interface DoctorCheck {
  readonly label: string;
  readonly pass: boolean;
  readonly info?: boolean;
}

function renderCheck(check: DoctorCheck): string {
  const marker = check.info === true ? '[INFO]' : check.pass ? '[OK]  ' : '[FAIL]';
  return (check.info === true ? c.dim : check.pass ? c.green : c.red)(`${marker} ${check.label}`);
}

function renderDoctorReport(checks: readonly DoctorCheck[]): void {
  const rendered = checks.map(renderCheck);
  const stripped = rendered.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ''));
  const innerW = Math.max(Math.max(...stripped.map((line) => line.length)) + 2, 48);
  const title = 'feynman doctor Codex ';
  console.log(`┌─ ${title}${'─'.repeat(Math.max(1, innerW - title.length - 1))}┐`);
  rendered.forEach((line, i) => {
    console.log(`│ ${line}${' '.repeat(Math.max(0, innerW - 1 - (stripped[i]?.length ?? 0)))}│`);
  });
  console.log(`└${'─'.repeat(innerW)}┘`);
  const failCount = checks.filter((check) => check.info !== true && !check.pass).length;
  console.log(failCount === 0 ? c.green('Status: OK') : c.red(`Status: ISSUES (${failCount})`));
}

function findSessionHookPath(settings: ValidatedCodexConfig): string | null {
  const hook = (settings.hooks?.['SessionStart'] ?? [])
    .flatMap((group) => group.hooks)
    .find((candidate) => isSessionStartHookCommand(candidate['command']));
  if (!hook) return null;
  const command = hook['command'];
  if (typeof command !== 'string') return null;
  return (
    extractHookScriptPath(command, 'feynman-session-start.ts') ??
    extractHookScriptPath(command, 'feynman-session-start.js')
  );
}

function isReadable(filePath: string | null): boolean {
  if (filePath === null) return false;
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isNonEmptyFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

function collectDoctorChecks(): readonly DoctorCheck[] {
  const tc = codexConfig();
  const settingsExists = fs.existsSync(tc.settingsPath);
  const settings = settingsExists ? inspectJsonConfig(tc.settingsPath) : null;
  const hookPath = settings?.kind === 'ok' ? findSessionHookPath(settings.config) : null;
  const state = readState(tc.rootDir);
  const stateOk = state !== null && 'enabled' in state;
  const enabled = state?.['enabled'] === true;
  const recoveryCheck = fs.existsSync(tc.statePath + '.bak')
    ? [
        {
          label: 'state.json recovered from corruption (backup: state.json.bak)',
          pass: true,
          info: true,
        },
      ]
    : [];
  return [
    { label: `${tc.settingsPath.replace(HOME, '~')} present`, pass: settingsExists },
    ...(settings?.kind === 'error'
      ? [{ label: `hook config invalid: ${settings.message}`, pass: false }]
      : []),
    { label: 'hook registered (feynman-session-start in SessionStart)', pass: hookPath !== null },
    { label: 'session hook script file exists and is readable', pass: isReadable(hookPath) },
    { label: 'rules/feynman-contract.md exists and non-empty', pass: isNonEmptyFile(RULES_PATH) },
    { label: 'state.json valid (has enabled field)', pass: stateOk },
    ...recoveryCheck,
    {
      label: enabled
        ? '.feynman-active flag present when enabled'
        : '.feynman-active flag absent when disabled',
      pass: enabled === fs.existsSync(tc.flagPath),
    },
  ];
}

export function cmdDoctor(opts: Readonly<{ noExit?: boolean }> = {}): void {
  renderDoctorReport(collectDoctorChecks());
  if (opts.noExit !== true) process.exit(0);
}
