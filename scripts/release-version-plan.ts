export const VERSION_MANIFESTS = [
  'package.json',
  'plugins/feynman/.codex-plugin/plugin.json',
] as const;

export const RELEASE_FILES = [...VERSION_MANIFESTS, 'package-lock.json', 'CHANGELOG.md'] as const;

type ReleaseFile = (typeof RELEASE_FILES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseRecord(text: string, label: string): Record<string, unknown> {
  const value: unknown = JSON.parse(text);
  if (!isRecord(value)) throw new Error(`Invalid ${label}`);
  return value;
}

export function readManifestVersion(text: string, relativePath: string): string {
  const manifest = parseRecord(text, `version manifest: ${relativePath}`);
  if (typeof manifest['version'] !== 'string') {
    throw new Error(`Invalid version manifest: ${relativePath}`);
  }
  return manifest['version'];
}

export function bumpSemver(current: string, kind: 'patch' | 'minor' | 'major'): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`unparseable version: ${current}`);
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}

export function resolveTarget(versionRequest: string, current: string): string {
  if (/^\d+\.\d+\.\d+$/.test(versionRequest)) return versionRequest;
  if (versionRequest === 'patch' || versionRequest === 'minor' || versionRequest === 'major') {
    return bumpSemver(current, versionRequest);
  }
  throw new Error(`bad version arg: ${versionRequest}`);
}

export function updateManifestVersion(text: string, target: string, relativePath: string): string {
  const updated = text.replace(/"version"\s*:\s*"[^"]+"/, `"version": "${target}"`);
  if (text === updated) throw new Error(`no version field replaced in ${relativePath}`);
  return updated;
}

export function updatePackageLock(text: string, target: string): string {
  const lock = parseRecord(text, 'package-lock.json');
  const packages = lock['packages'];
  if (typeof lock['version'] !== 'string' || !isRecord(packages)) {
    throw new Error('package-lock.json does not have a root package version');
  }
  const rootPackage = packages[''];
  if (!isRecord(rootPackage) || typeof rootPackage['version'] !== 'string') {
    throw new Error('package-lock.json does not have a root package version');
  }
  return (
    JSON.stringify(
      {
        ...lock,
        version: target,
        packages: { ...packages, '': { ...rootPackage, version: target } },
      },
      null,
      2,
    ) + '\n'
  );
}

export interface ReleaseSnapshot {
  readonly relativePath: ReleaseFile;
  readonly contents: string;
}

export interface PlannedWrite {
  readonly relativePath: ReleaseFile;
  readonly contents: string;
}

export function snapshotContents(
  snapshots: readonly ReleaseSnapshot[],
  relativePath: ReleaseFile,
): string {
  const snapshot = snapshots.find((candidate) => candidate.relativePath === relativePath);
  if (snapshot === undefined) throw new Error(`missing release snapshot: ${relativePath}`);
  return snapshot.contents;
}

export function planReleaseWrites(
  snapshots: readonly ReleaseSnapshot[],
  target: string,
): readonly PlannedWrite[] {
  return [
    ...VERSION_MANIFESTS.map((relativePath) => ({
      relativePath,
      contents: updateManifestVersion(
        snapshotContents(snapshots, relativePath),
        target,
        relativePath,
      ),
    })),
    {
      relativePath: 'package-lock.json',
      contents: updatePackageLock(snapshotContents(snapshots, 'package-lock.json'), target),
    },
  ];
}
