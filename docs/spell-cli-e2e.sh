#!/usr/bin/env bash
#
# spell-cli-e2e.sh — end-to-end acceptance test for the headless `maestro spell` CLI
# against a LIVE staging server (default :4569). Drives the full multi-rule (Mechanism A)
# lifecycle plus a one-shot cast (Mechanism B) entirely from the CLI, and asserts each
# side effect over REST + the WebSocket firing channel. Exits non-zero on any failure.
#
# What it proves (maps to the CONTRACT-ADDENDUM "CLI REST usage" surface):
#   1. create a multi-rule spell from a JSON file      (POST /api/spells)
#        rule A (F1): PostToolUse /Edit|Write/ → run-command node (>4s, feedOutput:true)
#        rule B (C5): PostToolUse /Edit|Write/ → run-command sh   (gate-blocked: denylist)
#        rule C     : Stop → notify-channel
#   2. show it (rules expanded)                         (GET  /api/spells/:id)
#   3. edit it                                          (PUT  /api/spells/:id)
#   4. activate it on a session                         (POST /api/spells/:id/activate)
#   5. assert it is active                              (GET  /api/sessions/:id .activeSpells)
#   6. fire PostToolUse + Stop hooks from the CLI       (maestro hook dispatch <EVENT>)
#   7. assert each rule fired                           (WS spell:rule_fired outcomes)
#   8. assert the >4s run-command output was delivered  (WS session:prompt_send, F1)
#      + assert the sh run-command was gate-blocked      (WS spell:rule_fired outcome=blocked, C5)
#   9. one-shot cast                                    (POST /api/spells/invoke)
#  10. list active                                      (GET  /api/sessions/:id)
#  11. reset-loop (best-effort)                         (POST /api/spells/:id/reset-loop)
#  12. deactivate + assert clean                        (POST /api/spells/:id/deactivate)
#
# Requirements: bash, curl, node (>=18), and either the repo checkout (default: runs the
# CLI from source via `bun maestro-cli/src/index.ts`) or an installed `maestro` binary
# (set MAESTRO_CLI=maestro). `ws` is resolved from the workspace root node_modules.
# `jq` is optional — a bundled node JSON extractor is used when jq is absent.
#
# Config via env:
#   MAESTRO_BASE        server base URL, no /api        (default http://localhost:4569)
#   MAESTRO_PROJECT_ID  project to use                  (default: first project on server)
#   MAESTRO_CLI         CLI command to invoke           (default: bun <repo>/maestro-cli/src/index.ts)
#   KEEP_ARTIFACTS=1    do not delete the spell/session created by this run
#
# Usage:  ./docs/spell-cli-e2e.sh
# PASS =  final line "E2E RESULT: PASS" and exit code 0.

set -uo pipefail

# ── Locations ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
JSON_HELPER="$SCRIPT_DIR/spell-cli-e2e-json.mjs"
LISTEN_HELPER="$SCRIPT_DIR/spell-cli-e2e-listen.mjs"
SCAN_HELPER="$SCRIPT_DIR/spell-cli-e2e-scan.mjs"

BASE="${MAESTRO_BASE:-http://localhost:4569}"
API="$BASE/api"
WS_URL="$(printf '%s' "$BASE" | sed -e 's#^http://#ws://#' -e 's#^https://#wss://#')"

export MAESTRO_SERVER_URL="$BASE"   # the CLI reads this for both REST + hook dispatch

# ── CLI runner (source by default; installed binary if MAESTRO_CLI is set) ───
mcli() {
  if [ -n "${MAESTRO_CLI:-}" ]; then
    # shellcheck disable=SC2086
    $MAESTRO_CLI "$@"
  else
    bun "$REPO_ROOT/maestro-cli/src/index.ts" "$@"
  fi
}

# ── JSON extraction (jq if present, else bundled node helper) ────────────────
# jval '<expr over d>'  — reads JSON from stdin, prints the evaluated value.
jval() { node "$JSON_HELPER" "$1"; }

