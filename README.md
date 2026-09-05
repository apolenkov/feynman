# feynman

![CI](https://github.com/apolenkov/feynman/actions/workflows/ci.yml/badge.svg?label=CI&color=2563EB)
![npm](https://img.shields.io/npm/v/@albinocrabs/feynman?color=2563EB)
![License](https://img.shields.io/github/license/apolenkov/feynman?color=2563EB)
[![skills.sh](https://skills.sh/b/apolenkov/feynman)](https://skills.sh/apolenkov/feynman)

feynman adds visual-explanation instructions to Codex. The native skill guides
Codex in choosing a flow, tree, table or list from the task's facts. An optional
local CLI installs session-wide diagram guidance and provides an ASCII linter.

Use it when you want a visual explanation. The latest controlled comparison
did not establish clearer answers than ordinary Codex responses, and factual
and instruction-compliance failures remain. See the
[evaluation report](docs/evaluation-3ab9de4.md). Technical test results do not
establish explanation quality.

## Install

### Native Codex plugin

```bash
codex plugin marketplace add apolenkov/feynman --ref main
codex plugin add feynman@feynman
```

Open `/plugins` in Codex to search for **Feynman**, install it, then start a
new session. The skill is discoverable for visual architecture, ASCII diagrams,
flows, trees, comparisons, priorities, and status summaries.
Explanation requests work directly from the packaged skill; they do not need
the CLI, a hook, network access, or local state setup.

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

The instructions ask Codex to identify a response's structure and choose a
small visual: flow, tree, table, status marker, or frame. They ask it to preserve
prose-only requests; model compliance is not guaranteed. The
default hook Intensity is `full`; `lite` and `ultra` are available through
`feynman state`. These persistent preferences apply to the CLI-installed hook;
standalone skill explanations follow their packaged instructions and your request.

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
feynman bootstrap --out DIR # export an operable local bundle
feynman version
```

The CLI has zero third-party runtime dependencies and requires Node.js 22.18 or
newer. Installation through `npx` still requires npm. The native explanation
skill does not need Node.js until you explicitly request a CLI operation.

`bootstrap --force` replaces only a previous Feynman export with ownership
metadata. It refuses unrelated, symlinked and protected destinations.

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

The quality gate checks formatting, types, typed lint, behavior, coverage scope,
documentation and byte-for-byte package reproducibility. The live comparison
of explanations is separate: the latest 96-answer experiment completed and
failed its acceptance criteria. See the [results](docs/evaluation-3ab9de4.md)
and [protocol](evals/protocol-v2.md).

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution workflow,
[SECURITY.md](SECURITY.md) for private vulnerability reports, and
[docs/release.md](docs/release.md) for publishing. See
[docs/codex-plugin.md](docs/codex-plugin.md) for the native plugin contract.

## Privacy and license

feynman is local-only: its hook reads packaged rules and Codex-local state and
writes no telemetry. A skill-requested `npx` state command may fetch the public
package if it is not already cached; the hook itself makes no network request.
See [PRIVACY.md](PRIVACY.md). Licensed under the MIT License.
