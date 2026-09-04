import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  assertRecord,
  assertString,
  assertUnknownArray,
  parseJsonObject,
} from './helpers/assertions.ts';

const ROOT = path.resolve(import.meta.dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const ACTIVE_SURFACES = [
  '.agents',
  '.github',
  'AGENTS.md',
  'CONTEXT.md',
  'CONTRIBUTING.md',
  'PRIVACY.md',
  'README.md',
  'SECURITY.md',
  'bin',
  'docs',
  'evals',
  'hooks',
  'install.sh',
  'lib',
  'openspec',
  'package.json',
  'plugins',
  'rules',
  'scripts',
  'uninstall.sh',
];

function activeTextFiles(rel: string): string[] {
  const absolute = path.join(ROOT, rel);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (!stat.isDirectory()) return [rel];
  if (rel === 'docs/adr' || rel === 'openspec/changes') return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => activeTextFiles(path.join(rel, entry.name)));
}

describe('Codex-only package contract', () => {
  it('does not publish legacy adapter metadata', () => {
    const pkg = parseJsonObject(read('package.json'));
    const description = pkg['description'];
    const keywords = pkg['keywords'];
    const files = pkg['files'];
    assertString(description);
    assertUnknownArray(keywords);
    assert.ok(keywords.every((value) => typeof value === 'string'));
    assertUnknownArray(files);
    assert.ok(files.every((value) => typeof value === 'string'));
    const metadata = `${description}\n${keywords.join('\n')}\n${files.join('\n')}`.toLowerCase();
    assert.doesNotMatch(metadata, /claude|opencode/);
    assert.ok(files.includes('.agents/'));
    assert.ok(files.includes('plugins/'));
  });

  it('keeps release verification on the Codex runtime only', () => {
    for (const file of ['scripts/release-smoke.ts', 'scripts/verify-published-package.ts']) {
      const source = read(file).toLowerCase();
      assert.doesNotMatch(source, /claude|opencode|--target ['"]both/);
      assert.doesNotMatch(source, /--target/);
      assert.match(source, /\['install', '--force'\]/);
    }
  });

  it('publishes the built tarball through an explicit local path', () => {
    const pkg = parseJsonObject(read('package.json'));
    const scripts = pkg['scripts'];
    assertRecord(scripts);
    const release = scripts['release'];
    assertString(release);
    const localTarball = 'npm publish "./$(cat dist/TARBALL.txt)"';
    assert.ok(release.includes(localTarball));

    const releaseWorkflow = read('.github/workflows/release.yml');
    const publishLines = releaseWorkflow
      .split('\n')
      .filter((line) => line.trimStart().startsWith('run: npm publish'));
    assert.equal(publishLines.length, 2);
    for (const line of publishLines) assert.ok(line.includes(localTarball));
  });

  it('uses npm Trusted Publishing instead of a long-lived publish token', () => {
    const releaseWorkflow = read('.github/workflows/release.yml');
    assert.match(releaseWorkflow, /id-token:\s*write/);
    assert.match(releaseWorkflow, /name: Publish to npm via OIDC/);
    assert.match(releaseWorkflow, /npm install --global npm@\d+\.\d+\.\d+/);
    assert.doesNotMatch(releaseWorkflow, /npm@latest/);
    assert.doesNotMatch(releaseWorkflow, /NPM_TOKEN|NODE_AUTH_TOKEN|npm_token/);
  });

  it('publishes the native Codex marketplace entry', () => {
    const marketplace = parseJsonObject(read('.agents/plugins/marketplace.json'));
    const plugins = marketplace['plugins'];
    assertUnknownArray(plugins);
    assert.deepEqual(
      plugins.map((plugin) => {
        assertRecord(plugin);
        const source = plugin['source'];
        assertRecord(source);
        const pluginPath = source['path'];
        assertString(pluginPath);
        return pluginPath;
      }),
      ['./plugins/feynman'],
    );
    const manifest = parseJsonObject(read('plugins/feynman/.codex-plugin/plugin.json'));
    assert.equal(manifest['skills'], './skills/');
    assert.equal(manifest['hooks'], undefined);
  });

  it('keeps active product surfaces free of retired integrations', () => {
    const files = ACTIVE_SURFACES.flatMap(activeTextFiles);
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(
        source,
        /\b(?:claude|opencode)\b/i,
        `${file} reintroduced a retired integration`,
      );
    }
    for (const retiredPath of [
      '.claude',
      '.claude-plugin',
      'CLAUDE.md',
      'hooks/hooks.json',
      'hooks/feynman-lint.ts',
      'skills',
    ]) {
      assert.equal(
        fs.existsSync(path.join(ROOT, retiredPath)),
        false,
        `${retiredPath} must stay removed`,
      );
    }
  });
});
