#!/usr/bin/env bash
# feynman uninstall — thin wrapper around bin/feynman.ts
# Usage: bash uninstall.sh
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Node >= 22.6 check (matches package.json engines.node and ADR 0001)
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node not found. Install Node.js >=22.6: https://nodejs.org" >&2
  exit 1
fi
NODE_MAJOR=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
NODE_MINOR=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f2)
if [ -z "$NODE_MAJOR" ] || ! [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] || [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && { ! [[ "$NODE_MINOR" =~ ^[0-9]+$ ]] || [ "$NODE_MINOR" -lt 6 ]; }; }; then
  echo "Error: Node.js >=22.6 required (found $(node -v 2>/dev/null || echo 'unknown'))" >&2
  exit 1
fi

exec node "$SCRIPT_DIR/bin/feynman.ts" uninstall "$@"
