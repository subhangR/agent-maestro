#!/usr/bin/env bash
# TEMP: maestro-mobile Phase-1 on-device test launcher (Atlas).
# Reconnect the phone (USB, unlocked, USB-debugging allowed), then run this.
# Uses Expo's supported run:android flow on port 8083 (8081 is held by another
# project), which injects the Metro dev-server URL into the dev client correctly.
set -uo pipefail
cd "$(dirname "$0")"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
export NODE_ENV=development

echo "▶ Live server on :4569…"
if curl -s -m 3 http://localhost:4569/health >/dev/null 2>&1; then
  echo "  up ✓"
else
  echo "  ⚠ DOWN — start it first:"
  echo "    PORT=4569 MAESTRO_PTY_HOST=server DATA_DIR=~/.maestro-staging/data \\"
  echo "      SESSION_DIR=~/.maestro-staging/sessions NODE_ENV=development \\"
  echo "      node ../maestro-server/dist/server.js &"
fi

echo "▶ Waiting for phone (plug in via USB, unlock, allow USB-debugging)…"
adb wait-for-device
SERIAL=$(adb devices | awk 'NR==2 && $2=="device"{print $1}')
if [ -z "${SERIAL:-}" ]; then
  echo "  No authorized device — unlock + tap 'Allow USB debugging', then re-run."
  exit 1
fi
echo "  device: $SERIAL ✓"

echo "▶ Build (arm64-only, cached) + install + launch + Metro:8083…"
echo "  When it boots, the harness shows host '192.168.1.5:4569' — tap Connect."
exec npx expo run:android --port 8083
