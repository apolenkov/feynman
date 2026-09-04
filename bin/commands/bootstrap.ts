import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { BOOTSTRAP_HELP } from '../cli/help.ts';
import { ensureDir, copyDirectory, copyFileIfExists, copyMarkdownDir } from '../adapters/fs.ts';

const require = createRequire(import.meta.url);
const PKG = require('../../package.json') as { version: string; name: string };
const VERSION = PKG.version;

const ROOT_DIR = path.resolve(import.meta.dirname, '..', '..');

const RULES_PATH = path.resolve(import.meta.dirname, '..', '..', 'rules', 'feynman-contract.md');

const EXAMPLES_DIR = path.resolve(import.meta.dirname, '..', '..', 'examples');
const CODEX_MARKETPLACE = path.resolve(ROOT_DIR, '.agents', 'plugins', 'marketplace.json');
const CODEX_PLUGIN_DIR = path.resolve(ROOT_DIR, 'plugins', 'feynman');
const DEFAULT_BOOTSTRAP_DIR = 'feynman-package';
const PACKAGE_JSON = path.resolve(ROOT_DIR, 'package.json');

export function cmdBootstrap(args: string[]): void {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(BOOTSTRAP_HELP);
    process.exit(0);
  }

  let out = path.resolve(process.cwd(), DEFAULT_BOOTSTRAP_DIR);
  let force = false;
  const unknown: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? '';

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--out') {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) {
        console.error('feynman bootstrap: --out requires a value');
        process.exit(2);
      }
      out = path.resolve(process.cwd(), value);
      i += 1;
      continue;
    }

    if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length);
      if (!value) {
        console.error('feynman bootstrap: invalid --out argument');
        process.exit(2);
      }
      out = path.resolve(process.cwd(), value);
      continue;
    }

    if (arg.startsWith('-')) {
      unknown.push(arg);
      continue;
    }

    unknown.push(arg);
  }

  if (unknown.length > 0) {
    console.error(`feynman bootstrap: unexpected arguments "${unknown.join(' ')}"`);
    console.error('Run `feynman bootstrap --help` for usage.');
    process.exit(2);
  }

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
    let owned = false;
    try {
      const marker: unknown = JSON.parse(
        fs.readFileSync(path.join(out, 'feynman-bootstrap.json'), 'utf8'),
      );
      owned =
        typeof marker === 'object' &&
        marker !== null &&
        'outputDir' in marker &&
        typeof marker.outputDir === 'string' &&
        path.resolve(marker.outputDir) === out;
    } catch {
      /* Missing or invalid ownership metadata is not permission to delete. */
    }
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

  const total = Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 1);
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
