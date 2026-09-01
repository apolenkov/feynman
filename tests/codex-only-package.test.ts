import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const ACTIVE_SURFACES = [
  '.agents', '.github', 'AGENTS.md', 'CONTEXT.md', 'CONTRIBUTING.md',
  'PRIVACY.md', 'README.md', 'SECURITY.md', 'bin', 'docs', 'evals', 'hooks',
  'install.sh', 'lib', 'openspec', 'package.json', 'plugins', 'rules', 'scripts',
  'uninstall.sh',
];

function activeTextFiles(rel: string): string[] {
  const absolute = path.join(ROOT, rel);
  if (!fs.existsSync(absolute)) return [];
  const stat = fs.statSync(absolute);
  if (!stat.isDirectory()) return [rel];
  if (rel === 'docs/adr' || rel === 'openspec/changes') return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) =>
    activeTextFiles(path.join(rel, entry.name)),
  );
}

describe('Codex-only package contract', () => {
  it('does not publish legacy adapter metadata', () => {
    const pkg = JSON.parse(read('package.json')) as { description: string; keywords: string[]; files: string[] };
    const metadata = `${pkg.description}\n${pkg.keywords.join('\n')}\n${pkg.files.join('\n')}`.toLowerCase();
    assert.doesNotMatch(metadata, /claude|opencode/);
    assert.ok(pkg.files.includes('.agents/'));
    assert.ok(pkg.files.includes('plugins/'));
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
    const pkg = JSON.parse(read('package.json')) as { scripts: { release: string } };
    const localTarball = 'npm publish "./$(cat dist/TARBALL.txt)"';
    assert.ok(pkg.scripts.release.includes(localTarball));

    const releaseWorkflow = read('.github/workflows/release.yml');
    const publishLines = releaseWorkflow.split('\n').filter(line => line.trimStart().startsWith('run: npm publish'));
    assert.equal(publishLines.length, 2);
    for (const line of publishLines) assert.ok(line.includes(localTarball));
  });

  it('publishes the native Codex marketplace entry', () => {
    const marketplace = JSON.parse(read('.agents/plugins/marketplace.json')) as {
      plugins: Array<{ source: { path: string } }>;
    };
    assert.deepEqual(marketplace.plugins.map((plugin) => plugin.source.path), ['./plugins/feynman']);
    const manifest = JSON.parse(read('plugins/feynman/.codex-plugin/plugin.json')) as Record<string, unknown>;
    assert.equal(manifest['skills'], './skills/');
    assert.equal(manifest['hooks'], undefined);
  });

  it('keeps active product surfaces free of retired integrations', () => {
    const files = ACTIVE_SURFACES.flatMap(activeTextFiles);
    for (const file of files) {
      const source = read(file);
      assert.doesNotMatch(source, /\b(?:claude|opencode)\b/i, `${file} reintroduced a retired integration`);
    }
    for (const retiredPath of ['.claude', '.claude-plugin', 'CLAUDE.md', 'hooks/hooks.json', 'hooks/feynman-lint.ts', 'skills']) {
      assert.equal(fs.existsSync(path.join(ROOT, retiredPath)), false, `${retiredPath} must stay removed`);
    }
  });
});
