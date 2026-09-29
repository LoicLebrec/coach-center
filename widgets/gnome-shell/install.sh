#!/usr/bin/env bash
# Install the Coach Center GNOME Shell widget.
#   bash widgets/gnome-shell/install.sh '<feed URL>' '<app URL>'
# Both URLs are shown in Coach Center → Settings → Widget.
set -euo pipefail
UUID="coach-center@coachcenter"
SRC="$(cd "$(dirname "$0")" && pwd)/$UUID"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"
CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/coach-center"

FEED="${1:-}"
APP="${2:-}"
mkdir -p "$DEST" "$CONF_DIR"
cp -r "$SRC/." "$DEST/"
if [ -n "$FEED" ]; then
  printf '{\n  "feedUrl": "%s",\n  "appUrl": "%s"\n}\n' "$FEED" "$APP" > "$CONF_DIR/widget.json"
  chmod 600 "$CONF_DIR/widget.json"
fi

echo "Installed to $DEST"
if gnome-extensions enable "$UUID" 2>/dev/null; then
  echo "Enabled."
else
  echo "GNOME doesn't see new extensions until you log out and back in (Wayland)."
  echo "After logging back in, run: gnome-extensions enable $UUID"
fi
