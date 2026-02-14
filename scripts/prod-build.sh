#!/bin/bash
set -e

APP_NAME="Maestro Prod"
APP_BUNDLE="$APP_NAME.app"
BUILD_OUTPUT="maestro-ui/src-tauri/target/release/bundle/macos/$APP_BUNDLE"
APP_DEST="/Applications/$APP_BUNDLE"

echo "=== Maestro Prod Build ==="

# 1. Kill any running instance
echo ""
echo "[1/5] Stopping running instances..."
pkill -f "$APP_NAME" 2>/dev/null && echo "  Killed running app." || echo "  No running instance found."
sleep 1

# 2. Remove old build artifacts and duplicate .app copies
echo ""
echo "[2/5] Cleaning old builds..."
rm -rf "$BUILD_OUTPUT"
rm -rf "maestro-ui/src-tauri/target/release/bundle/dmg"

# Remove any stale copies outside /Applications that macOS might launch instead
DUPES=$(mdfind "kMDItemFSName == '$APP_BUNDLE'" 2>/dev/null | grep -v "^$APP_DEST$" | grep -v "^$(pwd)/$BUILD_OUTPUT$" || true)
if [ -n "$DUPES" ]; then
  echo "  Removing duplicate app bundles macOS might pick up:"
  echo "$DUPES" | while read -r dup; do
    echo "    $dup"
    rm -rf "$dup"
  done
fi

# 3. Build server + binary
echo ""
echo "[3/5] Building server..."
bun run build:server
cd maestro-server && bun run build:binary && cd ..

# 4. Build Tauri app
echo ""
echo "[4/5] Building Tauri app..."
cd maestro-ui
VITE_API_URL=http://localhost:2357/api VITE_WS_URL=ws://localhost:2357 \
  bunx tauri build --features custom-protocol --config src-tauri/tauri.conf.prod.json
cd ..

# 5. Install to /Applications
echo ""
echo "[5/5] Installing to /Applications..."
if [ ! -d "$BUILD_OUTPUT" ]; then
  echo "ERROR: Build output not found at: $BUILD_OUTPUT"
  exit 1
fi

if [ -d "$APP_DEST" ]; then
  echo "  Replacing existing $APP_BUNDLE..."
  rm -rf "$APP_DEST"
fi

cp -R "$BUILD_OUTPUT" "$APP_DEST"
echo "  Installed $APP_BUNDLE to /Applications."

echo ""
echo "=== Build complete! ==="
echo "Run 'bun run prod' to launch, or open '$APP_NAME' from Applications."
