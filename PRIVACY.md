# Privacy Policy

**TL;DR:** feynman does not collect, store, or transmit any user data. It runs entirely on your local machine and makes no network requests.

## What feynman does

feynman is a hook-based Claude Code / Codex plugin. When you submit a prompt, the hook reads a rules file from your local install and prepends those rules to the prompt via `additionalContext`. No part of the prompt or response is sent anywhere by feynman.

## What feynman writes to disk

| path                              | contents                                              |
|-----------------------------------|-------------------------------------------------------|
| `~/.claude/.feynman/state.json`   | `{enabled, intensity, output_style, injections}`     |
| `~/.claude/.feynman-active`       | presence flag + active intensity name                |
| `~/.codex/.feynman/state.json`    | same schema, Codex variant                           |
| `~/.codex/.feynman-active`        | same flag, Codex variant                             |

The `injections` field is a local counter (incremented on each hook fire). It never leaves your machine.

## What feynman reads from disk

- Its own rules file (`rules/feynman-activate.md` inside the npm-installed package)
- Its own state file (above)
- Anything you explicitly pass to `feynman lint <file>` (read-only)

## What feynman does NOT do

- ❌ Send analytics or telemetry
- ❌ Make network requests
- ❌ Track which prompts you submit or which responses you get
- ❌ Share state across machines (unless you copy the files yourself)
- ❌ Auto-update without your action (`npx feynman install` is explicit)

## Dependencies

feynman has **zero npm runtime dependencies** by design. It uses only Node.js built-in modules (`fs`, `path`, `os`, `child_process`, `node:test`). There is no third-party code that could collect data on its behalf.

## Source

All source code is public at https://github.com/apolenkov/feynman under the MIT license. You can verify the above claims by reading the code (about 4000 lines of CommonJS).

## Contact

For privacy concerns: open an issue at https://github.com/apolenkov/feynman/issues.

---

*Last updated: 2026-05-11 (v0.4.0)*
