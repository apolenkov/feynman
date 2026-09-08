# Launch guide

feynman makes structured Codex answers readable with small terminal-native
visuals. It is distributed as a native Codex plugin and an npm CLI.

## Install

```bash
codex plugin marketplace add apolenkov/feynman --ref main
codex plugin add feynman@feynman
npm install --global --ignore-scripts @albinocrabs/feynman@2.1.1
feynman install
feynman doctor
```

The optional CLI installation is persistent. The installer writes only to
`~/.codex` and is idempotent. Verify the installed CLI with `feynman version`.
Install a newer pinned version only as a separate explicit upgrade.

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
- The package and clean-consumer CLI smoke test are verified after publication.

See [release.md](release.md) for the complete procedure.
