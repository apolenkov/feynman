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

  it('Feynman skill resolves Claude and Codex runtime homes', () => {
    const skill = fs.readFileSync(path.join(REPO_DIR, 'skills/feynman/SKILL.md'), 'utf8');
    assert.ok(skill.includes('FEYNMAN_TARGET'));
    assert.ok(skill.includes('CODEX_THREAD_ID'));
    assert.ok(skill.includes("path.join(os.homedir(), '.codex')"));
    assert.ok(skill.includes("path.join(os.homedir(), '.claude')"));
  });

  it('Feynman skill documents style subcommand (Phase 10 STYLE-02)', () => {
    const skill = fs.readFileSync(path.join(REPO_DIR, 'skills/feynman/SKILL.md'), 'utf8');
    // The skill must mention the new `style <preset>` argument.
    assert.ok(/style\s+short\|middle\|full|style\s+\<preset\>|`style`/.test(skill),
      'SKILL.md must document the style subcommand for STYLE-02');
    // All three presets must be referenced.
    assert.ok(skill.includes('short'), 'short preset documented');
    assert.ok(skill.includes('middle'), 'middle preset documented');
    // Status output must surface output_style alongside intensity.
    assert.ok(skill.includes('output_style'),
      'status output must include output_style field');
  });
});
