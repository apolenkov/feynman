// bin/commands/state.ts — Codex-only Feynman state management.

import fs from 'node:fs';
import { codexConfig, fatal } from '../adapters/codex-config.ts';
import {
  DEFAULT_STATE,
  isIntensity,
  isOutputStyle,
  normalizeState,
  type FeynmanState,
} from '../../lib/state/index.ts';
import { flagContent, readState, reconcileState, writeState } from '../adapters/state-store.ts';

function persistState(state: FeynmanState): void {
  const cfg = codexConfig();
  writeState(cfg.rootDir, state);
  if (state.enabled === true) {
    fs.writeFileSync(cfg.flagPath, flagContent(state));
  } else {
    try { fs.unlinkSync(cfg.flagPath); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

function printState(state: FeynmanState): void {
  const active = state.enabled === true ? 'on' : 'off';
  const style = state.output_style ?? DEFAULT_STATE.output_style;
  console.log(`feynman: ${active} · intensity ${state.intensity} · style ${style} · injections ${state.injections}`);
}

export function cmdState(args: string[]): void {
  const cfg = codexConfig();
  const [command, value] = args;

  if (!command || command === 'status') {
    if (value !== undefined || args.length > 1) fatal('state status does not accept arguments');
    printState(normalizeState(readState(cfg.rootDir)));
    return;
  }

  const current = reconcileState(cfg.rootDir).state;
  const next = { ...current };
  switch (command) {
    case 'on':
    case 'start':
      if (args.length !== 1) fatal(`state ${command} does not accept arguments`);
      next.enabled = true;
      break;
    case 'off':
    case 'stop':
      if (args.length !== 1) fatal(`state ${command} does not accept arguments`);
      next.enabled = false;
      break;
    case 'lite':
    case 'full':
    case 'ultra':
      if (args.length !== 1) fatal(`state ${command} does not accept arguments`);
      next.intensity = command;
      break;
    case 'style':
      if (!value || args.length !== 2 || !isOutputStyle(value)) {
        fatal('usage: feynman state style short|middle|full');
      }
      next.output_style = value;
      break;
    default:
      if (args.length === 1 && isIntensity(command)) next.intensity = command;
      else fatal(`unknown state command '${command}'`);
  }

  persistState(next);
  printState(next);
}
