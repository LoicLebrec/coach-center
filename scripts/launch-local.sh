#!/usr/bin/env bash
# Starts Coach Center locally (API :3001 + frontend :3000) if not already
# running, then opens it in an app window. Used by the desktop launcher.
set -u

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/coach-center"
URL="http://localhost:3000"
mkdir -p "$LOG_DIR"

# Desktop launchers don't load the shell profile — pick up nvm's node if present.
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  . "$HOME/.nvm/nvm.sh"
fi

listening() { ss -ltn 2>/dev/null | grep -q ":$1 "; }

if ! listening 3001; then
  (cd "$APP_DIR/api" && nohup node index.js >"$LOG_DIR/api.log" 2>&1 &)
fi

if ! listening 3000; then
  (cd "$APP_DIR" && BROWSER=none nohup npm start >"$LOG_DIR/web.log" 2>&1 &)
fi

# Wait for the dev server (first compile can take ~30 s).
for _ in $(seq 1 90); do
  curl -s -o /dev/null "$URL" && break
  sleep 1
done

for b in brave-browser google-chrome chromium chromium-browser; do
  if command -v "$b" >/dev/null 2>&1; then
    exec "$b" --app="$URL" --class=CoachCenter
  fi
done
if flatpak info com.brave.Browser >/dev/null 2>&1; then
  exec flatpak run com.brave.Browser --app="$URL" --class=CoachCenter
fi
exec xdg-open "$URL"
