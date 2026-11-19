#!/bin/bash
# Starts the Job Hunt web UI (http://127.0.0.1:3000) and keeps the Mac awake while it runs.
# Works from a terminal, from Finder, and from a launchd LaunchAgent (see ui/README.md).
set -eo pipefail

cd "$(dirname "$0")/ui"

# launchd starts with a bare PATH: load nvm's default Node and the Claude Code install.
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

# With an API key set, Claude Code bills the API instead of the Max plan.
unset ANTHROPIC_API_KEY

command -v node >/dev/null || { echo "Node.js not found. Install Node 24+ (nvm install 24)." >&2; exit 1; }
command -v claude >/dev/null || { echo "Claude Code not found on PATH." >&2; exit 1; }

[ -d node_modules ] || npm install
npm run build

# caffeinate -i: no idle sleep; -s: no system sleep while on power. Closing the lid still sleeps
# the Mac unless you change that too (see ui/README.md).
NODE_ENV=production exec caffeinate -is node server/src/index.ts
