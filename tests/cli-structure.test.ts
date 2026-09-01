// tests/cli-structure.test.ts — structural guard for bin/feynman.ts.
// Asserts that the entrypoint stays a slim dispatcher:
//   • line count at or below 120
//   • no inline `function cmd…` declaration (command bodies must be imported)
// Uses node:test + node:assert/strict.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO_DIR = path.resolve(import.meta.dirname, '..');
const ENTRYPOINT = path.join(REPO_DIR, 'bin', 'feynman.ts');
const COMMANDS_DIR = path.join(REPO_DIR, 'bin', 'commands');
const ADAPTERS_DIR = path.join(REPO_DIR, 'bin', 'adapters');
const STATE_CORE_DIR = path.join(REPO_DIR, 'lib', 'state');
const LINE_CAP = 120;

const content = fs.readFileSync(ENTRYPOINT, 'utf8');
const lines = content.split('\n');

describe('cli-structure guard: bin/feynman.ts', () => {
  it(`is at or below ${LINE_CAP} lines`, () => {
    assert.ok(
      lines.length <= LINE_CAP,
      `bin/feynman.ts has ${lines.length} lines — exceeds the ${LINE_CAP}-line cap. Move command bodies to bin/commands/*.`
    );
  });

  it('contains no inline `function cmd` declaration', () => {
    const hasInline = content.includes('function cmd');
    assert.ok(
      !hasInline,
      'bin/feynman.ts contains an inline `function cmd…` declaration. Command bodies must be imported from bin/commands/*, not defined in the entrypoint.'
    );
  });

  it('keeps command modules independent of one another', () => {
    const commandFiles = fs.readdirSync(COMMANDS_DIR).filter((name) => name.endsWith('.ts'));
    for (const file of commandFiles) {
      const source = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf8');
      assert.doesNotMatch(
        source,
        /from\s+['"]\.\/[^'"]+['"]/,
        `${file} imports a sibling command. Extract shared code to bin/cli or an adapter instead.`,
      );
    }
  });

  it('keeps adapters outside command orchestration', () => {
    for (const file of fs.readdirSync(ADAPTERS_DIR).filter((name) => name.endsWith('.ts'))) {
      const source = fs.readFileSync(path.join(ADAPTERS_DIR, file), 'utf8');
      assert.doesNotMatch(
        source,
        /from\s+['"]\.\.\/commands\//,
        `${file} imports a command. Adapters must not depend on application orchestration.`,
      );
    }
  });

  it('keeps the state core free of filesystem dependencies', () => {
    for (const file of fs.readdirSync(STATE_CORE_DIR).filter((name) => name.endsWith('.ts'))) {
      const source = fs.readFileSync(path.join(STATE_CORE_DIR, file), 'utf8');
      assert.doesNotMatch(
        source,
        /from\s+['"]node:\s*(?:fs|path|os)['"]/,
        `${file} is state core and must not access Codex or the filesystem directly.`,
      );
    }
  });
});
