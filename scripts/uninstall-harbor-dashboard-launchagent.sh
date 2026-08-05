#!/bin/zsh
set -euo pipefail
AGENT_PATH="$HOME/Library/LaunchAgents/com.harbor.dashboard.plist"
launchctl bootout "gui/$(id -u)/com.harbor.dashboard" 2>/dev/null || true
rm -f "$AGENT_PATH"
echo "Zoid Bank compiled dashboard LaunchAgent removed."
