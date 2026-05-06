# feynman

> why explain in words when diagram do trick

A Claude Code plugin that automatically injects ASCII diagram rules into every request.
Works alongside caveman — caveman compresses words, feynman adds visual structure.

## Before / After

| Without feynman | With feynman |
|-----------------|--------------|
| The deployment pipeline has three stages: first the code is built, then tests run, then it deploys to prod. | `[Build] --> [Test] --> [Deploy]` |

## Install

<!-- INSTALL PLACEHOLDER -->

Until the install script ships, register the hook manually in `~/.claude/settings.json`:

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

> **Important:** Replace `/absolute/path/to/feynman` with the actual path where you cloned this repo.
> Do not use `~/` — Claude Code requires an absolute path (see [bug #8810](https://github.com/anthropics/claude-code/issues/8810)).