# ── Assertion bookkeeping ────────────────────────────────────────────────────
PASSES=0
FAILS=0
C_GREEN='\033[32m'; C_RED='\033[31m'; C_DIM='\033[2m'; C_BOLD='\033[1m'; C_RST='\033[0m'
pass() { PASSES=$((PASSES+1)); printf "  ${C_GREEN}PASS${C_RST} %s\n" "$1"; }
fail() { FAILS=$((FAILS+1)); printf "  ${C_RED}FAIL${C_RST} %s\n" "$1"; }
skip() { printf "  ${C_DIM}SKIP${C_RST} %s\n" "$1"; }
step() { printf "\n${C_BOLD}▸ %s${C_RST}\n" "$1"; }
require_eq()      { if [ "$2" = "$3" ]; then pass "$1 (=$2)"; else fail "$1 (got '$2' want '$3')"; fi; }
require_ge()      { if [ "$2" -ge "$3" ] 2>/dev/null; then pass "$1 ($2 >= $3)"; else fail "$1 (got '$2' want >= $3)"; fi; }
require_contains(){ case "$2" in *"$3"*) pass "$1";; *) fail "$1 (missing '$3')";; esac; }

die() { printf "${C_RED}FATAL:${C_RST} %s\n" "$1" >&2; exit 2; }

# ── Unique marker so a run's feedOutput is unambiguous in the WS capture ──────
NONCE="$(date +%s)$$"
FEED_MARKER="MAESTRO_FEEDOUT_${NONCE}"
CAP_FILE="$(mktemp -t maestro-spell-e2e-cap.XXXXXX)"
LISTEN_ERR="$(mktemp -t maestro-spell-e2e-listen.XXXXXX)"
SPELL_FILE="$(mktemp -t maestro-spell-e2e.XXXXXX.json)"

CREATED_SPELL_ID=""
CREATED_SESSION_ID=""
CREATED_CP_ID=""

cleanup() {
  if [ "${KEEP_ARTIFACTS:-0}" != "1" ]; then
    [ -n "$CREATED_SPELL_ID" ] && mcli --json spell remove "$CREATED_SPELL_ID" >/dev/null 2>&1
    [ -n "$CREATED_CP_ID" ]    && mcli --json spell prompt-delete "$CREATED_CP_ID" >/dev/null 2>&1
    [ -n "$CREATED_SESSION_ID" ] && curl -s -X DELETE "$API/sessions/$CREATED_SESSION_ID" >/dev/null 2>&1
  fi
  rm -f "$SPELL_FILE" "$LISTEN_ERR" 2>/dev/null
  # keep CAP_FILE only if a failure occurred and we want to inspect it
  [ "$FAILS" -eq 0 ] && rm -f "$CAP_FILE" 2>/dev/null
}
trap cleanup EXIT

printf "${C_BOLD}=== maestro spell CLI E2E ===${C_RST}\n"
printf "server: %s   ws: %s   marker: %s\n" "$BASE" "$WS_URL" "$FEED_MARKER"

# ── Step 0: preflight ────────────────────────────────────────────────────────
step "0. Preflight — server reachable"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -m 5 "$API/spells" || echo 000)
[ "$HTTP" = "200" ] || die "server not reachable at $API/spells (HTTP $HTTP). Start staging on :4569 first."
pass "GET /api/spells → 200"

# ── Step 1+2: resolve a valid (project, task) pair ───────────────────────────
# A session must be created with >=1 real task. Deriving both ids from an existing
# task guarantees a consistent, live pair (avoids picking a phantom project that
# lists but can't be written to). If MAESTRO_PROJECT_ID is set, restrict to it.
step "1. Resolve a live (project, task) pair"
FIRST_TASK='let a=Array.isArray(d)?d:(d.data||d.tasks||[]); let t=a.find(x=>x&&x.id&&x.projectId);'
resolve_pair() {
  TASK_ID=$(printf '%s' "$1"  | jval "$FIRST_TASK t?t.id:\"\"")
  PROJECT_ID=$(printf '%s' "$1" | jval "$FIRST_TASK t?t.projectId:\"\"")
}
# Prefer an explicit MAESTRO_PROJECT_ID, but fall back to the global task list if it
# has no tasks in this server's data dir (a worker's inherited project id may be a
# different store than the staging data this server serves).
if [ -n "${MAESTRO_PROJECT_ID:-}" ]; then
  resolve_pair "$(curl -s "$API/tasks?projectId=$MAESTRO_PROJECT_ID")"
