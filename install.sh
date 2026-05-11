#!/usr/bin/env bash
# feynman install — thin wrapper around bin/feynman.ts
# Usage: bash install.sh [--force]
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Node >= 18 check
if ! command -v node >/dev/null 2>&1; then
  echo "Error: node not found. Install Node.js >=18: https://nodejs.org" >&2
  exit 1
fi
NODE_VER=$(node -v 2>/dev/null | sed 's/v//' | cut -d. -f1)
if [ -z "$NODE_VER" ] || [ "$NODE_VER" -lt 18 ] 2>/dev/null; then
  echo "Error: Node.js >=18 required (found $(node -v 2>/dev/null || echo 'unknown'))" >&2
  exit 1
fi

exec node "$SCRIPT_DIR/bin/feynman.ts" install "$@"
