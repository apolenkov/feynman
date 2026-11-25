import { type ReleaseCommandRunner } from './release-smoke.ts';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function verifyTarballManifest(
  runner: ReleaseCommandRunner,
  root: string,
  tarball: string,
  filesField: readonly string[],
): void {
  const result = runner('tar', ['-tzf', tarball], { cwd: root, env: { ...process.env } });
  if (result.status !== 0 || result.error !== undefined || result.signal !== null)
    throw new Error(
      [
        'failed to list tarball contents',
        result.error?.message ?? '',
        result.signal === null ? '' : `terminated by signal: ${result.signal}`,
        result.stderr,
      ]
        .filter((part) => part.length > 0)
        .join('\n'),
    );
  const entries = new Set(
    result.stdout.split('\n').map((e) => e.replace(/^package\//, '').replace(/\/$/, '')),
  );
  for (const entry of filesField) {
    const name = entry.replace(/\/$/, '');
    if (entry.endsWith('/')) {
      if (![...entries].some((e) => e === name || e.startsWith(name + '/'))) {
        throw new Error(`tarball missing files[] directory: ${entry}`);
      }
    } else {
      if (!entries.has(name)) {
        throw new Error(`tarball missing files[] entry: ${entry}`);
      }
    }
  }
}

function readTarballEntry(
  runner: ReleaseCommandRunner,
  root: string,
  tarball: string,
  entry: string,
): string {
  const result = runner('tar', ['-xOf', tarball, `package/${entry}`], {
    cwd: root,
    env: { ...process.env },
  });
  const { stdout } = result;
  if (
    result.status !== 0 ||
    result.error !== undefined ||
    result.signal !== null ||
    stdout.length === 0
  ) {
    throw new Error(
      [
        `tarball entry missing or unreadable: ${entry}`,
        result.error?.message ?? '',
        result.signal === null ? '' : `terminated by signal: ${result.signal}`,
        result.stderr,
      ]
        .filter((part) => part.length > 0)
        .join('\n'),
    );
  }
  return stdout;
}

/** Verify the installable artifact, not merely the source-tree plugin files. */
export function verifyNativePlugin(
  runner: ReleaseCommandRunner,
  root: string,
  tarball: string,
  packageVersion: string,
): void {
  const manifestValue: unknown = JSON.parse(
    readTarballEntry(runner, root, tarball, 'plugins/feynman/.codex-plugin/plugin.json'),
  );
  if (!isRecord(manifestValue))
    throw new Error('packed native Codex plugin manifest must contain an object');
  const manifest = manifestValue;
  const interfaceMeta = manifest['interface'];
  if (
    manifest['name'] !== 'feynman' ||
    manifest['version'] !== packageVersion ||
    manifest['skills'] !== './skills/' ||
    !isRecord(interfaceMeta) ||
    interfaceMeta['brandColor'] !== '#2563EB'
  ) {
    throw new Error('packed native Codex plugin manifest is incomplete or out of sync');
  }

  const skill = readTarballEntry(runner, root, tarball, 'plugins/feynman/skills/feynman/SKILL.md');
  const settings = readTarballEntry(
    runner,
    root,
    tarball,
    'plugins/feynman/skills/feynman/references/settings.md',
  );
  if (
    !skill.includes('](references/settings.md)') ||
    !settings.includes('feynman state [status|on|off')
  ) {
    throw new Error('packed native Codex skill lacks its linked CLI settings reference');
  }
  if (/^(?:npx\s+(?:-y\s+)?@albinocrabs\/feynman|npm exec\b)/im.test(settings)) {
    throw new Error('packed native Codex skill settings contain an automatic remote runner');
  }
  if (/disable-model-invocation/i.test(skill)) {
    throw new Error('packed native Codex skill contains non-discoverable metadata');
  }
}
