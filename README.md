# feynman

> why explain in words when diagram do trick

A Claude Code plugin that automatically injects ASCII diagram rules into every request.
Works alongside caveman — caveman compresses words, feynman adds visual structure.

## Before / After

| Without feynman | With feynman |
|-----------------|--------------|
| The deployment pipeline has three stages: first the code is built, then tests run, then it deploys to prod. | `[Build] --> [Test] --> [Deploy]` |

## Install

```bash
git clone https://github.com/apolenkov/feynman && bash feynman/install.sh
```

Restart Claude Code. Done.

<details>
<summary>Manual install (if you prefer)</summary>

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
