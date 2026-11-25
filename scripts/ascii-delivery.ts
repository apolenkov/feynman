import fs from 'node:fs';
import path from 'node:path';
import { type Arm, isRecord, type GenerationCall } from './ascii-call-plan.ts';
import {
  errorMessage,
  combinedError,
  fileHash,
  MAX_BUFFER_BYTES,
  saveCommandEvidence,
  commandFailed,
  commandDiagnostic,
  writeJson,
  sha256,
  readInjectionCount,
  type PackagedArtifact,
  runRecordedCommand,
} from './ascii-evidence.ts';
import { type EvaluationCommandRunner } from './evaluate.ts';
import {
  type SkillDiscoveryRunner,
  type HookTrustRunner,
  listedHooks,
} from './ascii-app-server.ts';

const NATIVE_PLUGIN_ID = 'feynman@feynman';

const NETWORK_VARIABLE =
  /^(HTTPS?_PROXY|ALL_PROXY|NO_PROXY|https?_proxy|all_proxy|no_proxy|SSL_CERT_FILE|SSL_CERT_DIR|NODE_EXTRA_CA_CERTS)$/;

export interface IsolatedHome {
  readonly arm: Arm;
  readonly home: string;
  readonly codexHome: string;
  readonly environment: Readonly<NodeJS.ProcessEnv>;
}

export interface InstalledSkill {
  readonly path: string;
  readonly settingsPath: string;
}

export interface HookWrapper {
  readonly originalCommand: string;
  readonly wrappedCommand: string;
  readonly adapterPath: string;
  readonly adapterHash: string;
}

function isolatedEnvironment(
  environment: Readonly<NodeJS.ProcessEnv>,
  home: string,
  codexHome: string,
): Readonly<NodeJS.ProcessEnv> {
  const network = Object.fromEntries(
    Object.entries(environment).filter(([name]) => NETWORK_VARIABLE.test(name)),
  );
  return {
    PATH: environment['PATH'],
    HOME: home,
    CODEX_HOME: codexHome,
    NO_COLOR: '1',
    ...network,
  };
}

function createIsolatedHome(
  arm: Arm,
  temporaryRoot: string,
  authSource: string,
  environment: Readonly<NodeJS.ProcessEnv>,
  removeTemporaryHome: (home: string) => void,
): IsolatedHome {
  const home = fs.mkdtempSync(path.join(temporaryRoot, `feynman-ascii-${arm}-`));
  try {
    const codexHome = path.join(home, '.codex');
    fs.mkdirSync(codexHome, { mode: 0o700 });
    const authTarget = path.join(codexHome, 'auth.json');
    fs.copyFileSync(authSource, authTarget);
    fs.chmodSync(authTarget, 0o600);
    return {
      arm,
      home,
      codexHome,
      environment: isolatedEnvironment(environment, home, codexHome),
    };
  } catch (error) {
    const primaryError = error instanceof Error ? error : new Error(errorMessage(error));
    try {
      removeTemporaryHome(home);
    } catch (cleanupError) {
      throw combinedError(primaryError, cleanupError, 'Additional cleanup failure');
    }
    throw primaryError;
  }
}

function pathExists(file: string): boolean {
  return fs.existsSync(file);
}

function baselineSnapshot(home: IsolatedHome): Readonly<Record<string, unknown>> {
  return {
    hooksPresent: pathExists(path.join(home.codexHome, 'hooks.json')),
    globalInstructionsPresent: pathExists(path.join(home.codexHome, 'AGENTS.md')),
    userSkillsPresent: pathExists(path.join(home.codexHome, 'skills')),
    feynmanStatePresent: pathExists(path.join(home.codexHome, '.feynman')),
    feynmanActivePresent: pathExists(path.join(home.codexHome, '.feynman-active')),
    pluginCachePresent: pathExists(path.join(home.codexHome, 'plugins', 'cache', 'feynman')),
  };
}

export function hookPreferenceSnapshot(home: IsolatedHome): Readonly<Record<string, unknown>> {
  const statePath = path.join(home.codexHome, '.feynman', 'state.json');
  const preferences = readHookPreferences(statePath);
  return {
    preferences,
    configHash: fileHash(path.join(home.codexHome, 'config.toml')),
    hooksHash: fileHash(path.join(home.codexHome, 'hooks.json')),
    activeFlagHash: fileHash(path.join(home.codexHome, '.feynman-active')),
  };
}

