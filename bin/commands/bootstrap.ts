import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BOOTSTRAP_HELP } from '../cli/help.ts';
import { ensureDir, copyDirectory, copyFileIfExists, copyMarkdownDir } from '../adapters/fs.ts';
import { readPackageMetadata } from '../adapters/package-metadata.ts';

const PKG = readPackageMetadata(path.resolve(import.meta.dirname, '..', '..', 'package.json'));
const VERSION = PKG.version;

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..');

const RULES_PATH = path.resolve(import.meta.dirname, '..', '..', 'rules', 'feynman-contract.md');

const EXAMPLES_DIR = path.resolve(import.meta.dirname, '..', '..', 'examples');
const CODEX_MARKETPLACE = path.resolve(ROOT_DIR, '.agents', 'plugins', 'marketplace.json');
const CODEX_PLUGIN_DIR = path.resolve(ROOT_DIR, 'plugins', 'feynman');
const DEFAULT_BOOTSTRAP_DIR = 'feynman-package';
const OWNERSHIP_MARKER = 'feynman-bootstrap.json';
const PACKAGE_JSON = path.resolve(ROOT_DIR, 'package.json');

export type BootstrapArguments =
  | { readonly kind: 'help' }
  | { readonly kind: 'error'; readonly messages: readonly string[] }
  | { readonly kind: 'run'; readonly out: string; readonly force: boolean };

function isOutValue(args: readonly string[], index: number): boolean {
  const value = args[index + 1];
  return value !== undefined && value !== '' && !value.startsWith('-');
}

export function parseBootstrapArguments(args: readonly string[], cwd: string): BootstrapArguments {
  if (args.includes('--help') || args.includes('-h')) return { kind: 'help' };

  const malformedIndex = args.findIndex(
    (arg, index) =>
      (arg === '--out' && !isOutValue(args, index)) ||
      (arg.startsWith('--out=') && arg.length === '--out='.length),
  );
  if (malformedIndex !== -1) {
    return {
      kind: 'error',
      messages: [
        args[malformedIndex] === '--out'
          ? 'feynman bootstrap: --out requires a value'
          : 'feynman bootstrap: invalid --out argument',
      ],
    };
  }

  const outputValues = args.flatMap((arg, index) => {
    if (arg === '--out') return isOutValue(args, index) ? [args[index + 1]] : [];
    return arg.startsWith('--out=') ? [arg.slice('--out='.length)] : [];
  });
  const unknown = args.filter((arg, index) => {
    const consumedAsOutValue = index > 0 && args[index - 1] === '--out';
    return arg !== '--force' && arg !== '--out' && !arg.startsWith('--out=') && !consumedAsOutValue;
  });
  if (unknown.length > 0) {
    return {
      kind: 'error',
      messages: [
        `feynman bootstrap: unexpected arguments "${unknown.join(' ')}"`,
        'Run `feynman bootstrap --help` for usage.',
      ],
    };
  }
  return {
    kind: 'run',
    out: path.resolve(cwd, outputValues.at(-1) ?? DEFAULT_BOOTSTRAP_DIR),
    force: args.includes('--force'),
  };
}

export function cmdBootstrap(args: readonly string[]): void {
  const parsed = parseBootstrapArguments(args, process.cwd());
  if (parsed.kind === 'help') {
    console.log(BOOTSTRAP_HELP);
    process.exit(0);
  }
  if (parsed.kind === 'error') {
    parsed.messages.forEach((message) => {
      console.error(message);
    });
    process.exit(2);
  }
  const { out, force } = parsed;

  reportDestinationConflict(checkDestination(out, force).kind, out);
  const result = stageBootstrap(out, force);
  if (result.kind !== 'exported') reportDestinationConflict(result.kind, out);
  else printBootstrapResult(out, result.counts);
  process.exit(0);
}

type Destination =
  | { readonly kind: 'new' | 'skip' | 'refuse' }
  | { readonly kind: 'replace'; readonly identity: fs.BigIntStats };

