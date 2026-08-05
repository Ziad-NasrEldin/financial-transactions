#!/bin/zsh
set -euo pipefail

AGENT_PATH="$HOME/Library/LaunchAgents/com.harbor.local-bridge.plist"
launchctl bootout "gui/$(id -u)/com.harbor.local-bridge" 2>/dev/null || true
rm -f "$AGENT_PATH"
echo "Zoid Bank bridge LaunchAgent removed."
