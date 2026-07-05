# Spell CLI — Headless E2E Acceptance

This document is the human-readable acceptance path for the headless `maestro spell`
CLI surface (multi-rule spells, Mechanism A + one-shot casts, Mechanism B). It pairs
with the runnable script **`docs/spell-cli-e2e.sh`**, which automates and asserts the
whole path against a live staging server and exits non-zero on any failure.

> Contract of record: `docs/spell-ui-redesign/CONTRACT-ADDENDUM.md` ("CLI REST usage")
> and `04-backend-contract.md`. The CLI drives only the existing REST surface plus the
> two locked additions (reset-loop endpoint, WS forwarding of firing/reset events).

---

## The CLI surface

Multi-rule spells (Mechanism A):

| Command | REST call | Purpose |
|---|---|---|
| `maestro spell library` | `GET /api/spells` | Table of real spells: id, name, color, #rules, seed/custom |
| `maestro spell show <id>` | `GET /api/spells/:id` | One spell with rules expanded |
| `maestro spell create [--file <json>] [--name --description --color --icon --rule <json>…]` | `POST /api/spells` | Author a multi-rule spell from a `CreateSpellPayload` file and/or flags |
| `maestro spell edit <id> [--file <json>] [--name --description --color --icon --rule <json>…]` | `PUT /api/spells/:id` | Update (seeds rejected server-side) |
| `maestro spell remove <id>` (alias `delete`) | `DELETE /api/spells/:id` | Delete (seeds rejected server-side) |
| `maestro spell activate <id> --targets <a,b> [--invoker <id>]` | `POST /api/spells/:id/activate` | Cast onto sessions |
| `maestro spell deactivate <id> --targets <a,b>` | `POST /api/spells/:id/deactivate` | Un-cast |
| `maestro spell active [--session <id>]` | `GET /api/sessions/:id` → `.activeSpells` | List a session's active spells + loop iterations |
| `maestro spell reset-loop <id> --session <id> [--rule <ruleId>]` | `POST /api/spells/:id/reset-loop` | Zero loop counter(s) |

One-shot casts (Mechanism B) — unchanged, still present:

| Command | REST call | Purpose |
|---|---|---|
| `maestro spell invoke <entityId> [spellName] --type <t> --target <sess> [--project-id <p>] [--args <json>]` | `POST /api/spells/invoke` | Fire a one-shot cast at a session |
| `maestro spell entities [--type <t>]` | `GET /api/spells/entities/:type` | Entities you can cast from |
| `maestro spell list [entityId] [--type <t>]` | `GET /api/spells/definitions` | Cast templates (definitions) |
| `maestro spell prompt-create <name> --content <text> [--description <text>]` | `POST /api/spells/custom-prompts` | Author a custom prompt |
| `maestro spell prompt-delete <id>` | `DELETE /api/spells/custom-prompts/:id` | Delete a custom prompt |

**Naming note (breaking):** `spell create` is now the **multi-rule** authoring path.
The former `spell create <name> --content …` (custom prompt) moved to
`spell prompt-create`, and the former `spell delete` (custom prompt) is now
`spell prompt-delete`. `spell remove`/`spell delete <id>` now delete a **multi-rule**
spell. Every command supports the global `--json` flag.

Command-permission keys are registered in
`maestro-cli/src/prompting/command-catalog.ts` (`spell:library`, `spell:show`,
`spell:create`, `spell:edit`, `spell:remove`, `spell:activate`, `spell:deactivate`,
`spell:active`, `spell:reset-loop`, `spell:prompt-create`, `spell:prompt-delete`), so
`guardCommand` never blocks them.

---

## Authoring a spell from a file

`spell create --file <path>` takes a `CreateSpellPayload`:

```json
{
  "name": "Lint on edit",
  "description": "Run the linter after every edit and feed results back",
  "color": "emerald",
  "rules": [
    {
      "label": "lint-on-edit-feed",
      "enabled": true,
      "trigger": { "type": "hook", "hookEvent": "PostToolUse", "matcher": "Edit|Write" },
      "action": { "type": "run-command", "command": "sh", "args": ["-c", "sleep 5; echo done"], "cwd": "/tmp", "feedOutput": true }
    },
    {
      "label": "notify-on-stop",
      "enabled": true,
      "trigger": { "type": "hook", "hookEvent": "Stop" },
      "action": { "type": "notify-channel", "message": "Session stopped" }
    }
  ]
}
```

Flags override / extend the file: `--name`, `--description`, `--color`, `--icon`, and
repeatable `--rule '<json>'` (each appends a rule). `--color` defaults to `violet`.
Valid colors: `amber rose violet sky emerald fuchsia lime cyan indigo`.

`action.type` must be legal for the `hookEvent` (server enforces the `ACTIONS_BY_EVENT`
matrix); e.g. `continue-loop` is only valid on `Stop`/`SubagentStop`.

---

## How firing works (what the E2E asserts)

Hooks are fired with `maestro hook dispatch <EVENT>` (the same command the plugins bind
in `hooks.json`). Each plugin (`maestro-worker`, `maestro-orchestrator`) dispatches all
**8** events: `SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Notification,
Stop, SubagentStop, SessionEnd`, and `maestro-cli/src/commands/hook.ts` accepts all 8.

