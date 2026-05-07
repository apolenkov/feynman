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