function readHookPreferences(statePath: string): unknown {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return isRecord(parsed)
      ? {
          enabled: parsed['enabled'],
          intensity: parsed['intensity'],
          output_style: parsed['output_style'],
        }
      : null;
  } catch {
    return null;
  }
}

export function nativeSnapshot(
  home: IsolatedHome,
  installed: InstalledSkill,
): Readonly<Record<string, unknown>> {
  return {
    hooksPresent: pathExists(path.join(home.codexHome, 'hooks.json')),
    feynmanStatePresent: pathExists(path.join(home.codexHome, '.feynman')),
    feynmanActivePresent: pathExists(path.join(home.codexHome, '.feynman-active')),
    configHash: fileHash(path.join(home.codexHome, 'config.toml')),
    skillHash: fileHash(installed.path),
    settingsHash: fileHash(installed.settingsPath),
  };
}

export function sameSnapshot(
  left: Readonly<Record<string, unknown>>,
  right: Readonly<Record<string, unknown>>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function checkedSetupCommand(
  runner: EvaluationCommandRunner,
  output: string,
  stem: string,
  command: string,
  args: readonly string[],
  home: IsolatedHome,
): void {
  const result = runner(command, args, {
    cwd: home.home,
    encoding: 'utf8',
    env: home.environment,
    timeout: 30_000,
    maxBuffer: MAX_BUFFER_BYTES,
  });
  saveCommandEvidence(output, stem, result);
  if (commandFailed(result)) {
    throw new Error(
      `${stem} failed${commandDiagnostic(result).length === 0 ? '' : `:\n${commandDiagnostic(result)}`}`,
    );
  }
}

function canonicalPath(file: string): string {
  return fs.realpathSync(file);
}

function installedSkillFromDiscovery(
  result: unknown,
  codexHome: string,
  sourceSkill: string,
  sourceSettings: string,
): InstalledSkill {
  if (!isRecord(result) || !Array.isArray(result['data'])) {
    throw new Error('skills/list returned no data');
  }
  const skills = result['data'].flatMap((entry: unknown): readonly unknown[] => {
    return isRecord(entry) && Array.isArray(entry['skills']) ? entry['skills'] : [];
  });
  const installed = skills.find(
    (skill) =>
      isRecord(skill) &&
      skill['pluginId'] === NATIVE_PLUGIN_ID &&
      skill['enabled'] === true &&
      typeof skill['path'] === 'string',
  );
  if (!isRecord(installed) || typeof installed['path'] !== 'string') {
    throw new Error('Installed feynman skill was not discovered');
  }
  const installedPath = canonicalPath(installed['path']);
  const canonicalCodexHome = `${canonicalPath(codexHome)}${path.sep}`;
  if (!installedPath.startsWith(canonicalCodexHome)) {
    throw new Error('Discovered feynman skill is outside the isolated CODEX_HOME');
  }
  const settingsPath = path.join(path.dirname(installedPath), 'references', 'settings.md');
  if (!fs.existsSync(settingsPath))
    throw new Error('Installed feynman settings reference is missing');
  if (!fs.readFileSync(installedPath).equals(fs.readFileSync(sourceSkill))) {
    throw new Error('Installed feynman SKILL.md differs from source');
  }
  if (!fs.readFileSync(settingsPath).equals(fs.readFileSync(sourceSettings))) {
    throw new Error('Installed feynman settings reference differs from source');
  }
  return { path: installedPath, settingsPath };
}

async function setupNative(
  packageRoot: string,
  output: string,
  home: IsolatedHome,
  runner: EvaluationCommandRunner,
  discover: SkillDiscoveryRunner,
): Promise<InstalledSkill> {
  checkedSetupCommand(
    runner,
    output,
    'native-marketplace-add',
    'codex',
    ['plugin', 'marketplace', 'add', packageRoot, '--json'],
    home,
  );
  checkedSetupCommand(
    runner,
    output,
    'native-plugin-add',
    'codex',
    ['plugin', 'add', NATIVE_PLUGIN_ID, '--json'],
    home,
  );
  const discovery = await discover(home.environment, home.home);
  fs.writeFileSync(path.join(output, 'native-skills-list.events.jsonl'), discovery.stdout);
  fs.writeFileSync(path.join(output, 'native-skills-list.stderr.txt'), discovery.stderr);
  writeJson(path.join(output, 'native-skills-list.status.json'), {
    status: discovery.status,
    error: discovery.error ?? null,
  });
  if (discovery.status !== 0 || discovery.error !== undefined) {
    throw new Error(
      `skills/list failed${discovery.error === undefined ? '' : `: ${discovery.error}`}`,
    );
  }
  const sourceSkill = path.join(packageRoot, 'plugins', 'feynman', 'skills', 'feynman', 'SKILL.md');
  const sourceSettings = path.join(
    packageRoot,
    'plugins',
    'feynman',
    'skills',
    'feynman',
    'references',
    'settings.md',
  );
  const installed = installedSkillFromDiscovery(
    discovery.result,
    home.codexHome,
    sourceSkill,
    sourceSettings,
  );
  writeJson(path.join(output, 'native-skill-verification.json'), {
    pluginId: NATIVE_PLUGIN_ID,
    installedSkillPath: installed.path,
    underIsolatedCodexHome: true,
    skillMatchesSource: true,
    settingsMatchSource: true,
    skillHash: fileHash(installed.path),
    settingsHash: fileHash(installed.settingsPath),
  });
  return installed;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function installHookCaptureWrapper(root: string, output: string, home: IsolatedHome): HookWrapper {
  const hooksPath = path.join(home.codexHome, 'hooks.json');
  const parsed: unknown = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  if (!isRecord(parsed) || !isRecord(parsed['hooks'])) {
    throw new Error('Installed hooks.json has no hooks object');
  }
  const groups = parsed['hooks']['SessionStart'];
  if (!Array.isArray(groups)) throw new Error('Installed hooks.json has no SessionStart groups');
  const originalCommands = groups.flatMap((group): readonly string[] => {
    if (!isRecord(group) || !Array.isArray(group['hooks'])) return [];
    return group['hooks'].flatMap((hook): readonly string[] => {
      if (!isRecord(hook) || typeof hook['command'] !== 'string') return [];
      return hook['command'].includes('feynman-session-start.') ? [hook['command']] : [];
    });
  });
  if (originalCommands.length !== 1 || originalCommands[0] === undefined) {
    throw new Error('Expected exactly one installed Feynman SessionStart command');
  }
  const originalCommand = originalCommands[0];
  const adapterSource = path.join(root, 'scripts', 'capture-evaluation-hook.ts');
  const adapterBytes = fs.readFileSync(adapterSource);
  const adapterHash = sha256(adapterBytes);
  const adapterPath = path.join(home.home, 'artifact', 'evaluation', 'capture-evaluation-hook.ts');
  fs.mkdirSync(path.dirname(adapterPath), { recursive: true });
  fs.writeFileSync(adapterPath, adapterBytes, { flag: 'wx', mode: 0o500 });
  const evidenceCopy = path.join(output, 'capture-evaluation-hook.ts');
  fs.writeFileSync(evidenceCopy, adapterBytes, { flag: 'wx', mode: 0o400 });
  if (fileHash(adapterPath) !== adapterHash || fileHash(evidenceCopy) !== adapterHash) {
    throw new Error('Frozen hook capture adapter differs from its source bytes');
  }
  const encodedCommand = Buffer.from(originalCommand).toString('base64url');
  const wrappedCommand = [
    shellQuote(process.execPath),
    shellQuote(adapterPath),
    shellQuote(encodedCommand),
  ].join(' ');
  const wrappedGroups = (groups as readonly unknown[]).map((group): unknown => {
    if (!isRecord(group) || !Array.isArray(group['hooks'])) return group;
    const groupHooks: readonly unknown[] = group['hooks'];
    return {
      ...group,
      hooks: groupHooks.map((hook): unknown =>
        isRecord(hook) && hook['command'] === originalCommand
          ? { ...hook, command: wrappedCommand }
          : hook,
      ),
    };
  });
  writeJson(hooksPath, {
    ...parsed,
    hooks: { ...parsed['hooks'], SessionStart: wrappedGroups },
  });
  const wrapper = { originalCommand, wrappedCommand, adapterPath, adapterHash };
  writeJson(path.join(output, 'hook-capture-wrapper.json'), wrapper);
  return wrapper;
}

async function setupHook(
  root: string,
  packageRoot: string,
  output: string,
  home: IsolatedHome,
  runner: EvaluationCommandRunner,
  trustHooks: HookTrustRunner,
): Promise<HookWrapper> {
  fs.writeFileSync(path.join(home.codexHome, 'config.toml'), '[features]\nhooks = true\n', {
    mode: 0o600,
  });
  checkedSetupCommand(
    runner,
    output,
    'hook-install',
    process.execPath,
    [path.join(packageRoot, 'bin', 'feynman.js'), 'install'],
    home,
  );
  if (
    !fs.existsSync(path.join(home.codexHome, 'hooks.json')) ||
    !fs.existsSync(path.join(home.codexHome, '.feynman', 'state.json')) ||
    !fs.existsSync(path.join(home.codexHome, '.feynman-active'))
  ) {
    throw new Error('Hook install did not create its isolated hook and state files');
  }
  writeJson(path.join(output, 'hook-install-verification.json'), {
    hooksFeatureEnabled: true,
    hooksPresent: true,
    statePresent: true,
    activeFlagPresent: true,
    injectionsBeforeRequests: readInjectionCount(home.codexHome),
  });
  const wrapper = installHookCaptureWrapper(root, output, home);
  const trust = await trustHooks(home.environment, home.home);
  fs.writeFileSync(path.join(output, 'hook-trust.events.jsonl'), trust.stdout);
  fs.writeFileSync(path.join(output, 'hook-trust.stderr.txt'), trust.stderr);
  writeJson(path.join(output, 'hook-trust.status.json'), {
    status: trust.status,
    error: trust.error ?? null,
  });
  if (trust.status !== 0 || trust.error !== undefined) {
    throw new Error(`Hook trust failed${trust.error === undefined ? '' : `: ${trust.error}`}`);
  }
  const sessionStartHooks = listedHooks(trust.verified).filter(
    (hook) => hook.eventName === 'sessionStart' && hook.command === wrapper.wrappedCommand,
  );
  const trustedCount = sessionStartHooks.filter((hook) => hook.trustStatus === 'trusted').length;
  if (sessionStartHooks.length === 0 || trustedCount !== sessionStartHooks.length) {
    throw new Error('Hook trust verification did not prove every SessionStart hook trusted');
  }
  writeJson(path.join(output, 'hook-trust-verification.json'), {
    sessionStartHooks: sessionStartHooks.length,
    trustedSessionStartHooks: trustedCount,
    allSessionStartHooksTrusted: true,
  });
  return wrapper;
}

export function applySetting(
  packageRoot: string,
  output: string,
  call: GenerationCall,
  home: IsolatedHome,
  runner: EvaluationCommandRunner,
): void {
  if (call.setting === null) return;
  checkedSetupCommand(
    runner,
    output,
    `${call.id}-set-intensity`,
    process.execPath,
    [path.join(packageRoot, 'bin', 'feynman.js'), 'state', call.setting.intensity],
    home,
  );
  checkedSetupCommand(
    runner,
    output,
    `${call.id}-set-style`,
    process.execPath,
    [path.join(packageRoot, 'bin', 'feynman.js'), 'state', 'style', call.setting.outputStyle],
    home,
  );
}

export interface DeliveryContext {
  readonly homesByArm: ReadonlyMap<Arm, IsolatedHome>;
  readonly packageRootsByArm: ReadonlyMap<Arm, string>;
  readonly installedSkill: InstalledSkill | null;
  readonly nativeInitial: Readonly<Record<string, unknown>> | null;
  readonly hookWrapper: HookWrapper | null;
}

export function createSelectedHomes(
  arms: readonly Arm[],
  temporaryRoot: string,
  authSource: string,
  environment: Readonly<NodeJS.ProcessEnv>,
  removeTemporaryHome: (home: string) => void,
): readonly IsolatedHome[] {
  const [arm, ...remaining] = arms;
  if (arm === undefined) return [];
  const home = createIsolatedHome(arm, temporaryRoot, authSource, environment, removeTemporaryHome);
  try {
    return [
      home,
      ...createSelectedHomes(
        remaining,
        temporaryRoot,
        authSource,
        environment,
        removeTemporaryHome,
      ),
    ];
  } catch (error) {
    const primaryError = error instanceof Error ? error : new Error(errorMessage(error));
    try {
      removeTemporaryHome(home.home);
    } catch (cleanupError) {
      throw combinedError(primaryError, cleanupError, 'Additional cleanup failure');
    }
    throw primaryError;
  }
}

export async function configureDeliveries(
  root: string,
  output: string,
  homes: readonly IsolatedHome[],
  artifact: PackagedArtifact,
  runner: EvaluationCommandRunner,
  discover: SkillDiscoveryRunner,
  trustHooks: HookTrustRunner,
): Promise<DeliveryContext> {
  const homesByArm: ReadonlyMap<Arm, IsolatedHome> = new Map(homes.map((home) => [home.arm, home]));
  const packageRootsByArm: ReadonlyMap<Arm, string> = new Map(
    homes
      .filter((home) => home.arm !== 'baseline')
      .map((home) => [home.arm, extractPackagedArtifact(root, output, artifact, home, runner)]),
  );
  const baselineHome = homesByArm.get('baseline');
  if (baselineHome !== undefined) {
    const snapshot = baselineSnapshot(baselineHome);
    writeJson(path.join(output, 'baseline-initial-state.json'), snapshot);
    if (Object.values(snapshot).some((value) => value === true)) {
      throw new Error('Baseline home unexpectedly contains inherited delivery state');
    }
  }
  const nativeHome = homesByArm.get('native');
  const nativePackage = packageRootsByArm.get('native');
  const installedSkill =
    nativeHome === undefined || nativePackage === undefined
      ? null
      : await setupNative(nativePackage, output, nativeHome, runner, discover);
  const nativeInitial =
    nativeHome === undefined || installedSkill === null
      ? null
      : nativeSnapshot(nativeHome, installedSkill);
  if (nativeInitial !== null) {
    writeJson(path.join(output, 'native-initial-state.json'), nativeInitial);
    if (
      nativeInitial['hooksPresent'] === true ||
      nativeInitial['feynmanStatePresent'] === true ||
      nativeInitial['feynmanActivePresent'] === true
    ) {
      throw new Error('Native skill home unexpectedly contains hook state');
    }
  }
  const hookHome = homesByArm.get('hook');
  const hookPackage = packageRootsByArm.get('hook');
  const hookWrapper =
    hookHome === undefined || hookPackage === undefined
      ? null
      : await setupHook(root, hookPackage, output, hookHome, runner, trustHooks);
  return { homesByArm, packageRootsByArm, installedSkill, nativeInitial, hookWrapper };
}

function extractPackagedArtifact(
  root: string,
  output: string,
  artifact: PackagedArtifact,
  home: IsolatedHome,
  runner: EvaluationCommandRunner,
): string {
  const extractionRoot = path.join(home.home, 'artifact');
  fs.mkdirSync(extractionRoot, { mode: 0o700 });
  runRecordedCommand(
    runner,
    output,
    `${home.arm}-package-extract`,
    'tar',
    ['-xzf', artifact.tarball, '-C', extractionRoot],
    {
      cwd: root,
      encoding: 'utf8',
      env: home.environment,
      timeout: 30_000,
      maxBuffer: MAX_BUFFER_BYTES,
    },
  );
  const packageRoot = path.join(extractionRoot, 'package');
  const comparisons: readonly (readonly [string, string])[] = [
    ['plugins/feynman/skills/feynman/SKILL.md', 'plugins/feynman/skills/feynman/SKILL.md'],
    [
      'plugins/feynman/skills/feynman/references/settings.md',
      'plugins/feynman/skills/feynman/references/settings.md',
    ],
    ['rules/feynman-contract.md', 'rules/feynman-contract.md'],
  ];
  for (const [packagedPath, sourcePath] of comparisons) {
    const packaged = path.join(packageRoot, packagedPath);
    const source = path.join(root, sourcePath);
    if (!fs.existsSync(packaged) || !fs.readFileSync(packaged).equals(fs.readFileSync(source))) {
      throw new Error(`Packaged delivery differs from recorded source: ${packagedPath}`);
    }
  }
  if (!fs.existsSync(path.join(packageRoot, 'bin', 'feynman.js'))) {
    throw new Error('Packaged feynman CLI is missing');
  }
  writeJson(path.join(output, `${home.arm}-package-verification.json`), {
    tarballHash: artifact.tarballHash,
    extractedUnderIsolatedHome: true,
    skillMatchesSource: true,
    settingsMatchSource: true,
    rulesMatchSource: true,
    packagedCliPresent: true,
  });
  return packageRoot;
}