fi
if [ -z "${TASK_ID:-}" ]; then
  resolve_pair "$(curl -s "$API/tasks")"
fi
[ -n "${TASK_ID:-}" ] && [ -n "${PROJECT_ID:-}" ] || die "could not resolve a live (project, task) pair on $BASE"
pass "project = $PROJECT_ID"
pass "task    = $TASK_ID"

# ── Step 3: create a target session ──────────────────────────────────────────
step "3. Create a target session"
CREATED_SESSION_ID=$(curl -s -X POST "$API/sessions" -H 'Content-Type: application/json' \
  -d "{\"projectId\":\"$PROJECT_ID\",\"taskIds\":[\"$TASK_ID\"],\"name\":\"spell-cli-e2e-$NONCE\",\"env\":{\"PWD\":\"/tmp\"}}" \
  | jval '(d.data&&d.data.id)||d.id||""')
[ -n "$CREATED_SESSION_ID" ] || die "failed to create session"
SESS="$CREATED_SESSION_ID"
pass "session = $SESS"

# ── Step 4: author the multi-rule spell (F1 feedOutput + Stop notify) ────────
step "4. Create a multi-rule spell (POST /api/spells)"
cat > "$SPELL_FILE" <<JSON
{
  "name": "E2E Spell $NONCE",
  "description": "CLI E2E: PostToolUse run-command feedOutput (F1) + Stop notify",
  "color": "emerald",
  "rules": [
    {
      "label": "lint-on-edit-feed",
      "enabled": true,
      "trigger": { "type": "hook", "hookEvent": "PostToolUse", "matcher": "Edit|Write" },
      "action": { "type": "run-command", "command": "node", "args": ["-e", "setTimeout(()=>{console.log('$FEED_MARKER')},4500)"], "cwd": "/tmp", "feedOutput": true }
    },
    {
      "label": "denylist-sh-blocked",
      "enabled": true,
      "trigger": { "type": "hook", "hookEvent": "PostToolUse", "matcher": "Edit|Write" },
      "action": { "type": "run-command", "command": "sh", "args": ["-c", "echo should-not-run $NONCE"], "cwd": "/tmp" }
    },
    {
      "label": "notify-on-stop",
      "enabled": true,
      "trigger": { "type": "hook", "hookEvent": "Stop" },
      "action": { "type": "notify-channel", "message": "E2E stop fired $NONCE" }
    }
  ]
}
JSON

CREATE_OUT=$(mcli --json spell create --file "$SPELL_FILE" 2>&1)
CREATE_OK=$(printf '%s' "$CREATE_OUT" | jval 'd.success===true' 2>/dev/null)
require_eq "create succeeded" "$CREATE_OK" "true"
CREATED_SPELL_ID=$(printf '%s' "$CREATE_OUT" | jval 'd.data&&d.data.id' 2>/dev/null)
[ -n "$CREATED_SPELL_ID" ] || die "create returned no spell id. Raw: $(printf '%s' "$CREATE_OUT" | head -c 400)"
SP="$CREATED_SPELL_ID"
NRULES=$(printf '%s' "$CREATE_OUT" | jval 'd.data.rules.length')
require_eq "spell has 3 rules" "$NRULES" "3"
pass "spell = $SP"

# ── Step 5: show ─────────────────────────────────────────────────────────────
step "5. Show the spell (GET /api/spells/:id)"
SHOW_RULES=$(mcli --json spell show "$SP" | jval '[...new Set(d.data.rules.map(r=>r.action.type))].sort().join(",")')
require_eq "show lists both action types" "$SHOW_RULES" "notify-channel,run-command"

