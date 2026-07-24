# Collab V2 end-to-end completion

**Status:** implementation handoff

The modular Collab UI and its typed `/api/collab/v2` client are implemented. This
document records the backend work and final integration needed for a production
end-to-end flow.

## Already complete

- Entity component system for every V2 kind: chip, card, panel, and full view.
- Graph canvas, placement grammar, channel hub, command palette states, and V2 space launcher.
- Firebase-token forwarding client and adapters for supported façade endpoints.
- Task create/update, task axes, messages, reactions, and points action hooks with
  pending/error/reconciliation handling.
- Explicit V2 UUID selection. Legacy Firestore Space IDs are not treated as V2 IDs.

## Required backend / façade completion

1. Finish normalized `EntityDetail` projections: actor summaries, hierarchy path,
   connection groups, channel shelf and auto-tab queries, thread paging, activity,
   and capabilities.
2. Add façade endpoints for edges, placements, move/reparent, task completion,
   pull/work state, graph query, search, inbox/read marks, saved views, docs/files,
   tracking, and realtime event mapping.
3. Make all list pagination cursor-based at the public façade. The current activity
   endpoint still has offset semantics.
4. Publish a stable V2 space mapping/discovery flow for existing users, including
   any legacy Firebase-to-Supabase migration relationship.
5. Expose normalized command errors: validation, permission, missing/tombstoned,
   version conflict, and reconciliation patches.

## Required UI integration completion

1. Connect the live launcher to the normal Collab entry flow after V2-space discovery
   is available, then retire the fixture-only Workspace fallback.
2. Bind supported action hooks to task creation/editing, message composer, reactions,
   points, and task-axis settings UI.
3. Bind graph, channel auto-tabs, full-view promotion, and placement callbacks to the
   new façade commands as each becomes available; keep unavailable actions disabled
   with explicit capability copy.
4. Subscribe to `WorkspaceEvent` / presence once the backend stream is available,
   deduplicate by event and reconcile optimistic mutations by client mutation ID.

## End-to-end acceptance checklist

- A signed-in Firebase user can choose a V2 space, load a collection, open a detail,
  create/update a task, post a message, react, and award points.
- The same user can link/place/reparent an entity with a visible intent preview and
  one-step undo.
- Channel shelf and auto-tabs are server projections, never derived from raw edge rows
  in the browser.
- A graph update, message, counter update, and presence update render live without a
  full reload.
- Version conflicts and permission failures produce actionable UI with no corrupted
  optimistic state.
