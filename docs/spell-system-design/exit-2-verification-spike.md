# Exit-2 Hook Verification Spike (Phase 0)

Empirical verification that the Claude Code build maestro spawns honors hook **exit code 2** for `PreToolUse` (gating) and `Stop` (forced continuation). Maestro has never used exit-2 hooks (all current plugin hooks exit 0), so this is an unverified external dependency that gates the spell-system's `gate` and `continue-loop` actions.

## Environment

| | Value |
|---|---|
| Claude Code version | **2.1.153** (`/opt/homebrew/bin/claude`) |
| Model | `claude-haiku-4-5` (representative of the bundled model surface; exit-2 behavior is independent of model choice — it is enforced by the Claude Code runtime, not the model) |
| Platform | Darwin 23.4.0 (macOS), zsh |
| Invocation | `claude -p ... --plugin-dir <test-plugin> --dangerously-skip-permissions --output-format stream-json --include-partial-messages --verbose --max-turns 4` |
| Test plugin location | `/tmp/exit2-spike/plugin/` (mirrors `maestro-cli/plugins/maestro-worker/` layout: `hooks/hooks.json` + executable `bin/*.sh`) |
| Maestro source | NOT modified — throwaway external experiment |

The spawn invocation mirrors `maestro-cli/src/services/claude-spawner.ts` (`args.push('--plugin-dir', pluginDir)` + `--dangerously-skip-permissions` for bypass mode). Only differences from a real maestro spawn: `-p` for non-interactive `--print` mode, `--output-format stream-json` for full event capture, and no `--append-system-prompt`. Hooks are loaded the same way Claude loads them in interactive sessions.

## Test setup

### `/tmp/exit2-spike/plugin/hooks/hooks.json`

```json
{
  "description": "Exit-2 verification spike",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/pretool-block.sh", "timeout": 5 }]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "${CLAUDE_PLUGIN_ROOT}/bin/stop-continue.sh", "timeout": 5 }]
      }
    ]
  }
}
```

### `bin/pretool-block.sh` — always blocks
```bash
#!/usr/bin/env bash
echo "SPIKE_BLOCK_REASON: blocked by exit-2 spike hook" >&2
echo "{}"
exit 2
```

### `bin/stop-continue.sh` — forces one continuation, then allows stop
```bash
#!/usr/bin/env bash
MARKER="/tmp/exit2-spike/stop-fired"
if [ -f "$MARKER" ]; then exit 0; fi
touch "$MARKER"
echo "SPIKE_STOP_REASON: forced to continue by exit-2 spike hook; please write the word DONE_AFTER_CONTINUE in plain text and then stop" >&2
exit 2
```

### Prompt
```
Use the Bash tool to run 'ls /tmp'. After that, write a one-sentence summary.
```

## Raw observations (extracted from the stream-json output)

### Run lifecycle (3 turns)

1. **Turn 1 — model emits a Bash tool_use:**
   ```json
   {"type":"tool_use","name":"Bash","input":{"command":"ls /tmp","description":"List contents of /tmp directory"}}
   ```

2. **PreToolUse hook fires and exits 2.** The runtime injects an `is_error: true` tool_result back into the conversation:
   ```json
   {"type":"tool_result",
    "content":"PreToolUse:Bash hook error: [${CLAUDE_PLUGIN_ROOT}/bin/pretool-block.sh]: SPIKE_BLOCK_REASON: blocked by exit-2 spike hook\n",
    "is_error":true,
    "tool_use_id":"toolu_01MudtMRhed5cTztQHR7qB9t"}
   ```
   It is also surfaced as a permission denial in the result envelope:
   ```json
   "permission_denials":[{"tool_name":"Bash","tool_use_id":"toolu_01Mu...","tool_input":{"command":"ls /tmp",...}}]
   ```

3. **Turn 2 — model reads the stderr reason and adapts:**
   ```
   "The Bash tool is blocked by an exit-2 spike hook in your environment, so I cannot run the command or provide a listing of /tmp."
   ```
   The model never received the actual `ls` output (Bash was never executed). It then emits `stop_reason: end_turn`.

