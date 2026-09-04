# Codex plugin contract

feynman follows the native Codex plugin layout:

```text
.agents/plugins/marketplace.json             searchable repository catalog
plugins/feynman/.codex-plugin/plugin.json    stable plugin identity and UI metadata
plugins/feynman/skills/feynman/SKILL.md      discoverable visual-explanation skill
```

The skill's frontmatter names the user intents it handles: visual architecture,
ASCII diagrams, flows, trees, comparisons, priorities, status, intensity, and
output style. In Codex, search **Feynman** in `/plugins`, install it, start a
new session, then invoke it explicitly with `@feynman` or ask for a matching
outcome.

The plugin's skill can explain directly from its packaged instructions. An
ordinary explanation request needs no CLI, hook, download, or local state read.
The npm CLI and SessionStart hook provide optional persistent assistance.

The plugin intentionally has no MCP server. MCP is for external tools or data;
feynman has neither. For an explicit settings request, its state bridge is `npx -y
@albinocrabs/feynman@latest` command, which manages the user's Codex-local
state and hook without a global binary prerequisite. If the package is not in
the npm cache, that user-requested command may download the public package; the
installed hook itself stays local and network-free.

The repository marketplace is the distribution source for the native plugin;
the npm package distributes the CLI and hook. Keep their versions synchronized
through `scripts/feynman-bump.ts` and verify both with `npm run ci`.