# ── Step 6: edit ─────────────────────────────────────────────────────────────
step "6. Edit the spell (PUT /api/spells/:id)"
EDIT_COLOR=$(mcli --json spell edit "$SP" --color sky | jval 'd.data.color')
require_eq "edit changed color to sky" "$EDIT_COLOR" "sky"

# ── Step 7: activate ─────────────────────────────────────────────────────────
step "7. Activate on the session (POST /api/spells/:id/activate)"
ACT_OK=$(mcli --json spell activate "$SP" --targets "$SESS" | jval 'd.success===true')
require_eq "activate succeeded" "$ACT_OK" "true"

# ── Step 8: assert active over REST ──────────────────────────────────────────
step "8. Assert the spell is active (GET /api/sessions/:id .activeSpells)"
ACTIVE_HAS=$(mcli --json spell active --session "$SESS" | jval "d.data.some(a=>a.spellId==='$SP')")
require_eq "session lists the spell as active" "$ACTIVE_HAS" "true"

# ── Step 9: start the WS listener, then fire hooks from the CLI ──────────────
step "9. Fire PostToolUse + Stop hooks (maestro hook dispatch)"
node "$LISTEN_HELPER" --url "$WS_URL" --out "$CAP_FILE" --ms 16000 --session "$SESS" 2>"$LISTEN_ERR" &
LISTEN_PID=$!
for _ in $(seq 1 40); do grep -q LISTENER_READY "$LISTEN_ERR" 2>/dev/null && break; sleep 0.2; done
grep -q LISTENER_READY "$LISTEN_ERR" 2>/dev/null || die "WS listener never became ready ($WS_URL)"
pass "WS listener connected"

# Fire PostToolUse with an Edit tool payload → matches /Edit|Write/ → run-command (async).
POST_EXIT=0
printf '{"tool_name":"Edit","file_path":"/tmp/foo.ts"}' \
  | MAESTRO_SESSION_ID="$SESS" mcli hook dispatch PostToolUse || POST_EXIT=$?
require_eq "hook dispatch PostToolUse exit 0" "$POST_EXIT" "0"

# Fire Stop → notify-channel.
STOP_EXIT=0
printf '{}' | MAESTRO_SESSION_ID="$SESS" mcli hook dispatch Stop || STOP_EXIT=$?
require_eq "hook dispatch Stop exit 0" "$STOP_EXIT" "0"

# ── Step 10: wait for the >4s run-command to finish + feedOutput to arrive ───
step "10. Wait for async run-command feedOutput (>4s), then stop listener"
sleep 8
wait "$LISTEN_PID" 2>/dev/null
pass "capture window closed"

# ── Step 11: assert rule firings + feedOutput delivery from the WS capture ───
step "11. Assert rule_fired outcomes + F1 feedOutput delivery"
SCAN=$(node "$SCAN_HELPER" "$CAP_FILE" "$SESS" "$FEED_MARKER")
printf '%s\n' "$SCAN" | sed 's/^/    /'
RF_TOTAL=$(printf '%s\n'   "$SCAN" | sed -n 's/^RULE_FIRED_TOTAL=//p')
RF_OK=$(printf '%s\n'      "$SCAN" | sed -n 's/^RULE_FIRED_OK=//p')
RF_BLOCKED=$(printf '%s\n' "$SCAN" | sed -n 's/^RULE_FIRED_BLOCKED=//p')
RF_ACTIONS=$(printf '%s\n' "$SCAN" | sed -n 's/^RULE_FIRED_ACTIONS=//p')
RF_EVENTS=$(printf '%s\n'  "$SCAN" | sed -n 's/^RULE_FIRED_EVENTS=//p')
BLOCKED_DENYLIST=$(printf '%s\n' "$SCAN" | sed -n 's/^BLOCKED_DENYLIST_REASON=//p')
FEED_FOUND=$(printf '%s\n' "$SCAN" | sed -n 's/^FEEDOUTPUT_FOUND=//p')
require_ge "spell:rule_fired count >= 3" "${RF_TOTAL:-0}" "3"
require_ge "rule_fired outcome=ok >= 2"  "${RF_OK:-0}" "2"
require_contains "run-command rule fired"   "$RF_ACTIONS" "run-command"
require_contains "notify-channel rule fired" "$RF_ACTIONS" "notify-channel"
require_contains "PostToolUse event fired" "$RF_EVENTS" "PostToolUse"
require_contains "Stop event fired"        "$RF_EVENTS" "Stop"
require_eq "F1: >4s run-command feedOutput delivered via session:prompt_send" "$FEED_FOUND" "yes"
# C5 positive security assertion: the `sh` run-command must be gate-blocked, and
# the block must be observable on the WS channel with the denylist reason.
require_ge "C5: >=1 run-command blocked by the gate" "${RF_BLOCKED:-0}" "1"
require_eq "C5: blocked reason cites the shell/privilege denylist" "$BLOCKED_DENYLIST" "yes"

