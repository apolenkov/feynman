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
  it('ships Codex plugin files in npm package file list', () => {
    const pkg = readJson('package.json');
    assert.ok(pkg.files.includes('.codex-plugin/'));
    assert.ok(pkg.files.includes('hooks.json'));
  });

  it('Codex plugin manifest is valid and points at hooks + skills', () => {
    const manifest = readJson('.codex-plugin/plugin.json');
    assert.equal(manifest.name, 'feynman');
    assert.equal(manifest.hooks, './hooks.json');
    assert.equal(manifest.skills, './skills/');
    assert.ok(manifest.interface.defaultPrompt.length <= 3);
  });

  it('Codex hooks.json registers UserPromptSubmit feynman hook', () => {
    const hooks = readJson('hooks.json');
    const entries = hooks.hooks.UserPromptSubmit;
    assert.ok(Array.isArray(entries));
    const command = entries[0].hooks[0].command;
    assert.ok(command.includes('FEYNMAN_HOME="$HOME/.codex"'));
    assert.ok(command.includes('feynman-activate.js'));
  });

  it('Claude plugin hooks.json registers UserPromptSubmit feynman hook', () => {
    const hooks = readJson('hooks/hooks.json');
    const entries = hooks.hooks.UserPromptSubmit;
    assert.ok(Array.isArray(entries));
    const command = entries[0].hooks[0].command;
    assert.ok(command.includes('FEYNMAN_HOME="$HOME/.claude"'));
    assert.ok(command.includes('${CLAUDE_PLUGIN_ROOT}/hooks/feynman-activate.js'));
  });
});
