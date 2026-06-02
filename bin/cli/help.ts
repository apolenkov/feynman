// bin/cli/help.ts — all *_HELP strings and cmdHelp

import { createRequire } from 'node:module';
import { c } from './ansi.ts';

const require = createRequire(import.meta.url);
const PKG = require('../../package.json') as { version: string; name: string };
const VERSION = PKG.version;

export const HELP = `${c.bold('feynman')} v${VERSION} — auto-inject ASCII diagram rules into Claude Code and Codex

${c.bold('Usage:')}
  feynman <command> [options]

${c.bold('Commands:')}
  install      Register feynman hook
  uninstall    Remove feynman hook (state preserved)
  doctor       Check installation health
  lint <file>  Lint a markdown file for diagram rule violations
  examples     List and display example prompts from the repository
  bootstrap    Export shared Feynman assets to a local folder
  version      Print version number
  help         Show this help

${c.bold('Options:')}
  --help, -h   Show help for a command
  --target     claude | codex | opencode | both | all | *
  --force      (install) Re-register even if already installed

${c.bold('Examples:')}
  npx @albinocrabs/feynman install
  npx @albinocrabs/feynman install --target codex
  npx @albinocrabs/feynman install --target all
  npx @albinocrabs/feynman install --target all
  npx @albinocrabs/feynman doctor
  feynman lint response.md
  feynman bootstrap --out ./feynman-package
  feynman examples
  feynman uninstall
`;

export const EXAMPLES_HELP = `${c.bold('feynman examples')} — print built-in demonstration prompts

${c.bold('Usage:')}
  feynman examples                     # list available examples
  feynman examples --name <fileBase>   # print a specific example
  feynman examples --random            # print a random example

${c.bold('Options:')}
  --name    Example filename without .md extension (examples/feature-planning)
  --random  Show one random example in full
  --help    Show this help

Example filenames:
  - architecture-review
  - api-flow
  - c4-platform-diagramming
  - db-schema
  - algorithm-explain
  - deploy-pipeline
  - code-review
  - incident-response
  - feature-planning
`;

export const BOOTSTRAP_HELP = `${c.bold('feynman bootstrap')} — export Feynman assets into local folder

${c.bold('Usage:')}
  feynman bootstrap
  feynman bootstrap --out <directory>

${c.bold('Options:')}
  --out    Output folder (default: ./feynman-package)
  --force  Recreate output folder if it exists
  --help   Show this help
`;

export const INSTALL_HELP = `${c.bold('feynman install')} — register feynman hook

${c.bold('Usage:')}
  feynman install [--target claude|codex|opencode|both|all|*] [--force]

${c.bold('Options:')}
  --target  Install into Claude Code, Codex, both, all, or * (default: codex)
  --force   Re-register hook even if already installed

Claude creates:
  ~/.claude/.feynman/state.json   — feynman state (enabled, intensity, injections)
  ~/.claude/.feynman-active        — presence flag

Codex creates:
  ~/.codex/hooks.json              — SessionStart hook registration (startup|resume|compact|clear)
  ~/.codex/.feynman/state.json     — feynman state (enabled, intensity, injections)
  ~/.codex/.feynman-active         — presence flag

Idempotent by default: skips if feynman hook entries already exist.
`;

export const UNINSTALL_HELP = `${c.bold('feynman uninstall')} — remove feynman hook

${c.bold('Usage:')}
  feynman uninstall [--target claude|codex|opencode|both|all|*]

Removes feynman hook entries from target config.
Preserves .feynman/state.json (user data).
Removes .feynman-active flag.

Idempotent: safe to run multiple times.
`;

export const DOCTOR_HELP = `${c.bold('feynman doctor')} — check feynman installation health

${c.bold('Usage:')}
  feynman doctor [--target claude|codex|opencode|both|all|*]

Checks:
  1. target hook config present
  2. SessionStart hook references feynman-session-start script
  3. Hook script files exist and are readable
  4. Rules file exists and is non-empty
  5. state.json valid JSON with enabled field
  6. .feynman-active flag matches enabled state
  7. (INFO) lint hook registered (optional)

Exit code: always 0 (advisory only).
`;

export const LINT_HELP = `${c.bold('feynman lint')} — lint a markdown file for ASCII diagram rule violations

${c.bold('Usage:')}
  feynman lint <file.md>
  feynman lint -          (read from stdin)
  feynman lint --json <file>
  feynman lint --strict <file>

${c.bold('Options:')}
  --json    Output issues as JSON
  --strict  Treat warnings as errors (exit 1 on any issue)

Delegates to bin/feynman-lint.ts. See feynman-lint --help for full docs.

Exit codes:
  0   No errors
  1   Lint failure
  2   Usage error
`;

export const VERSION_HELP = `${c.bold('feynman version')} — print version

${c.bold('Usage:')}
  feynman version

Prints: ${VERSION}
`;

export function cmdHelp(): void {
  console.log(HELP);
  process.exit(0);
}