When a hook fires, the server matches the session's active spells' rules and runs each
action. Two firing signals are observable headlessly:

- **`spell:rule_fired`** (WebSocket) — `{sessionId, spellId, ruleId, event, action, outcome}`.
  One per rule that fired; `outcome:"ok"` means the action ran.
- **`session:prompt_send`** (WebSocket) — how `inject-prompt` output and, crucially, the
  **async `run-command` `feedOutput`** reach the terminal. `run-command` is
  fire-and-forget: a `sleep 5` command does **not** block the ~4s hook budget; when it
  finishes, its stdout is delivered as a prompt tagged `[<spell> · <rule>] command output: …`.
  This is the **F1** case. It is *not* persisted over REST — the only headless way to
  observe it is on the socket, which `docs/spell-cli-e2e-listen.mjs` captures.

---

## Running the E2E

Prereqs: a live staging server on `:4569`, `bash`, `curl`, `node`. `ws` is resolved from
the workspace root `node_modules`. `jq` is optional — a bundled node JSON extractor
(`docs/spell-cli-e2e-json.mjs`) stands in when `jq` is absent, so assertions are
machine-checkable either way.

Start staging (server only) if it isn't already up:

```bash
cd maestro-server && bun run build          # tsc → dist (server only; never build:ui)
cd ..
PORT=4569 DATA_DIR=~/.maestro-staging/data SESSION_DIR=~/.maestro-staging/sessions \
  NODE_ENV=development node maestro-server/dist/server.js &
```

Run it:

```bash
./docs/spell-cli-e2e.sh
```

Config (all optional, via env):

| Env | Default | Meaning |
|---|---|---|
| `MAESTRO_BASE` | `http://localhost:4569` | Server base URL (no `/api`) |
| `MAESTRO_PROJECT_ID` | first project with a task | Project to use (falls back to global task list if it has no tasks) |
| `MAESTRO_CLI` | `bun <repo>/maestro-cli/src/index.ts` | CLI command (set to `maestro` to test an installed binary) |
| `KEEP_ARTIFACTS` | `0` | `1` keeps the spell/session the run creates |

By default the script runs the CLI **from source** (`bun maestro-cli/src/index.ts`) so it
exercises the current worktree without a build step.

### What the script does (15 steps)

0. Preflight `GET /api/spells` → 200.
1. Resolve a live `(project, task)` pair.
2. Create a throwaway target **session** (`POST /api/sessions`).
3. **Create** the multi-rule spell (F1 `run-command`+`feedOutput` on `PostToolUse /Edit|Write/`, plus `Stop`→`notify-channel`).
4. **Show** it — asserts both actions present.
5. **Edit** it — asserts color change persisted.
6. **Activate** on the session; assert success.
7. **Assert active** via `GET /api/sessions/:id .activeSpells`.
8. Start the WS capture; **fire** `PostToolUse` (Edit payload) and `Stop` from the CLI.
9. Wait >4s for the async `run-command` to finish.
10. **Assert firings** from the capture: ≥2 `spell:rule_fired` with `outcome=ok`, actions
    `run-command`+`notify-channel`, events `PostToolUse`+`Stop`, **and** the F1
    `feedOutput` delivered via `session:prompt_send`.
11. **One-shot cast** (`prompt-create` → `invoke`); assert it sent.
12. **List active** still shows it.
13. **reset-loop** exercised (this fixture has no loop rule, so a no-op counts as SKIP,
    otherwise PASS).
14. **Deactivate**; assert the session is clean.

The run cleans up the spell, custom prompt, and session it created (unless
`KEEP_ARTIFACTS=1`).

### What PASS looks like

The final two lines are:

```
=== Summary: 27 passed, 0 failed ===
E2E RESULT: PASS
```

and the process exits `0`. The key F1 assertion prints its evidence, e.g.:

```
    RULE_FIRED_TOTAL=2
    RULE_FIRED_OK=2
    RULE_FIRED_ACTIONS=notify-channel,run-command
    RULE_FIRED_EVENTS=PostToolUse,Stop
    PROMPT_SEND_TOTAL=1
    FEEDOUTPUT_FOUND=yes
    FEEDOUTPUT_SAMPLE=[E2E Spell … · lint-on-edit-feed] command output: MAESTRO_FEEDOUT_…
  PASS F1: >4s run-command feedOutput delivered via session:prompt_send (=yes)
```

Any assertion failure prints `FAIL …`, ends with `E2E RESULT: FAIL`, keeps the WS
capture file for inspection, and exits `1`.

## Helper files

- `docs/spell-cli-e2e.sh` — the runnable acceptance script.
- `docs/spell-cli-e2e-listen.mjs` — WS listener; records every event to a JSONL capture.
- `docs/spell-cli-e2e-scan.mjs` — scans the capture and emits the KEY=VALUE assertions.
- `docs/spell-cli-e2e-json.mjs` — tiny `jq` stand-in (stdin JSON → JS expression).
