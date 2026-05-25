// tests/package.test.ts — package metadata and plugin manifests
// Uses node:test + node:assert/strict.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_DIR = path.resolve(import.meta.dirname, '..');

function readJson(relPath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(REPO_DIR, relPath), 'utf8'));
}

describe('package metadata', () => {
  it('uses the albinocrabs npm scope while keeping CLI bin names', () => {
    const pkg = readJson('package.json');
    assert.equal(pkg['name'], '@albinocrabs/feynman');
    assert.equal((pkg['bin'] as Record<string, string>)['feynman'], 'bin/feynman.ts');
    assert.equal((pkg['bin'] as Record<string, string>)['feynman-lint'], 'bin/feynman-lint.ts');
  });

  it('ships Codex plugin files in npm package file list', () => {
    const pkg = readJson('package.json');
    assert.ok((pkg['files'] as string[]).includes('.codex-plugin/'));
    assert.ok((pkg['files'] as string[]).includes('hooks.json'));
  });

  it('ships Claude plugin manifest in npm package file list', () => {
    const pkg = readJson('package.json');
    assert.ok((pkg['files'] as string[]).includes('.claude-plugin/'), '.claude-plugin/ must be in files');
  });

  it('ships public open-source docs in npm package file list', () => {
    const pkg = readJson('package.json');
    for (const file of ['docs/', 'examples/', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md']) {
      assert.ok((pkg['files'] as string[]).includes(file), `${file} should be included in package files`);
    }
  });

  it('Codex plugin manifest is valid and points at hooks + skills', () => {
    const pkg = readJson('package.json');
    const manifest = readJson('.codex-plugin/plugin.json');
    assert.equal(manifest['name'], 'feynman');
    assert.equal(manifest['version'], pkg['version']);
    assert.equal(manifest['hooks'], './hooks.json');
    assert.equal(manifest['skills'], './skills/');
    assert.ok((manifest['interface'] as { defaultPrompt: string[] }).defaultPrompt.length <= 3);
  });

  it('Codex hooks.json registers only SessionStart hook (no UserPromptSubmit)', () => {
    const hooks = readJson('hooks.json');
    const hooksMap = hooks['hooks'] as Record<string, unknown[]>;
    const sessionEntries = hooksMap['SessionStart'];
    assert.ok(Array.isArray(sessionEntries));
    assert.equal(hooksMap['UserPromptSubmit'], undefined, 'UserPromptSubmit must not be registered (v0.7.0+)');
    const sessionEntry = sessionEntries![0] as { matcher?: string; hooks: { command: string }[] };
    assert.ok(sessionEntry.matcher?.includes('compact'), 'matcher must include compact');
    assert.ok(sessionEntry.matcher?.includes('clear'), 'matcher must include clear');
    const sessionCommand = sessionEntry.hooks[0]!.command;
    assert.ok(sessionCommand.includes('FEYNMAN_HOME="$HOME/.codex"'));
    assert.ok(sessionCommand.includes('feynman-session-start.ts'));
  });

  it('Claude plugin hooks.json registers only SessionStart hook (no UserPromptSubmit)', () => {
    const hooks = readJson('hooks/hooks.json');
    const hooksMap = hooks['hooks'] as Record<string, unknown[]>;
    const sessionEntries = hooksMap['SessionStart'];
    assert.ok(Array.isArray(sessionEntries));
    assert.equal(hooksMap['UserPromptSubmit'], undefined, 'UserPromptSubmit must not be registered (v0.7.0+)');
    const sessionEntry = sessionEntries![0] as { matcher?: string; hooks: { command: string }[] };
    assert.ok(sessionEntry.matcher?.includes('compact'), 'matcher must include compact');
    assert.ok(sessionEntry.matcher?.includes('clear'), 'matcher must include clear');
    const sessionCommand = sessionEntry.hooks[0]!.command;
    assert.ok(sessionCommand.includes('FEYNMAN_HOME="$HOME/.claude"'));
    assert.ok(sessionCommand.includes('${CLAUDE_PLUGIN_ROOT}/hooks/feynman-session-start.ts'));
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
