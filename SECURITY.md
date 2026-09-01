# Security Policy

Security fixes are supported for the latest published npm version. The
supported runtime is Node.js 22.18 or newer.

## Report a vulnerability

Open a private GitHub security advisory:

https://github.com/apolenkov/feynman/security/advisories/new

Do not disclose vulnerabilities in a public issue. Include the affected
version, reproduction steps, impact, and a suggested fix when available. We
aim to acknowledge reports within 72 hours.

## Security boundaries

feynman is a local Codex hook. Sensitive surfaces are the Codex hook
registration in `~/.codex/hooks.json`, reads from the installed package, and
the local state files under `~/.codex/.feynman/`.

The published package has zero runtime npm dependencies. The hook validates
session input, confines state to the selected Codex home, and fails safe on
invalid state or rules.

## Release checks

- CI passes on the supported Node.js baseline on Ubuntu and macOS.
- `npm run audit` reports no moderate-or-higher vulnerabilities.
- The GitHub tag matches `package.json` with a `v` prefix.
- npm provenance is enabled.
- A clean-directory npm smoke test passes after publication.
