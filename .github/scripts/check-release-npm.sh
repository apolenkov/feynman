#!/usr/bin/env bash
set -eu

version=$(npm --version)
# The exact Node release supplies a stable npm with three numeric components.
if [[ $version =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  major=${BASH_REMATCH[1]}
  minor=${BASH_REMATCH[2]}
  patch=${BASH_REMATCH[3]}
  if (( major > 11 || (major == 11 && (minor > 5 || (minor == 5 && patch >= 1))) )); then
    exit 0
  fi
fi
echo "Trusted Publishing requires stable npm >= 11.5.1 (found $version)" >&2
exit 1
