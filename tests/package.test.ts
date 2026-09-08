// Package metadata and native Codex marketplace contract.
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

function readJson(rel: string): Record<string, unknown> {
  return parseJsonObject(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

describe('package metadata', () => {
  it('uses the public npm scope and TypeScript CLI entrypoints', () => {
    const pkg = readJson('package.json');
    assert.equal(pkg['name'], '@albinocrabs/feynman');
    assert.deepEqual(pkg['bin'], {
      feynman: 'bin/feynman.ts',
      'feynman-lint': 'bin/feynman-lint.ts',
    });
  });

  it('publishes only Codex marketplace assets and public documentation', () => {
    const files = readJson('package.json')['files'];
    assertUnknownArray(files);
    assert.ok(files.every((entry) => typeof entry === 'string'));
    for (const entry of [
      '.agents/',
      'plugins/',
      'hooks/',
      'rules/',
      'docs/',
      'examples/',
      'README.md',
    ]) {
      assert.ok(files.includes(entry), `${entry} should be included in package files`);
    }
    assert.equal(
      files.some((entry) => /claude|opencode/i.test(entry)),
      false,
    );
    assert.equal(
      files.includes('skills/'),
      false,
      'retired root skills directory must not be packaged',
    );
  });

  it('keeps coverage focused on application files', () => {
    const scripts = readJson('package.json')['scripts'];
    assertRecord(scripts);
    const coverage = scripts['coverage'];
    assertString(coverage);
    assert.match(coverage, /--test-coverage-exclude=tests\/\*\*/);
  });

  it('ships a native Codex marketplace plugin without hook declarations', () => {
    const pkg = readJson('package.json');
    const marketplace = readJson('.agents/plugins/marketplace.json');
    assert.equal(marketplace['name'], 'feynman');
    assert.deepEqual(marketplace['plugins'], [
      {
        name: 'feynman',
        source: { source: 'local', path: './plugins/feynman' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
      },
    ]);

    const manifest = readJson('plugins/feynman/.codex-plugin/plugin.json');
    assert.equal(manifest['name'], 'feynman');
    assert.equal(manifest['version'], pkg['version']);
    assert.equal(manifest['hooks'], undefined);
    assert.equal(manifest['mcpServers'], undefined);
    assert.equal(manifest['apps'], undefined);
    assert.equal(manifest['skills'], './skills/');
    assert.match(String(manifest['description']), /visual architecture/i);
    assert.deepEqual(manifest['keywords'], [
      'codex',
      'ascii-diagrams',
      'visual-architecture',
      'flows',
      'comparisons',
      'status',
      'productivity',
    ]);

    const interfaceMeta = manifest['interface'];
    assertRecord(interfaceMeta);
    assert.equal(interfaceMeta['brandColor'], '#2563EB');
    assert.deepEqual(interfaceMeta['capabilities'], ['Interactive']);
    const prompts = interfaceMeta['defaultPrompt'];
    assertUnknownArray(prompts);
    assert.ok(prompts.every((prompt) => typeof prompt === 'string'));
    assert.ok(prompts.length > 0 && prompts.length <= 3);
    assert.ok(prompts.every((prompt) => prompt.length <= 128));

    const skill = fs.readFileSync(
      path.join(ROOT, 'plugins/feynman/skills/feynman/SKILL.md'),
      'utf8',
    );
    assert.match(skill, /visual architecture/i);
    assert.match(skill, /\]\(references\/settings\.md\)/);
    const settings = fs.readFileSync(
      path.join(ROOT, 'plugins/feynman/skills/feynman/references/settings.md'),
      'utf8',
    );
    assert.match(settings, /feynman state \[status\|on\|off/);
    assert.match(settings, /absolute executable path only.*user provided/s);
    assert.doesNotMatch(settings, /^(?:npx\s+(?:-y\s+)?@albinocrabs\/feynman|npm exec\b)/im);
    assert.doesNotMatch(skill, /disable-model-invocation/);
    assert.match(settings, /never write `~\/\.codex\/\.feynman\/state\.json`/i);
  });
});
