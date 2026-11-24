import fs from 'node:fs';
import os from 'node:os';
import {
  readSettings,
  writeSettings,
  hasCurrentFeynmanHook,
  hasAnyFeynmanHook,
  isSessionStartHookCommand,
  removeFeynmanHooks,
  bootstrapState,
  codexConfig,
  type ValidatedCodexConfig,
} from '../adapters/codex-config.ts';
import { SESSION_HOOK_PATH, sessionStartHookCommand } from '../adapters/codex-hook.ts';
import { removeActiveFlag } from '../adapters/state-store.ts';

const HOME = os.homedir();

function withSessionHook(settings: ValidatedCodexConfig, command: string): ValidatedCodexConfig {
  const hooks = settings.hooks ?? {};
  return {
    ...settings,
    hooks: {
      ...hooks,
      SessionStart: [
        ...(hooks['SessionStart'] ?? []),
        {
          matcher: 'startup|resume|compact|clear',
          hooks: [{ type: 'command', command, timeout: 5 }],
        },
      ],
    },
  };
}

function repairSessionHooks(config: ValidatedCodexConfig, command: string): ValidatedCodexConfig {
  const groups = config.hooks?.['SessionStart'] ?? [];
  if (
    !groups.some((group) => group.hooks.some((hook) => isSessionStartHookCommand(hook['command'])))
  ) {
    return withSessionHook(config, command);
  }
  const sessionStart = groups.map((group) => ({
    ...group,
    hooks: group.hooks.map((hook) =>
      hook['command'] !== command && isSessionStartHookCommand(hook['command'])
        ? { ...hook, command }
        : hook,
    ),
  }));
  return { ...config, hooks: { ...config.hooks, SessionStart: sessionStart } };
}

function installCodex(opts: Readonly<{ force: boolean }>): { readonly already: boolean } {
  const cfg = readSettings();
  const command = sessionStartHookCommand();
  const already = hasCurrentFeynmanHook(cfg, command);
  if (already && !opts.force) {
    bootstrapState();
    return { already: true };
  }
  writeSettings(
    opts.force
      ? withSessionHook(removeFeynmanHooks(cfg), command)
      : repairSessionHooks(cfg, command),
  );
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
  console.log('Open /hooks in Codex, review and trust the Feynman hook, then start a new session.');
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
