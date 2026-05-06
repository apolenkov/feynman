<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/pencil_270f-fe0f.png" width="120" />
</p>

<h1 align="center">feynman</h1>

<p align="center">
  <strong>why explain in words when diagram do trick</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/feynman"><img src="https://img.shields.io/npm/v/feynman?style=flat&color=blue" alt="npm version"></a>
  <a href="https://github.com/apolenkov/feynman/actions/workflows/ci.yml"><img src="https://github.com/apolenkov/feynman/workflows/CI/badge.svg" alt="CI"></a>
  <a href="https://github.com/apolenkov/feynman/blob/main/.github/coverage-badge.json"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/apolenkov/feynman/main/.github/coverage-badge.json" alt="Coverage"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/apolenkov/feynman?style=flat" alt="License"></a>
  <a href="https://github.com/apolenkov/feynman/stargazers"><img src="https://img.shields.io/github/stars/apolenkov/feynman?style=flat&color=yellow" alt="Stars"></a>
  <a href="https://github.com/apolenkov/feynman/commits/main"><img src="https://img.shields.io/github/last-commit/apolenkov/feynman?style=flat" alt="Last Commit"></a>
</p>

<p align="center">
  <a href="#why-feynman">Why</a> •
  <a href="#before--after">Before/After</a> •
  <a href="#install">Install</a> •
  <a href="#intensity-levels">Levels</a> •
  <a href="#lint">Lint</a> •
  <a href="#examples">Examples</a> •
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

---

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin that
automatically injects ASCII diagram rules into every prompt via the
`UserPromptSubmit` hook.

<!-- TODO: GIF after v0.3.0 visual capture -->

## Why feynman

Structured information explained in prose forces you to rebuild the structure
in your head before you can reason about it. feynman intercepts every Claude
prompt and injects rules that turn flows into arrows, hierarchies into trees,
comparisons into columns, and status into frames. The structure is visible
before you have to think about it.

## Before / After

<table>
<tr>
<td width="50%">

### Without feynman

> "The deployment pipeline has three stages: first the code is built, then tests run, then it deploys to prod."

</td>
<td width="50%">

### With feynman

```
[Build] --> [Test] --> [Deploy]
```

</td>
</tr>
<tr>
<td>

### Without feynman

> "Option A is fast but stateless. Option B is slower but persists data. Option C gives you both at higher cost."

</td>
<td>

### With feynman

```
Option A       | Option B      | Option C
---------------|---------------|----------
fast startup   | slow startup  | medium
stateless      | persistent    | persistent
free           | free          | $$$
```

</td>
</tr>
<tr>
<td>

### Without feynman

> "Fix the auth bug first since it's a security issue, then the memory leak, then the slow query."

</td>
<td>

### With feynman

```
▲ high
  auth bug (security)
  memory leak
▼ low
  slow query
```

</td>
</tr>
<tr>
<td>

### Without feynman

> "The auth service talks to Redis for rate limiting and Postgres for user data."

</td>
<td>

### With feynman

```
[Auth Service]
     ├── [Redis]    rate limiter
     └── [Postgres] user data
```

</td>
</tr>
</table>

## Install

**Via npx (recommended):**

```bash
npx feynman install
```

**Via bash one-liner:**

```bash
git clone https://github.com/apolenkov/feynman && bash feynman/install.sh
```

Restart Claude Code. Done.

**Verify:** `npx feynman doctor`

**Uninstall:** `npx feynman uninstall`

<details>
<summary>Manual install</summary>

Add to `~/.claude/settings.json` — use the absolute path, not `~/`
([bug #8810](https://github.com/anthropics/claude-code/issues/8810)):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/absolute/path/to/feynman/hooks/feynman-activate.js\"",
            "timeout": 5,
            "statusMessage": "Injecting diagram rules..."
          }
        ]
      }
    ]
  }
}
```
</details>

## Intensity Levels

| Level | What draws | Use when |
|-------|-----------|----------|
| **lite** | Flows + trees only | Minimal, subtle |
| **full** | All 5 diagram types (default) | Normal use |
| **ultra** | Force diagram even for short answers | Maximum visual structure |

Toggle via `/feynman`:

```
/feynman lite    — flows and trees only
/feynman full    — all diagram types
/feynman ultra   — force diagrams always
/feynman off     — disable
/feynman on      — re-enable
/feynman status  — show current state
```

## Lint

feynman includes a linter for ASCII diagrams. It catches structural errors
before they reach readers: unclosed boxes, wrong tree characters, mixed arrow
styles, inconsistent column counts, and more.

```bash
npx feynman lint response.md
```

See [docs/lint-rules.md](docs/lint-rules.md) for the full L01-L08 reference.

## Examples

Domain-specific examples showing feynman in practice:

- [Architecture review](examples/architecture-review.md) — auth service topology
- [API flow](examples/api-flow.md) — POST /api/login request lifecycle
- [Database schema](examples/db-schema.md) — e-commerce entity model
- [Algorithm walkthrough](examples/algorithm-explain.md) — token-bucket rate limiter
- [Deploy pipeline](examples/deploy-pipeline.md) — monorepo CI/CD
- [Code review](examples/code-review.md) — priority + comparison diagrams

## How it works

The `UserPromptSubmit` hook fires on every Claude prompt. The hook reads
`~/.claude/.feynman/state.json`, extracts the rules for the active intensity
level, and injects them as `additionalContext` — invisible to you, visible to
Claude on every message.

```
[your prompt]
      +
[feynman rules]    ← injected by hook, ~2KB
      │
      ▼
  [Claude]
      │
      ▼
[structured response with ASCII diagrams]
```

State is stored at `~/.claude/.feynman/state.json`. First run bootstraps
automatically. See [docs/architecture.md](docs/architecture.md) for internals.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, PR checklist, and
rules-authoring guidelines.

## License

MIT
