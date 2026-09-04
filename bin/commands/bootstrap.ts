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

  if (fs.existsSync(out) && !force) {
    console.log(`feynman bootstrap: output already exists at ${out}`);
    console.log('Use `--force` to recreate it.');
    process.exit(0);
  }

  if (fs.existsSync(out)) {
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
    const owned = ownsBootstrapDirectory(out);
    if (fs.lstatSync(out).isSymbolicLink() || containsProtectedPath || !owned) {
      console.error(
        'feynman bootstrap: refusing to replace an unowned, symlinked, or protected directory',
      );
      process.exit(2);
    }
    fs.rmSync(out, { recursive: true, force: true });
  }

  const codexMarketplace = copyFileIfExists(
    CODEX_MARKETPLACE,
    path.join(out, '.agents', 'plugins', 'marketplace.json'),
  )
    ? 1
    : 0;
  const codexPlugin = copyDirectory(CODEX_PLUGIN_DIR, path.join(out, 'plugins', 'feynman'));

  const counts = {
    examples: copyMarkdownDir(EXAMPLES_DIR, path.join(out, 'examples')),
    rules: copyFileIfExists(RULES_PATH, path.join(out, 'rules', 'feynman-contract.md')) ? 1 : 0,
    hookRuntime: copyDirectory(path.join(ROOT_DIR, 'hooks'), path.join(out, 'hooks')),
    cliRuntime: copyDirectory(path.join(ROOT_DIR, 'bin'), path.join(out, 'bin')),
    coreRuntime: copyDirectory(path.join(ROOT_DIR, 'lib'), path.join(out, 'lib')),
    packageManifest: copyFileIfExists(PACKAGE_JSON, path.join(out, 'package.json')) ? 1 : 0,
    plugins: codexMarketplace + codexPlugin,
  };

  ensureDir(out);
  fs.writeFileSync(
    path.join(out, 'feynman-bootstrap.json'),
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
  process.exit(0);
}

function ownsBootstrapDirectory(out: string): boolean {
  try {
    const marker: unknown = JSON.parse(
      fs.readFileSync(path.join(out, 'feynman-bootstrap.json'), 'utf8'),
    );
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