function checkDestination(out: string, force: boolean): Destination {
  const info = fs.lstatSync(out, { bigint: true, throwIfNoEntry: false });
  if (info === undefined) return { kind: 'new' };
  if (!force) return { kind: 'skip' };
  if (!info.isDirectory()) return { kind: 'refuse' };

  const canonical = fs.realpathSync(out);
  const protectedPaths = [process.cwd(), os.homedir(), ROOT_DIR].map((directory) =>
    fs.realpathSync(directory),
  );
  const containsProtectedPath = protectedPaths.some((directory) => {
    const relative = path.relative(canonical, directory);
    return (
      relative === '' ||
      (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
    );
  });
  return containsProtectedPath || !ownsBootstrapDirectory(out, out)
    ? { kind: 'refuse' }
    : { kind: 'replace', identity: info };
}

function reportDestinationConflict(status: Destination['kind'], out: string): void {
  if (status === 'skip') {
    console.log(`feynman bootstrap: output already exists at ${out}`);
    console.log('Use `--force` to recreate it.');
    process.exit(0);
  }
  if (status === 'refuse') {
    console.error(
      'feynman bootstrap: refusing to replace an unowned, symlinked, or protected directory',
    );
    process.exit(2);
  }
}

function stageBootstrap(out: string, force: boolean) {
  const parent = path.dirname(out);
  ensureDir(parent);
  const staging = fs.mkdtempSync(path.join(parent, '.feynman-bootstrap-'));
  const bundle = path.join(staging, 'bundle');
  const previous = path.join(staging, 'previous');
  const result = exportBootstrap(bundle, out, previous, force);
  try {
    fs.rmSync(bundle, { recursive: true, force: true });
    // Leave displaced directories in staging when recovery could not finish.
    if (fs.readdirSync(staging).length === 0) fs.rmdirSync(staging);
  } catch (cleanupError) {
    if (result.kind !== 'error') throw cleanupError;
    throw new AggregateError([result.error, cleanupError], 'Bootstrap cleanup also failed', {
      cause: result.error,
    });
  }
  if (result.kind === 'error') throw result.error;
  return result;
}

function exportBootstrap(bundle: string, out: string, previous: string, force: boolean) {
  try {
    const counts = writeBootstrapBundle(bundle, out);
    const destination = checkDestination(out, force);
    if (destination.kind === 'skip' || destination.kind === 'refuse') {
      return { kind: destination.kind } as const;
    }
    promoteBootstrap(bundle, out, previous, destination);
    return { kind: 'exported', counts } as const;
  } catch (error) {
    return { kind: 'error', error } as const;
  }
}

function sameDirectory(file: string, identity: fs.BigIntStats): boolean {
  const current = fs.lstatSync(file, { bigint: true, throwIfNoEntry: false });
  return (
    current?.isDirectory() === true && current.dev === identity.dev && current.ino === identity.ino
  );
}

// Node's directory rename can replace an empty directory. Claim each name
// exclusively and keep the source tree intact until the whole transfer succeeds.
function linkDirectoryContents(source: string, destination: string, root = false): void {
  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    if (root && entry.name === OWNERSHIP_MARKER) continue;
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { mode: 0o700 });
      linkDirectoryContents(from, to);
    } else {
      fs.linkSync(from, to);
    }
  }
  // Publish the ownership marker only once every runtime file is available.
  if (root) {
    fs.linkSync(path.join(source, OWNERSHIP_MARKER), path.join(destination, OWNERSHIP_MARKER));
  }
  fs.chmodSync(destination, fs.statSync(source).mode & 0o777);
}

function publishDirectory(source: string, out: string, staging: string): void {
  fs.mkdirSync(out, { mode: 0o700 });
  const identity = fs.lstatSync(out, { bigint: true });
  try {
    linkDirectoryContents(source, out, true);
  } catch (error) {
    const partial = path.join(staging, 'partial');
    try {
      if (!sameDirectory(out, identity)) throw new Error(`Bootstrap destination changed at ${out}`);
      fs.renameSync(out, partial);
      if (!sameDirectory(partial, identity)) {
        throw new Error(`Bootstrap destination changed. Displaced entry preserved at ${partial}`);
      }
      fs.rmSync(partial, { recursive: true });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Bootstrap transfer and cleanup failed', {
        cause: error,
      });
    }
    throw error;
  }
}

