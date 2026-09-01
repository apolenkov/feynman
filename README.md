# feynman

![CI](https://github.com/apolenkov/feynman/actions/workflows/ci.yml/badge.svg?label=CI&color=2563EB)
![npm](https://img.shields.io/npm/v/@albinocrabs/feynman?color=2563EB)
![License](https://img.shields.io/github/license/apolenkov/feynman?color=2563EB)
[![skills.sh](https://skills.sh/b/apolenkov/feynman)](https://skills.sh/apolenkov/feynman)

feynman is a Codex plugin and local CLI that makes structured answers easier to
read. It injects concise diagram guidance at Codex session start and provides a
standalone linter for ASCII visuals.

## Install

### Native Codex plugin

```bash
codex plugin marketplace add apolenkov/feynman --ref main
codex plugin add feynman@feynman
```

Open `/plugins` in Codex to search for **Feynman**, install it, then start a
new session. The skill is discoverable for visual architecture, ASCII diagrams,
flows, trees, comparisons, priorities, and status summaries.

### skills.sh (Codex)

For teams that distribute skills through [skills.sh](https://www.skills.sh/),
install the same Codex-only skill directly from this repository:

```bash
npx skills add apolenkov/feynman --skill feynman --agent codex --global --yes
```

The skill delegates state changes to the published CLI through `npx`; it does
not install or configure any non-Codex integration. The skills.sh catalog is
indexed asynchronously after installations, so a newly released source can
take a short time to appear in search.

### Local hook and CLI

```bash
npx -y @albinocrabs/feynman@latest install
npx -y @albinocrabs/feynman@latest doctor
```

The installer targets Codex by default and writes only to `~/.codex`. It is
idempotent. Uninstall with:

```bash
npx -y @albinocrabs/feynman@latest uninstall
```

The native plugin supplies the Codex skill. The CLI installer registers the
`SessionStart` hook that injects the selected ruleset into a session.

## What it does

feynman classifies a response's structure and chooses the smallest useful
visual: flow, tree, table, status marker, or frame. Prose stays prose. The
default Intensity is `full`; `lite` and `ultra` are available through the
Codex skill or `feynman state`.

```text
[Build] --> [Test] --> [Deploy]
```

The hook runs on `startup`, `resume`, `compact`, and `clear`, so the rules are
restored after context compaction without being repeated on every prompt.

## CLI

```bash
feynman install             # register the Codex hook
feynman doctor              # inspect the local Codex installation
feynman state lite          # set diagram intensity
feynman state style short   # choose an output-style preset
feynman status              # show current state
feynman uninstall           # remove feynman registration, keep state
feynman lint README.md      # lint ASCII visuals in a file
feynman lint --strict FILE  # treat warnings as errors
feynman examples            # list bundled examples
feynman version
```

The package has zero runtime npm dependencies and requires Node.js 22.18 or
newer. `npm` is used only for development, packaging, and publication.

## Repository map

```text
core contract       rules/, lib/state/     Contract, state model, pure rules
application         bin/commands/          CLI use cases
adapters            bin/adapters/, hooks/  Codex filesystem and SessionStart integration
lint subsystem      lib/lint/              parser, rules, reporter
quality             tests/, scripts/       tests, checks, package build
Codex distribution  plugins/feynman/       native marketplace plugin
documentation       docs/, CONTEXT.md      architecture, decisions, vocabulary
specifications      openspec/specs/        active testable requirements
```

The core contract never depends on commands or adapters; commands coordinate
the local Codex/filesystem adapters. The linter is a separate application path
sharing only small domain-neutral utilities. See
[Architecture](docs/architecture.md) for the full map and boundaries.

## Development

```bash
git clone https://github.com/apolenkov/feynman.git
cd feynman
npm ci
npm run ci
```

Before opening a pull request, run `npm run ci` and lint changed markdown with
`npm run lint -- <files>`. Use Conventional Commits. Keep changes focused and
add a test for changed behavior.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow,
[SECURITY.md](SECURITY.md) for private vulnerability reports, and
[docs/release.md](docs/release.md) for publishing. See
[docs/codex-plugin.md](docs/codex-plugin.md) for the native plugin contract.

## Privacy and license

feynman is local-only: its hook reads packaged rules and Codex-local state and
writes no telemetry. A skill-requested `npx` state command may fetch the public
package if it is not already cached; the hook itself makes no network request.
See [PRIVACY.md](PRIVACY.md). Licensed under the MIT License.