4. **Stop hook fires and exits 2.** The runtime injects a synthetic user message and re-runs the model:
   ```json
   {"role":"user",
    "content":[{"type":"text",
      "text":"Stop hook feedback:\n[${CLAUDE_PLUGIN_ROOT}/bin/stop-continue.sh]: SPIKE_STOP_REASON: forced to continue by exit-2 spike hook; please write the word DONE_AFTER_CONTINUE in plain text and then stop\n"}],
    "isSynthetic":true}
   ```
   A UI-tray notification also fires: `{"subtype":"notification","key":"stop-hook-error","text":"Stop hook error occurred · ctrl+o to see"}`. This is cosmetic — the model is still re-invoked and the message is still fed to it.

5. **Turn 3 — model continues after the forced stop.** Thinking block shows it read and obeyed the stderr instruction:
   > "The user is showing me a 'stop hook feedback' message that says I've been forced to continue by an exit-2 spike hook, and I'm instructed to write the word 'DONE_AFTER_CONTINUE'..."

   Final assistant text: `"DONE_AFTER_CONTINUE"`.

6. **Second Stop call.** Marker file exists, hook exits 0, session ends cleanly. Result envelope confirms:
   ```json
   {"type":"result","subtype":"success","result":"DONE_AFTER_CONTINUE","num_turns":3,"stop_reason":"end_turn"}
   ```

## Verdicts

### (a) PreToolUse exit 2 — **PASS**
- The tool call (`Bash` with `ls /tmp`) was **blocked** before execution.
- The hook's **stderr message was fed back to the model** as an `is_error: true` tool_result, including the literal `SPIKE_BLOCK_REASON:` text we wrote.
- The model adapted in the next turn (acknowledged the block, declined to retry).
- The runtime also surfaced it via the structured `permission_denials[]` field in the result envelope, which is useful for programmatic detection from maestro.

### (b) Stop exit 2 — **PASS**
- After the model's first `end_turn`, the Stop hook's exit 2 **forced a continuation turn** (turn 3 in `num_turns: 3`).
- The hook's **stderr was injected as a synthetic user message** (visible `"isSynthetic": true` flag) and the model received and acted on it.
- On the second Stop invocation (marker exists, hook exits 0), the session **terminated normally** — confirming that the loop is controlled entirely by the hook's exit code, not by some internal "always continue" override.
- Caveat: the Claude UI shows a tray notification (`"Stop hook error occurred"`) whenever Stop exits non-zero. This is cosmetic — the actual continuation mechanism works perfectly — but maestro should consider this when designing the user-facing surface for continue-loop spells (we may want to swallow or rebrand that notification in the terminal panel UI).

## Implications for spell-system Phase 3

Both gating and continue-loop actions **can ship as exit-2 hook actions** without falling back to PTY prompts. Recommended action wiring for the dispatcher:

| Spell action | Hook event | Exit pattern |
|---|---|---|
| `gate` | `PreToolUse` (matcher narrowed by spell) | exit 2 + `stderr: reason` (honors `failMode`: on dispatcher error, `failMode=closed` exits 2, `failMode=open` exits 0) |
| `continue-loop` | `Stop` | exit 2 + `stderr: continue-prompt` while `iteration < maxIterations`; exit 0 once cap reached |
| `feed-context` | any | exit 0 + `stdout: context` (stdout is consumed as additional context — already standard, no exit-2 needed) |
| `inject-prompt` | n/a | server emits `session:prompt_send` → UI writes to PTY (existing path) |

### Open implementation notes
- The matcher field in `hooks.json` is static, so the dispatcher (`maestro hook dispatch PreToolUse`) is bound to a broad matcher like `"*"` and does its own per-spell matching against the tool name from the hook's stdin JSON. This matches the design brief's "fixed wiring, dynamic behavior" constraint.
- `failMode` is implemented entirely in the dispatcher's exit code (open → `exit 0`, closed → `exit 2`).
- For continue-loop, iteration count is server-state (per ActiveSpell), so the dispatcher reads it and exits 2 or 0 accordingly. No risk of infinite loops as long as `maxIterations` is enforced server-side.
- Stop-hook tray notification is purely cosmetic; consider filtering `system.notification` events with `key === 'stop-hook-error'` in the WS bridge when a continue-loop spell is active on that session, so the user doesn't see a misleading "error" badge.

### No fallback needed
The PTY-prompt fallback recommended in the design brief (gate→PTY-prompt, continue-loop→PTY re-inject) is **not required**. Both gate and continue-loop will ship as native exit-2 actions in Phase 3.
