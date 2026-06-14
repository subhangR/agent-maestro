#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Maestro Web UI launcher — kill, clean build, start.
#
# Stops any server already on PORT, does a CLEAN build of the browser SPA +
# server + CLI on the CURRENT branch, then runs the server under Node with
# server-hosted PTYs enabled. The server serves the SPA from its own origin,
# so the browser talks same-origin for REST, WS, and PTY streaming — making
# both session SPAWN and RESUME work in the browser.
#
# Notes:
#   - Runs the server under `node` (NOT bun): node-pty's onData doesn't fire
#     under bun, which would break the server-hosted terminals.
#   - MAESTRO_PTY_HOST=server is what makes spawn/resume start the agent PTY
#     server-side instead of relying on the Tauri desktop host.
#   - Only the process on PORT is killed — your prod server on other ports is
#     left untouched.
#
# Env overrides:
#   PORT          server + UI port            (default 4570)
#   HOST          bind address                (default 0.0.0.0)
#   DATA_DIR      data directory              (default ~/.maestro/data)
#   SESSION_DIR   session directory           (default ~/.maestro/sessions)
#   SKIP_INSTALL=1  skip `bun install`        (default: run it)
# ============================================================================

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-4570}"
HOST="${HOST:-0.0.0.0}"
DATA_DIR="${DATA_DIR:-$HOME/.maestro/data}"
SESSION_DIR="${SESSION_DIR:-$HOME/.maestro/sessions}"
UI_URL="http://localhost:${PORT}"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
echo "=========================================================="
echo "  Maestro Web UI — kill + clean build + start"
echo "  Branch: ${BRANCH}    Port: ${PORT}"
echo "=========================================================="

# --- [0/4] Kill any server already bound to PORT -----------------------------
echo "[0/4] Stopping anything on port ${PORT}..."
PIDS="$(lsof -nP -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "${PIDS}" ]; then
  echo "  Killing PID(s): ${PIDS}"
  kill ${PIDS} 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    sleep 1
    STILL="$(lsof -nP -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
    [ -z "${STILL}" ] && break
  done
  STILL="$(lsof -nP -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true)"
  if [ -n "${STILL}" ]; then
    echo "  Still up — force killing: ${STILL}"
    kill -9 ${STILL} 2>/dev/null || true
    sleep 1
  fi
  echo "  Port ${PORT} is free."
else
  echo "  Nothing listening on ${PORT}."
fi

# --- [1/4] Install deps (current branch may have changed them) ---------------
if [ "${SKIP_INSTALL:-0}" != "1" ]; then
  echo "[1/4] Installing dependencies (bun install)..."
  bun install
else
  echo "[1/4] Skipping bun install (SKIP_INSTALL=1)."
fi

# --- [2/4] Clean build of the browser UI -------------------------------------
# Remove old dist so a stale bundle can never be served, then rebuild.
# tsc/vite may exit non-zero on pre-existing type warnings (e.g. node-pty types)
# while still emitting valid JS, so we verify the OUTPUT exists rather than
# trusting the exit code. A truly failed build (no output) aborts.
echo "[2/4] Clean-building browser UI (maestro-ui -> dist)..."
rm -rf maestro-ui/dist
( cd maestro-ui && bun run build:web ) || echo "  (UI build reported issues; checking output...)"
if [ ! -f maestro-ui/dist/index.html ]; then
  echo "ERROR: UI build produced no maestro-ui/dist/index.html. Aborting." >&2
  exit 1
fi

# --- [3/4] Clean build of the server + CLI -----------------------------------
echo "[3/4] Clean-building server + CLI (-> dist)..."
rm -rf maestro-server/dist
( cd maestro-server && bun run build ) || echo "  (server build reported issues; checking output...)"
if [ ! -f maestro-server/dist/server.js ]; then
  echo "ERROR: server build produced no maestro-server/dist/server.js. Aborting." >&2
  echo "  Hint: run 'bun install' at the repo root (node-pty may be missing)." >&2
  exit 1
fi
rm -rf maestro-cli/dist
( cd maestro-cli && bun run build ) || echo "  (CLI build reported issues; continuing...)"

# --- [4/4] Start the server under Node ---------------------------------------
echo ""
echo "=========================================================="
echo "  Maestro Web UI is starting (branch: ${BRANCH})."
echo ""
echo "  Open in your browser:  ${UI_URL}"
echo "    (hard-refresh: Cmd+Shift+R to drop the cached bundle)"
echo ""
echo "  Data:    ${DATA_DIR}"
echo "  Session: ${SESSION_DIR}"
echo "=========================================================="
echo ""

exec env \
  PORT="$PORT" \
  HOST="$HOST" \
  MAESTRO_PTY_HOST=server \
  SERVER_URL="$UI_URL" \
  DATA_DIR="$DATA_DIR" \
  SESSION_DIR="$SESSION_DIR" \
  NODE_ENV=production \
  node maestro-server/dist/server.js
