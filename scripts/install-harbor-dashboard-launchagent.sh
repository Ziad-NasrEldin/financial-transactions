#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
AGENT_DIR="$HOME/Library/LaunchAgents"
AGENT_PATH="$AGENT_DIR/com.harbor.dashboard.plist"
LOG_DIR="$PROJECT_DIR/.harbor/logs"
mkdir -p "$AGENT_DIR" "$LOG_DIR"

cat > "$AGENT_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.harbor.dashboard</string>
  <key>ProgramArguments</key><array><string>$NODE_BIN</string><string>$PROJECT_DIR/harbor-prod-server.mjs</string></array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key><dict><key>HARBOR_WEB_PORT</key><string>4180</string></dict>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/dashboard.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/dashboard.error.log</string>
</dict></plist>
PLIST

launchctl bootout "gui/$(id -u)/com.harbor.dashboard" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT_PATH"
echo "Zoid Bank compiled dashboard installed at http://127.0.0.1:4180"
