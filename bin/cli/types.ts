// bin/cli/types.ts — shared CLI interfaces

export interface TargetConfig {
  name: string;
  label: string;
  rootDir: string;
  settingsPath: string;
  feynmanDir: string;
  statePath: string;
  flagPath: string;
  commandsDir: string | null;
}

export interface InstallResult { target: string; already: boolean; tc?: TargetConfig; }
export interface UninstallResult { target: string; missing: boolean; hadHook?: boolean; }

export interface TargetAdapter {
  install(opts: { force: boolean }): InstallResult;
  uninstall(): UninstallResult;
}

export interface ExampleEntry {
  name: string;
  title: string;
  question: string;
  path: string;
}
