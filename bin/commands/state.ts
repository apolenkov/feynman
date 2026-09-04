// bin/commands/state.ts — Codex-only Feynman state management.

import { codexConfig, fatal } from '../adapters/codex-config.ts';
import {
  DEFAULT_STATE,
  isOutputStyle,
  normalizeState,
  type FeynmanState,
} from '../../lib/state/index.ts';
import { changeState, readState } from '../adapters/state-store.ts';

function printState(state: FeynmanState): void {
  const active = state.enabled ? 'on' : 'off';
  const style = state.output_style ?? DEFAULT_STATE.output_style;
  console.log(
    `feynman: ${active} · intensity ${state.intensity} · style ${style} · injections ${state.injections}`,
  );
}

function parseStateChange(args: readonly string[]): Partial<FeynmanState> {
  const [command, value] = args;
  switch (command) {
    case 'on':
    case 'start':
      if (args.length !== 1) fatal(`state ${command} does not accept arguments`);
      return { enabled: true };
    case 'off':
    case 'stop':
      if (args.length !== 1) fatal(`state ${command} does not accept arguments`);
      return { enabled: false };
    case 'lite':
    case 'full':
    case 'ultra':
      if (args.length !== 1) fatal(`state ${command} does not accept arguments`);
      return { intensity: command };
    case 'style':
      if (!value || args.length !== 2 || !isOutputStyle(value)) {
        fatal('usage: feynman state style short|middle|full');
      }
      return { output_style: value };
    default:
      return fatal(`unknown state command '${command ?? ''}'`);
  }
}

export function cmdState(args: readonly string[]): void {
  const cfg = codexConfig();
  const [command, value] = args;

  if (!command || command === 'status') {
    if (value !== undefined || args.length > 1) fatal('state status does not accept arguments');
    printState(normalizeState(readState(cfg.rootDir)));
    return;
  }

  const change = parseStateChange(args);
  const next = changeState(cfg.rootDir, change);
  printState(next);
}