function promoteBootstrap(
  bundle: string,
  out: string,
  previous: string,
  destination: Destination,
): void {
  const replacing = destination.kind === 'replace';
  const staging = path.dirname(previous);
  if (replacing) {
    fs.renameSync(out, previous);
    if (!sameDirectory(previous, destination.identity) || !ownsBootstrapDirectory(previous, out)) {
      throw new Error(`Bootstrap destination changed. Displaced entry preserved at ${previous}`);
    }
  }
  try {
    publishDirectory(bundle, out, staging);
  } catch (error) {
    if (replacing) {
      try {
        publishDirectory(previous, out, staging);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Bootstrap promotion and restoration failed. Prior export remains at ${previous}`,
          { cause: error },
        );
      }
      fs.rmSync(previous, { recursive: true });
    }
    throw error;
  }
  if (replacing) fs.rmSync(previous, { recursive: true });
}

function requireStagedRuntime(bundle: string): void {
  const extension = path.extname(import.meta.filename);
  for (const entry of [
    'bin/feynman',
    'bin/feynman-lint',
    'hooks/feynman-session-start',
    'lib/lint/index',
    'lib/state/index',
  ]) {
    const file = entry + extension;
    if (fs.lstatSync(path.join(bundle, file), { throwIfNoEntry: false })?.isFile() !== true) {
      throw new Error(`Bootstrap runtime file missing: ${file}`);
    }
  }
}

function writeBootstrapBundle(bundle: string, out: string) {
  const codexMarketplace = copyFileIfExists(
    CODEX_MARKETPLACE,
    path.join(bundle, '.agents', 'plugins', 'marketplace.json'),
  )
    ? 1
    : 0;
  const codexPlugin = copyDirectory(CODEX_PLUGIN_DIR, path.join(bundle, 'plugins', 'feynman'));

  const counts = {
    examples: copyMarkdownDir(EXAMPLES_DIR, path.join(bundle, 'examples')),
    rules: copyRequiredFile(RULES_PATH, path.join(bundle, 'rules', 'feynman-contract.md')),
    hookRuntime: copyDirectory(path.join(ROOT_DIR, 'hooks'), path.join(bundle, 'hooks')),
    cliRuntime: copyDirectory(path.join(ROOT_DIR, 'bin'), path.join(bundle, 'bin')),
    coreRuntime: copyDirectory(path.join(ROOT_DIR, 'lib'), path.join(bundle, 'lib')),
    packageManifest: copyRequiredFile(PACKAGE_JSON, path.join(bundle, 'package.json')),
    plugins: codexMarketplace + codexPlugin,
  };

  requireStagedRuntime(bundle);
  fs.writeFileSync(
    path.join(bundle, OWNERSHIP_MARKER),
    JSON.stringify(
      {
        version: VERSION,
        createdAt: new Date().toISOString(),
        outputDir: out,
        counts,
      },
      null,
      2,
    ) + '\n',
  );
  return counts;
}

function copyRequiredFile(source: string, destination: string): number {
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
  return 1;
}

function printBootstrapResult(out: string, counts: ReturnType<typeof writeBootstrapBundle>): void {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 1);
  console.log('');
  console.log('┌─ feynman bootstrap ────────────────────────────────────────┐');
  console.log(`│ output:   ${out}`);
  console.log(`│ examples: ${counts.examples}`);
  console.log(`│ rules:    ${counts.rules}`);
  console.log(
    `│ runtime:  ${counts.hookRuntime + counts.cliRuntime + counts.coreRuntime + counts.packageManifest}`,
  );
  console.log(`│ plugins:  ${counts.plugins}`);
  console.log(`│ files:    ${total}`);
  console.log('└───────────────────────────────────────────────────────────┘');
}

function ownsBootstrapDirectory(directory: string, out: string): boolean {
  try {
    const markerPath = path.join(directory, OWNERSHIP_MARKER);
    if (!fs.lstatSync(markerPath).isFile()) return false;
    const marker: unknown = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    return (
      typeof marker === 'object' &&
      marker !== null &&
      'outputDir' in marker &&
      typeof marker.outputDir === 'string' &&
      path.resolve(marker.outputDir) === out
    );
  } catch {
    return false;
  }
}
