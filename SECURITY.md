# Security Policy

## Supported Versions

Security fixes are shipped for the latest published npm version.

## Reporting a Vulnerability

Please report security issues privately by opening a GitHub security advisory:

https://github.com/apolenkov/feynman/security/advisories/new

Do not file public issues for vulnerabilities. Include:

- affected version
- reproduction steps
- expected impact
- suggested fix, if known

We aim to acknowledge reports within 72 hours.

## Scope

feynman is a local hook package. The main security-sensitive surfaces are:

- hook command registration in `~/.claude/settings.json`
- hook command registration in `~/.codex/hooks.json`
- file reads from the installed package directory
- state files under `~/.claude/.feynman/` and `~/.codex/.feynman/`

The package has zero runtime npm dependencies.

## Release Security Checklist

Before publishing a new npm version:

- CI required checks must pass on Node 18 and 20 across Ubuntu and macOS.
- `npm run audit` must pass at `moderate` severity or higher.
- GitHub release tag must match `package.json` version with a `v` prefix.
- GitHub Actions secret `NPM_TOKEN` must be present for first publish of a new version.
- npm provenance is enabled in the release workflow.
- Registry smoke verification must pass after publish (`npm view`, install from npm, `feynman doctor --target all`).
