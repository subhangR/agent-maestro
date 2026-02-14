#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL_DEFAULT="https://github.com/subhangR/agent-maestro.git"
INSTALL_DIR_DEFAULT="${HOME}/.maestro/agent-maestro"
INSTALL_VERSION="2026.02.14"
REPO_URL="${MAESTRO_REPO_URL:-$REPO_URL_DEFAULT}"
INSTALL_DIR="${MAESTRO_INSTALL_DIR:-$INSTALL_DIR_DEFAULT}"

NO_COLOR=0
if [ -n "${NO_COLOR:-}" ]; then
  NO_COLOR=1
fi

if [ -t 1 ] && [ "$NO_COLOR" -eq 0 ]; then
  C_INFO="\033[1;34m"
  C_OK="\033[1;32m"
  C_WARN="\033[1;33m"
  C_ERR="\033[1;31m"
  C_RESET="\033[0m"
else
  C_INFO=""
  C_OK=""
  C_WARN=""
  C_ERR=""
  C_RESET=""
fi

info() { printf "%b[i]%b %s\n" "$C_INFO" "$C_RESET" "$*"; }
ok() { printf "%b[ok]%b %s\n" "$C_OK" "$C_RESET" "$*"; }
warn() { printf "%b[warn]%b %s\n" "$C_WARN" "$C_RESET" "$*"; }
err() { printf "%b[error]%b %s\n" "$C_ERR" "$C_RESET" "$*" >&2; }

if [ $# -gt 0 ]; then
  warn "install.sh does not accept flags. Ignoring arguments: $*"
fi

OS_RAW="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$OS_RAW" in
  linux*)
    PLATFORM="linux"
    ;;
  darwin*)
    PLATFORM="macos"
    ;;
  msys*|mingw*|cygwin*)
    PLATFORM="windows-git-bash"
    ;;
  *)
    PLATFORM="unknown"
    ;;
esac

run_logged() {
  local label="$1"
  local log_file="$2"
  shift 2

  info "$label"
  if "$@" >"$log_file" 2>&1; then
    ok "$label"
    return 0
  fi

  err "$label failed (log: $log_file)"
  tail -n 25 "$log_file" >&2 || true
  return 1
}

is_maestro_repo() {
  local dir="$1"
  [ -f "$dir/package.json" ] || return 1
  grep -Eq '"name"[[:space:]]*:[[:space:]]*"maestro-monorepo"' "$dir/package.json"
}

SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
fi

PROJECT_DIR=""
if is_maestro_repo "$PWD"; then
  PROJECT_DIR="$PWD"
elif [ -n "$SCRIPT_DIR" ] && is_maestro_repo "$SCRIPT_DIR"; then
  PROJECT_DIR="$SCRIPT_DIR"
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
LOG_BASE="${XDG_STATE_HOME:-$HOME/.local/state}/maestro/install"
mkdir -p "$LOG_BASE"
LOG_DIR="$LOG_BASE/$timestamp"
mkdir -p "$LOG_DIR"

info "Maestro installer $INSTALL_VERSION"
info "Platform: $PLATFORM"
info "Logs: $LOG_DIR"

if [ -z "$PROJECT_DIR" ]; then
  if ! command -v git >/dev/null 2>&1; then
    err "git is required for bootstrap install."
    exit 1
  fi

  mkdir -p "$(dirname "$INSTALL_DIR")"
  if [ -d "$INSTALL_DIR/.git" ]; then
    PROJECT_DIR="$INSTALL_DIR"
    warn "Using existing repository at $PROJECT_DIR (no auto-pull performed)."
  elif [ -d "$INSTALL_DIR" ]; then
    err "Install directory exists but is not a git repository: $INSTALL_DIR"
    exit 1
  else
    if ! run_logged "Cloning Maestro repository" "$LOG_DIR/git-clone.log" git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"; then
      exit 1
    fi
    PROJECT_DIR="$INSTALL_DIR"
  fi
fi

cd "$PROJECT_DIR"

install_bun() {
  if command -v bun >/dev/null 2>&1; then
    return 0
  fi

  warn "Bun not found. Installing Bun."
  case "$PLATFORM" in
    macos|linux)
      if command -v curl >/dev/null 2>&1; then
        run_logged "Installing Bun" "$LOG_DIR/bun-install.log" bash -lc "curl -fsSL https://bun.sh/install | bash"
        return $?
      fi
      if command -v wget >/dev/null 2>&1; then
        run_logged "Installing Bun" "$LOG_DIR/bun-install.log" bash -lc "wget -qO- https://bun.sh/install | bash"
        return $?
      fi
      err "curl or wget is required to install Bun."
      return 1
      ;;
    windows-git-bash)
      if command -v powershell.exe >/dev/null 2>&1; then
        run_logged "Installing Bun" "$LOG_DIR/bun-install.log" powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "iwr https://bun.sh/install.ps1 -UseBasicParsing | iex"
        return $?
      fi
      err "powershell.exe is required to install Bun from Git Bash."
      return 1
      ;;
    *)
      err "Unsupported platform for Bun auto-install: $OS_RAW"
      return 1
      ;;
  esac
}

