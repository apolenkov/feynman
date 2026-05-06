---
generated: "2026-05-06"
status: disabled
---

# Graphify Status

`$gsd-graphify` was requested, but graphify is disabled in `.planning/config.json`.

CLI output:

```json
{
  "disabled": true,
  "message": "graphify is not enabled. Enable with: gsd-tools config-set graphify.enabled true"
}
```

No graph artifacts were generated.

To enable later:

```bash
node $HOME/.codex/get-shit-done/bin/gsd-tools.cjs config-set graphify.enabled true
```
