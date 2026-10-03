#!/bin/sh
# Installe la synchro du soir sur le Mac : commande `nyxlink-sync` et tâche launchd de 22 h.
# Relançable sans risque. Les réglages (~/.config/nyxlink/sync.json) et le mot de passe
# (trousseau) se configurent à part : voir le README.
set -eu
ICI=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$ICI/nyxlink_sync.py"
LOG="$HOME/Library/Logs/nyxlink-sync.log"
PLIST="$HOME/Library/LaunchAgents/com.krimo.nyxlink-sync.plist"

chmod +x "$SCRIPT"
mkdir -p "$HOME/.local/bin" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
ln -sf "$SCRIPT" "$HOME/.local/bin/nyxlink-sync"
sed -e "s#__SCRIPT__#$SCRIPT#" -e "s#__LOG__#$LOG#" "$ICI/com.krimo.nyxlink-sync.plist" > "$PLIST"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installé : commande nyxlink-sync, tâche launchd chaque soir à 22 h, journal $LOG"
