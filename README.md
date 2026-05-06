<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/pencil_270f-fe0f.png" width="120" />
</p>

<h1 align="center">feynman</h1>

<p align="center">
  <strong>why explain in words when diagram do trick</strong>
</p>

<p align="center">
  <a href="https://github.com/apolenkov/feynman/stargazers"><img src="https://img.shields.io/github/stars/apolenkov/feynman?style=flat&color=yellow" alt="Stars"></a>
  <a href="https://github.com/apolenkov/feynman/commits/main"><img src="https://img.shields.io/github/last-commit/apolenkov/feynman?style=flat" alt="Last Commit"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/apolenkov/feynman?style=flat" alt="License"></a>
</p>

<p align="center">
  <a href="#before--after">Before/After</a> •
  <a href="#install">Install</a> •
  <a href="#intensity-levels">Levels</a>
</p>

---

A [Claude Code](https://docs.anthropic.com/en/docs/claude-code) plugin that automatically injects ASCII diagram rules into every prompt via the `UserPromptSubmit` hook.

When your response has structure — feynman draws it. Flows become arrows. Hierarchies become trees. Comparisons become columns. Status becomes frames.

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
</table>

**Same answer. Structure visible. Brain not need to extract.**

## Install

```bash
git clone https://github.com/apolenkov/feynman && bash feynman/install.sh
```

Restart Claude Code. Done.

<details>
<summary>Manual install</summary>

Add to `~/.claude/settings.json` — use the absolute path, not `~/` ([bug #8810](https://github.com/anthropics/claude-code/issues/8810)):

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

## How it works

The `UserPromptSubmit` hook fires on every Claude prompt. The hook reads `~/.claude/.feynman/state.json`, extracts the rules for the active intensity level, and injects them as `additionalContext` — invisible to you, visible to Claude on every message.

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

State is stored at `~/.claude/.feynman/state.json`. First run bootstraps automatically.

## License

MIT
