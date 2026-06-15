#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[web-setup] Installing dependencies..."
bun install

echo "[web-setup] Building browser UI + server + CLI..."
bun run build:web

echo ""
echo "[web-setup] Done. Start the server with:"
echo ""
echo "  PORT=4570 DATA_DIR=~/.maestro/data SESSION_DIR=~/.maestro/sessions \\"
echo "    MAESTRO_PTY_HOST=server NODE_ENV=production \\"
echo "    node maestro-server/dist/server.js"
echo ""
echo "  Or: bun run web"
echo ""
echo "  Then open: http://localhost:4570"
