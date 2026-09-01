# Launch guide

feynman makes structured Codex answers readable with small terminal-native
visuals. It is distributed as a native Codex plugin and an npm CLI.

## Install

```bash
codex plugin marketplace add apolenkov/feynman --ref main
codex plugin add feynman@feynman
npx -y @albinocrabs/feynman@latest install
npx -y @albinocrabs/feynman@latest doctor
```

The installer writes only to `~/.codex` and is idempotent. Verify the package
from a clean directory with `npx -y @albinocrabs/feynman@latest version`.

## skills.sh discovery

Feynman is also a public Codex skill source for skills.sh:

```bash
npx skills add apolenkov/feynman --skill feynman --agent codex --global --yes
```

This installs the skill only for Codex. The catalog is populated from public
sources and anonymous install telemetry, so search visibility is asynchronous;
the repository remains the source of truth.

## Release checklist

- `npm run ci` passes locally.
- CI is green on `main`.
- The top `[Unreleased]` section of `CHANGELOG.md` is curated.
- `npm run build` and `npm publish --dry-run --access public` pass.
- A GitHub Release is created from the matching `v<version>` tag.
- The package and `npx` smoke test are verified after publication.

See [release.md](release.md) for the complete procedure.
