import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readSettings,
  writeSettings,
  hasFeynmanHook,
  hasAnyFeynmanHook,
  removeFeynmanHooks,
  bootstrapState,
  codexConfig,
  type ValidatedCodexConfig,
} from '../adapters/codex-config.ts';
import { sessionStartHookCommand } from '../adapters/codex-hook.ts';
import { removeActiveFlag } from '../adapters/state-store.ts';

const HOME = os.homedir();
const _hookExt = fs.existsSync(
  path.resolve(import.meta.dirname, '..', '..', 'hooks', 'feynman-session-start.ts'),
)
  ? '.ts'
  : '.js';
const SESSION_HOOK_PATH = path.resolve(
  import.meta.dirname,
  '..',
  '..',
  'hooks',
  `feynman-session-start${_hookExt}`,
);

function withSessionHook(settings: ValidatedCodexConfig): ValidatedCodexConfig {
  const withoutFeynman = removeFeynmanHooks(settings);
  const hooks = withoutFeynman.hooks ?? {};
  return {
    ...withoutFeynman,
    hooks: {
      ...hooks,
      SessionStart: [
        ...(hooks['SessionStart'] ?? []),
        {
          matcher: 'startup|resume|compact|clear',
          hooks: [{ type: 'command', command: sessionStartHookCommand(), timeout: 5 }],
        },
      ],
    },
  };
}

function installCodex(opts: Readonly<{ force: boolean }>): { readonly already: boolean } {
  const cfg = readSettings();
  const already = hasFeynmanHook(cfg);
  if (already && !opts.force) {
    bootstrapState();
    return { already: true };
  }
  writeSettings(withSessionHook(cfg));
  bootstrapState();
  return { already: false };
}

export function cmdInstall(opts: Readonly<{ force: boolean }>): void {
  const result = installCodex(opts);
  if (result.already) {
    console.log('hook: already installed (Codex)');
    process.exit(0);
  }
  const tc = codexConfig();
  console.log('');
  console.log('┌─ feynman installed ──────────────────────────────────────────┐');
  console.log('│ client:   Codex');
  console.log(`│ hook:     ${SESSION_HOOK_PATH}`);
  console.log(`│ config:   ${tc.settingsPath.replace(HOME, '~')}`);
  console.log(`│ state:    ${tc.statePath.replace(HOME, '~')}`);
  console.log(`│ flag:     ${tc.flagPath.replace(HOME, '~')}`);
  console.log('└──────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('Restart Codex to activate feynman full mode.');
  process.exit(0);
}

export function cmdUninstall(): void {
  const tc = codexConfig();
  if (!fs.existsSync(tc.settingsPath)) {
    removeActiveFlag(tc.rootDir);
    console.log('feynman: no Codex hook found — nothing to uninstall.');
    process.exit(0);
  }
  const cfg = readSettings();
  const hadHook = hasAnyFeynmanHook(cfg);
  writeSettings(removeFeynmanHooks(cfg));
  removeActiveFlag(tc.rootDir);
  console.log(
    hadHook
      ? 'feynman disabled for Codex. State preserved. Re-enable: feynman install'
      : 'feynman: no Codex hook found — nothing to uninstall.',
  );
  process.exit(0);
}