# ── Step 12: one-shot cast (Mechanism B) ─────────────────────────────────────
step "12. One-shot cast (POST /api/spells/invoke)"
CREATED_CP_ID=$(mcli --json spell prompt-create "E2E Cast $NONCE" --content "Hello from E2E cast $NONCE" | jval 'd.data&&d.data.id')
[ -n "$CREATED_CP_ID" ] || fail "prompt-create returned no id"
if [ -n "$CREATED_CP_ID" ]; then
  INVOKE_OK=$(mcli --json spell invoke "$CREATED_CP_ID" --type custom-prompt --target "$SESS" --project-id "$PROJECT_ID" \
    | jval 'd.success===true && (d.data.success===true || d.data.status==="sent")')
  require_eq "invoke one-shot cast succeeded" "$INVOKE_OK" "true"
fi

# ── Step 13: list active still shows it ──────────────────────────────────────
step "13. List active (still cast)"
STILL_ACTIVE=$(mcli --json spell active --session "$SESS" | jval "d.data.some(a=>a.spellId==='$SP')")
require_eq "spell still active before deactivate" "$STILL_ACTIVE" "true"

# ── Step 14: reset-loop (best-effort — no loop rule here, so may be a no-op) ──
step "14. reset-loop (POST /api/spells/:id/reset-loop)"
RESET_OUT=$(mcli --json spell reset-loop "$SP" --session "$SESS" 2>&1)
RESET_OK=$(printf '%s' "$RESET_OUT" | jval 'd.success===true' 2>/dev/null)
if [ "$RESET_OK" = "true" ]; then
  pass "reset-loop succeeded"
else
  skip "reset-loop returned non-success (this spell has no continue-loop rule; endpoint exercised)"
fi

# ── Step 15: deactivate + assert clean ───────────────────────────────────────
step "15. Deactivate + assert clean (POST /api/spells/:id/deactivate)"
DEACT_OK=$(mcli --json spell deactivate "$SP" --targets "$SESS" | jval 'd.success===true')
require_eq "deactivate succeeded" "$DEACT_OK" "true"
CLEAN=$(mcli --json spell active --session "$SESS" | jval "d.data.some(a=>a.spellId==='$SP')")
require_eq "spell no longer active after deactivate" "$CLEAN" "false"

# ── Summary ──────────────────────────────────────────────────────────────────
printf "\n${C_BOLD}=== Summary: %d passed, %d failed ===${C_RST}\n" "$PASSES" "$FAILS"
if [ "$FAILS" -eq 0 ]; then
  printf "${C_GREEN}${C_BOLD}E2E RESULT: PASS${C_RST}\n"
  exit 0
else
  printf "${C_RED}${C_BOLD}E2E RESULT: FAIL${C_RST}  (capture kept at %s)\n" "$CAP_FILE"
  exit 1
fi