install_bun || exit 1

BUN_INSTALL_DIR="${BUN_INSTALL:-$HOME/.bun}"
if [ -d "$BUN_INSTALL_DIR/bin" ]; then
  export PATH="$BUN_INSTALL_DIR/bin:$PATH"
fi

if ! command -v bun >/dev/null 2>&1; then
  err "Bun is not in PATH after install. Open a new shell and rerun install.sh."
  exit 1
fi

ok "Using Bun $(bun --version)"

if ! run_logged "Installing workspace dependencies (Bun)" "$LOG_DIR/bun-workspace-install.log" bun install --frozen-lockfile --no-progress --no-summary; then
  warn "Frozen lockfile install failed. Retrying without --frozen-lockfile."
  if ! run_logged "Installing workspace dependencies (fallback)" "$LOG_DIR/bun-workspace-install-fallback.log" bun install --no-progress --no-summary; then
    exit 1
  fi
fi

info "Building server and CLI in parallel"
(
  cd "$PROJECT_DIR/maestro-server"
  bun run build
) >"$LOG_DIR/build-server.log" 2>&1 &
PID_SERVER=$!

(
  cd "$PROJECT_DIR/maestro-cli"
  bun run build
) >"$LOG_DIR/build-cli.log" 2>&1 &
PID_CLI=$!

BUILD_FAILED=0
if wait "$PID_SERVER"; then
  ok "Built maestro-server"
else
  err "maestro-server build failed (log: $LOG_DIR/build-server.log)"
  BUILD_FAILED=1
fi

if wait "$PID_CLI"; then
  ok "Built maestro-cli"
else
  err "maestro-cli build failed (log: $LOG_DIR/build-cli.log)"
  BUILD_FAILED=1
fi

if [ "$BUILD_FAILED" -ne 0 ]; then
  exit 1
fi

if ! run_logged "Linking Maestro CLI globally" "$LOG_DIR/cli-link.log" bash -lc "cd \"$PROJECT_DIR/maestro-cli\" && bun link"; then
  warn "Maestro CLI global link failed. Retry manually: cd \"$PROJECT_DIR/maestro-cli\" && bun link"
fi

if ! run_logged "Installing OpenAI Codex globally" "$LOG_DIR/codex-install.log" bun install -g @openai/codex; then
  warn "Codex install failed. Retry manually: bun install -g @openai/codex"
fi

install_claude() {
  case "$PLATFORM" in
    macos)
      if command -v brew >/dev/null 2>&1; then
        run_logged "Installing Claude Code via Homebrew" "$LOG_DIR/claude-install.log" brew install --cask claude-code
        return $?
      fi
      if command -v curl >/dev/null 2>&1; then
        run_logged "Installing Claude Code via official installer" "$LOG_DIR/claude-install.log" bash -lc "curl -fsSL https://claude.ai/install.sh | bash"
        return $?
      fi
      return 1
      ;;
    linux)
      if command -v curl >/dev/null 2>&1; then
        run_logged "Installing Claude Code via official installer" "$LOG_DIR/claude-install.log" bash -lc "curl -fsSL https://claude.ai/install.sh | bash"
        return $?
      fi
      return 1
      ;;
    windows-git-bash)
      if command -v curl >/dev/null 2>&1; then
        run_logged "Installing Claude Code via official installer" "$LOG_DIR/claude-install.log" bash -lc "curl -fsSL https://claude.ai/install.sh | bash"
        return $?
      fi
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

if ! install_claude; then
  warn "Claude Code install failed. Retry manually:"
  warn "  brew install --cask claude-code"
  warn "  curl -fsSL https://claude.ai/install.sh | bash"
fi

SERVER_LOG="$LOG_DIR/server.log"
(
  cd "$PROJECT_DIR"
  PORT="${MAESTRO_PORT:-3001}" \
  DATA_DIR="${DATA_DIR:-$HOME/.maestro/data}" \
  SESSION_DIR="${SESSION_DIR:-$HOME/.maestro/sessions}" \
  NODE_ENV="${NODE_ENV:-development}" \
  bun run dev:server
) >"$SERVER_LOG" 2>&1 &
SERVER_PID=$!
disown "$SERVER_PID" 2>/dev/null || true
ok "Maestro server started in background (pid: $SERVER_PID)"
info "Server log: $SERVER_LOG"

ok "Install complete."
info "Project directory: $PROJECT_DIR"
info "Next: bun run dev:all (from $PROJECT_DIR) when you want the desktop UI."
