#!/usr/bin/env bash
# Recreate the "Maestro Mobile" orchestration on a FRESH maestro host:
# the Atlas coordinator + 10 specialists, the team, and the project — preserving
# the exact IDs the handoff docs reference. (There is no Atlas on a fresh host; this
# creates it.)
#
# Approach: drop the bundled entity JSONs into the maestro data dir, so the server
# indexes them on (re)start. This preserves IDs (CLI `team-member create` would mint
# NEW ids and break the documented references).
#
# Usage:
#   1) STOP the maestro server.
#   2) MAESTRO_DATA_DIR=~/.maestro/data ./bootstrap-team.sh   (default shown)
#   3) Fix the project workingDir to THIS host's repo path (see note below).
#   4) START the maestro server.
#   5) Spawn Atlas as a coordinator session and hand it RESUME_PROMPT.md.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${MAESTRO_DATA_DIR:-$HOME/.maestro/data}"
PROJ="proj_1770533548982_3bgizuthk"

echo "▶ Target maestro data dir: $DATA_DIR"
mkdir -p "$DATA_DIR/projects" "$DATA_DIR/teams/$PROJ" "$DATA_DIR/team-members/$PROJ"

# Project (don't clobber if it already exists on this host)
cp -n "$HERE/maestro-entities/projects/"*.json "$DATA_DIR/projects/" 2>/dev/null || true
# Team + the 11 team-members (Atlas coordinator + 10 specialists)
cp "$HERE/maestro-entities/teams/"*.json          "$DATA_DIR/teams/$PROJ/"
cp "$HERE/maestro-entities/team-members/"*.json   "$DATA_DIR/team-members/$PROJ/"

echo "✔ Installed: project $PROJ, team team_1781679176046_08uixxexz, 11 team-members:"
ls "$HERE/maestro-entities/team-members/" | sed 's/\.json//;s/^/   - /'

cat <<'NOTE'

⚠ IMPORTANT — fix the project workingDir for THIS host:
  The bundled project JSON points workingDir at the original Mac path
  (/Users/subhang/Desktop/Projects/maestro/agent-maestro). Edit
  $DATA_DIR/projects/proj_1770533548982_3bgizuthk.json and set "workingDir" to the
  feat/mobile-app checkout on this host before spawning workers.

NEXT:
  • (re)start the maestro server so it indexes these entities.
  • Verify: `maestro team-member list` shows Atlas (tm_1781678505518_doggxb1sq) + the
    10 specialists; `maestro team get team_1781679176046_08uixxexz` shows the team.
  • Create a continuation task, spawn Atlas (coordinator, tm_1781678505518_doggxb1sq)
    against it, and give that session HANDOFF/RESUME_PROMPT.md as its directive.
NOTE
echo "✔ bootstrap complete."
