#!/bin/zsh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(command -v node)"
AGENT_DIR="$HOME/Library/LaunchAgents"
AGENT_PATH="$AGENT_DIR/com.harbor.local-bridge.plist"
LOG_DIR="$PROJECT_DIR/.harbor/logs"

mkdir -p "$AGENT_DIR" "$LOG_DIR"

cat > "$AGENT_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.harbor.local-bridge</string>
  <key>ProgramArguments</key>
  <array><string>$NODE_BIN</string><string>$PROJECT_DIR/harbor-local-bridge.mjs</string></array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/bridge.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/bridge.error.log</string>
</dict>
</plist>
PLIST

launchctl bootout "gui/$(id -u)/com.harbor.local-bridge" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$AGENT_PATH"
echo "Zoid Bank bridge installed and kept alive at http://127.0.0.1:4317"
