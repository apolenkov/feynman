# Launch Notes

## Positioning

feynman is a Claude Code and Codex plugin that makes structured answers
visible by default. Flows become arrows, hierarchies become trees, comparisons
become columns, priorities become scales, and status summaries become frames.

## One-liner

```bash
npx -y @albinocrabs/feynman@latest install --target all
```

## Short Description

feynman automatically injects ASCII diagram rules into Claude Code and Codex
prompts, so structured answers render as readable terminal-native diagrams
without asking every time.

## Benefits

- No runtime dependencies
- Works with Claude Code and Codex
- Installs with `npx`
- Keeps state local under `~/.claude` or `~/.codex`
- Ships a diagram linter for public docs and generated responses
- Uses plain ASCII/Unicode text, not external renderers

## Demo Script

```bash
npx -y @albinocrabs/feynman@latest install --target '*'
npx -y @albinocrabs/feynman@latest doctor --target claude
npx -y @albinocrabs/feynman@latest doctor --target codex
feynman bootstrap --out ./feynman-package
```

Prompt:

```text
Compare SQLite, Postgres, and Redis for a local-first prototype.
```

Expected shape:

```text
SQLite           | Postgres         | Redis
-----------------|------------------|----------------
single-file      | server database  | memory-first
easy local setup | richer SQL       | fast cache
limited writes   | production-ready | persistence opt
```

## Release Checklist

- `npm run ci`
- GitHub Actions CI green
- `npm run changelog`
- `npm run build`
- `npm publish --dry-run --access public`
- GitHub Release created from changelog notes
- npm package visible at `@albinocrabs/feynman@latest`
- Smoke test from clean directory:

```bash
npx -y @albinocrabs/feynman@latest version
```

For the full release playbook, see: [docs/release.md](release.md)

## Detailed Release Docs

- [docs/release.md](release.md): full end-to-end release procedure, release notes
  contract, workflow behavior, and post-release verification.
