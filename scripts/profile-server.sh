#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# Maestro server profiler  (macOS)
#
# Profiles a running `node maestro-server/dist/server.js` process: memory (RSS,
# physical footprint, malloc/heap zones), CPU (interval-accurate via top),
# threads, file descriptors, TCP connections, WebSocket clients, the PTY-host
# child terminals it manages, and the on-disk data store that backs it.
#
# Usage:
#   scripts/profile-server.sh                # auto-detect the server PID/port
#   PID=5398 scripts/profile-server.sh       # profile a specific PID
#   PORT=4570 SAMPLES=12 scripts/profile-server.sh
#
# Env overrides:
#   PID        server process id        (default: auto-detected)
#   PORT       health/ws-status port    (default: auto-detected from lsof)
#   SAMPLES    cpu samples to take      (default 8)
#   INTERVAL   seconds between samples  (default 2)
#   DATA_DIR   maestro data dir         (default ~/.maestro/data)
# ============================================================================

SAMPLES="${SAMPLES:-8}"
INTERVAL="${INTERVAL:-2}"
DATA_DIR="${DATA_DIR:-$HOME/.maestro/data}"

# --- Resolve target PID -----------------------------------------------------
# Note: macOS `pgrep -f` matches against truncated argv and misses the relative
# `node maestro-server/dist/server.js` invocation, so match on full args via ps
# and keep only the node process (the shell wrapper that launched it also matches).
if [[ -z "${PID:-}" ]]; then
  PID="$(ps -axww -o pid=,comm=,command= \
          | awk '/[m]aestro-server\/dist\/server\.js/ && $2 ~ /node$/ {print $1; exit}' || true)"
fi
if [[ -z "${PID:-}" ]]; then
  echo "error: no running 'maestro-server/dist/server.js' process found." >&2
  echo "       pass PID=<pid> explicitly, or start the server first." >&2
  exit 1
fi
if ! ps -p "$PID" >/dev/null 2>&1; then
  echo "error: PID $PID is not running." >&2
  exit 1
fi

# --- Resolve port (for /health + /ws-status) --------------------------------
if [[ -z "${PORT:-}" ]]; then
  PORT="$(lsof -nP -iTCP -sTCP:LISTEN -a -p "$PID" 2>/dev/null \
            | grep -oE ':[0-9]+ \(LISTEN\)' | grep -oE '[0-9]+' | head -1 || true)"
fi

hr() { printf '%.0s=' {1..60}; echo; }

hr
echo " MAESTRO SERVER PROFILE"
hr
echo "PID    : $PID  ($(ps -o comm= -p "$PID" | xargs basename))"
echo "Port   : ${PORT:-unknown}"
echo "When   : $(date '+%Y-%m-%d %H:%M:%S')"
START="$(ps -o lstart= -p "$PID" 2>/dev/null || true)"
echo "Started: ${START:-unknown}"
if [[ -n "${PORT:-}" ]]; then
  UP="$(curl -s -m2 "http://localhost:${PORT}/health" 2>/dev/null | sed 's/.*"uptime"://; s/}//' || true)"
  [[ -n "${UP:-}" ]] && printf "Uptime : %.0f s  (%.1f min)\n" "$UP" "$(echo "$UP/60" | bc -l)"
  WS="$(curl -s -m2 "http://localhost:${PORT}/ws-status" 2>/dev/null || true)"
  echo "WS     : ${WS:-n/a}"
fi
echo

# --- Static resource snapshot ----------------------------------------------
echo "---- Resource handles (server process) ----"
echo "Open FDs   : $(lsof -nP -p "$PID" 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')"
echo "Threads    : $(ps -M "$PID" 2>/dev/null | tail -n +2 | wc -l | tr -d ' ')"
echo "TCP estab  : $(lsof -nP -iTCP -a -p "$PID" 2>/dev/null | grep -c ESTABLISHED || true)"
echo "TCP listen : $(lsof -nP -iTCP -a -p "$PID" 2>/dev/null | grep -c LISTEN || true)"
echo

# --- Memory breakdown (physical footprint + malloc/heap zones) --------------
echo "---- Memory (vmmap -summary) ----"
if command -v vmmap >/dev/null 2>&1; then
  vmmap -summary "$PID" 2>/dev/null \
    | grep -E "Physical footprint|Physical footprint \(peak\)|MALLOC_(MEDIUM|SMALL|NANO|TINY|LARGE) " \
    | grep -v "(empty)" \
    | sed 's/^/  /'
  echo "  (MALLOC_* RESIDENT ~= the JS/native heap actually in RAM; the rest of RSS is shared libs)"
else
  echo "  vmmap unavailable; RSS only:"
  ps -o rss= -p "$PID" | awk '{printf "  RSS: %d MB\n",$1/1024}'
fi
echo

# --- CPU + RSS sampling (interval-accurate via top) -------------------------
echo "---- CPU / RSS sampling ($SAMPLES x ${INTERVAL}s, top) ----"
echo "    sample   CPU%        RSS"
top -l "$((SAMPLES + 1))" -i "$INTERVAL" -stats pid,cpu,mem,th -pid "$PID" 2>/dev/null \
  | awk -v srv="$PID" '
      $1==srv {
        n++; if (n>1) { printf "    %4d   %7s   %10s\n", n-1, $2, $3; csum+=$2; if ($2+0>cmax) cmax=$2; c++ } last=$3
      }
      END {
        if (c>0) { printf "\n  CPU avg: %.1f%%   CPU peak: %.1f%%\n", csum/c, cmax; printf "  RSS now: %s\n", last }
      }'
echo

# --- PTY-host children (the terminals this server manages) ------------------
echo "---- PTY-host child processes ----"
KIDS="$(pgrep -P "$PID" 2>/dev/null || true)"
if [[ -z "$KIDS" ]]; then
  echo "  (none)"
else
  printf "  %-7s %-7s %8s  %s\n" PID CPU% RSS_MB CMD
  total=0
  for p in $KIDS; do
    line="$(ps -o pid=,%cpu=,rss=,comm= -p "$p" 2>/dev/null || true)"
    [[ -z "$line" ]] && continue
    echo "$line" | awk '{rss=$3/1024; c=""; for(i=4;i<=NF;i++)c=c" "$i; printf "  %-7s %-7s %8d %s\n",$1,$2,rss,c}'
    r="$(ps -o rss= -p "$p" 2>/dev/null | tr -d ' ' || echo 0)"
    total=$((total + ${r:-0}))
  done
  echo "  ---"
  printf "  %d children, %d MB total RSS\n" "$(echo "$KIDS" | wc -w | tr -d ' ')" "$((total/1024))"
fi
echo

# --- Backing data store (file-based persistence) ----------------------------
echo "---- Data store ($DATA_DIR) ----"
if [[ -d "$DATA_DIR" ]]; then
  echo "  Total: $(du -sh "$DATA_DIR" 2>/dev/null | cut -f1)"
  du -sh "$DATA_DIR"/* 2>/dev/null | sort -rh | head -6 | sed 's/^/  /'
  echo "  sessions: $(ls "$DATA_DIR/sessions" 2>/dev/null | wc -l | tr -d ' ') files (lazy-loaded; only active sessions + a 7-day index are held in RAM)"
else
  echo "  not found"
fi
hr
