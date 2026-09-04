// bin/commands/state.ts — Codex-only Feynman state management.

import { codexConfig, fatal } from '../adapters/codex-config.ts';
import { isOutputStyle, normalizeState, type FeynmanState } from '../../lib/state/index.ts';
import { changeState, readState } from '../adapters/state-store.ts';

export type StateArguments =
  | { readonly kind: 'status' }
  | { readonly kind: 'change'; readonly change: Readonly<Partial<FeynmanState>> }
  | { readonly kind: 'error'; readonly message: string };

function printState(state: FeynmanState): void {
  const active = state.enabled ? 'on' : 'off';
  const style = state.output_style;
  console.log(
    `feynman: ${active} · intensity ${state.intensity} · style ${style} · injections ${state.injections}`,
  );
}

export function parseStateArguments(args: readonly string[]): StateArguments {
  const [command, value] = args;
  if (command === undefined || command === '' || command === 'status') {
    return value === undefined && args.length <= 1
      ? { kind: 'status' }
      : { kind: 'error', message: 'state status does not accept arguments' };
  }
  switch (command) {
    case 'on':
    case 'start':
      return args.length === 1
        ? { kind: 'change', change: { enabled: true } }
        : { kind: 'error', message: `state ${command} does not accept arguments` };
    case 'off':
    case 'stop':
      return args.length === 1
        ? { kind: 'change', change: { enabled: false } }
        : { kind: 'error', message: `state ${command} does not accept arguments` };
    case 'lite':
    case 'full':
    case 'ultra':
      return args.length === 1
        ? { kind: 'change', change: { intensity: command } }
        : { kind: 'error', message: `state ${command} does not accept arguments` };
    case 'style':
      if (value === undefined || value === '' || args.length !== 2 || !isOutputStyle(value)) {
        return { kind: 'error', message: 'usage: feynman state style short|middle|full' };
      }
      return { kind: 'change', change: { output_style: value } };
    default:
      return { kind: 'error', message: `unknown state command '${command}'` };
  }
}

export function cmdState(args: readonly string[]): void {
  const parsed = parseStateArguments(args);
  if (parsed.kind === 'error') return fatal(parsed.message);
  const cfg = codexConfig();
  if (parsed.kind === 'status') {
    printState(normalizeState(readState(cfg.rootDir)));
    return;
  }
  const next = changeState(cfg.rootDir, parsed.change);
  printState(next);
}
