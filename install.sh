#!/usr/bin/env bash
# feynman install — registers UserPromptSubmit hook in ~/.claude/settings.json
# Usage: bash install.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_PATH="$REPO_DIR/hooks/feynman-activate.js"
SETTINGS="$HOME/.claude/settings.json"

[ -f "$HOOK_PATH" ] || { echo "Error: $HOOK_PATH not found. Run from repo root." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Error: node not found. Install Node.js first." >&2; exit 1; }

mkdir -p "$(dirname "$SETTINGS")"

SETTINGS="$SETTINGS" HOOK_PATH="$HOOK_PATH" node -e "
const fs = require('fs');
const p = process.env.SETTINGS;
const hookPath = process.env.HOOK_PATH;
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(p, 'utf8')); } catch(e) {}
cfg.hooks = cfg.hooks || {};
cfg.hooks.UserPromptSubmit = cfg.hooks.UserPromptSubmit || [];
const already = cfg.hooks.UserPromptSubmit.some(g =>
  g.hooks && g.hooks.some(h => h.command && h.command.includes('feynman-activate.js'))
);
if (already) { console.log('feynman already installed → ' + p); process.exit(0); }
cfg.hooks.UserPromptSubmit.push({
  hooks: [{ type: 'command', command: 'node \"' + hookPath + '\"', timeout: 5, statusMessage: 'Injecting diagram rules...' }]
});
fs.writeFileSync(p, JSON.stringify(cfg, null, 2));
console.log('feynman installed → ' + p);
"

echo "Restart Claude Code to activate."
