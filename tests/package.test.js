// tests/package.test.js — package metadata and plugin manifests
// Uses node:test + node:assert/strict.
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_DIR = path.resolve(__dirname, '..');

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(REPO_DIR, relPath), 'utf8'));
}

describe('package metadata', () => {
  it('uses the albinocrabs npm scope while keeping CLI bin names', () => {
    const pkg = readJson('package.json');
    assert.equal(pkg.name, '@albinocrabs/feynman');
    assert.equal(pkg.bin.feynman, 'bin/feynman.js');
    assert.equal(pkg.bin['feynman-lint'], 'bin/feynman-lint.js');
  });

  it('ships Codex plugin files in npm package file list', () => {
    const pkg = readJson('package.json');
    assert.ok(pkg.files.includes('.codex-plugin/'));
    assert.ok(pkg.files.includes('hooks.json'));
  });

  it('ships public open-source docs in npm package file list', () => {
    const pkg = readJson('package.json');
    for (const file of ['docs/', 'examples/', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md']) {
      assert.ok(pkg.files.includes(file), `${file} should be included in package files`);
    }
  });

  it('Codex plugin manifest is valid and points at hooks + skills', () => {
    const pkg = readJson('package.json');
    const manifest = readJson('.codex-plugin/plugin.json');
    assert.equal(manifest.name, 'feynman');
    assert.equal(manifest.version, pkg.version);
    assert.equal(manifest.hooks, './hooks.json');
    assert.equal(manifest.skills, './skills/');
    assert.ok(manifest.interface.defaultPrompt.length <= 3);
  });

  it('Codex hooks.json registers SessionStart and UserPromptSubmit feynman hooks', () => {
    const hooks = readJson('hooks.json');
    const sessionEntries = hooks.hooks.SessionStart;
    const promptEntries = hooks.hooks.UserPromptSubmit;
    assert.ok(Array.isArray(sessionEntries));
    assert.ok(Array.isArray(promptEntries));
    const sessionCommand = sessionEntries[0].hooks[0].command;
    const promptCommand = promptEntries[0].hooks[0].command;
    assert.ok(sessionCommand.includes('FEYNMAN_HOME="$HOME/.codex"'));
    assert.ok(sessionCommand.includes('feynman-session-start.js'));
    assert.ok(promptCommand.includes('FEYNMAN_HOME="$HOME/.codex"'));
    assert.ok(promptCommand.includes('feynman-activate.js'));
  });

  it('Claude plugin hooks.json registers SessionStart and UserPromptSubmit feynman hooks', () => {
    const hooks = readJson('hooks/hooks.json');
    const sessionEntries = hooks.hooks.SessionStart;
    const promptEntries = hooks.hooks.UserPromptSubmit;
    assert.ok(Array.isArray(sessionEntries));
    assert.ok(Array.isArray(promptEntries));
    const sessionCommand = sessionEntries[0].hooks[0].command;
    const promptCommand = promptEntries[0].hooks[0].command;
    assert.ok(sessionCommand.includes('FEYNMAN_HOME="$HOME/.claude"'));
    assert.ok(sessionCommand.includes('${CLAUDE_PLUGIN_ROOT}/hooks/feynman-session-start.js'));
    assert.ok(promptCommand.includes('FEYNMAN_HOME="$HOME/.claude"'));
    assert.ok(promptCommand.includes('${CLAUDE_PLUGIN_ROOT}/hooks/feynman-activate.js'));
  });
});
