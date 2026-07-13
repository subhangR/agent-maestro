# 05 — States & Edge Cases

Design every surface for all of these, not just the happy path.

## Universal state set (design for each surface)
1. **Loading** — first fetch / subscription warming up. Spinner + short label; skeletons for lists.
2. **Empty** — no data yet. Calm card with a title, one-line explanation, and a CTA that moves the user forward.
3. **Populated** — the normal case.
4. **Error** — a call failed. Inline, dismissible, non-blocking banner with a retry path; never a dead end.
5. **Partial / optimistic** — the user's own action shown immediately (pending), reconciled or reverted on server response.
6. **Permission-gated** — the user can see but not act (e.g. can't post, can't delete others' content, can't manage members). Show the affordance disabled with a reason on hover, or hide it — but be consistent.
7. **Offline / disconnected** — realtime dropped. Show a subtle "reconnecting…" indicator; queue the user's sends; don't lose drafts.

## Auth states (govern all of collaboration)
- **Signed out** — collab surfaces show the sign-in view (panel) or a "Sign in to collaborate" prompt (share modal, space window). Never an error; always a one-click path in.
- **Signing in** — buttons disabled, spinner.
- **Auth error** — wrong password / email-in-use / weak password / popup-closed / network → specific, human error copy (see `06`).
- **Signed in, no spaces** — empty directory with a strong create/join CTA.
- **Firebase not configured** — dev-only; low priority.

## Repo-scoping edge cases
- **No git remote** — "No GitHub remote detected" + **set manually**.
- **Non-GitHub remote / SSH URL** — normalize; if unparseable, allow manual entry.
- **Project has no repo** — collab directory is empty; explain that spaces are repo-scoped.
- **Switching projects** — the visible spaces change; make it clear which repo you're viewing.

## Space membership edge cases
- **Opened a space you're not in** (stale link/rail) — "not a member" empty state with a join path (public) or "request access" (`[VISION]`, private).
- **Space deleted while you're in it** — window closes gracefully with a "this space was deleted" message; remove from lists live.
- **Owner leaves** — `[VISION]` ownership transfer or block; design the confirm ("You're the owner — deleting removes it for everyone").
- **Private space, no invite** — not discoverable; the only path is an invite/approval.

## Messaging edge cases
- **Send fails** — pending bubble → "Failed to send" + Retry/Discard.
- **Editing a message that was deleted elsewhere** — reconcile to [deleted]; discard the edit.
- **Very long message** — enforce max length with a live counter and disabled send.
- **Rapid consecutive messages** — grouping; don't spam avatars/headers.
- **Empty channel** — "No messages yet — be the first…"
- **Reading history** — load-older preserves scroll; guard against jumpy scroll on new incoming while reading up.
- **No permission to post** `[VISION]` — composer disabled with reason.
- **Deleted/edited by author vs. moderated by owner** — both possible; show consistently ([deleted]).

## Sharing edge cases
- **No spaces joined** (Share modal) — empty prompt directing to create/join.
- **Nothing selected** (push/publish) — action disabled with count.
- **Sharing something with secrets** (team-member identity prompt) — warn before publishing.
- **Pulling something you already pulled** — show **✓ Pulled/Adopted/Installed** (idempotent), not a duplicate.
- **Name conflict on spell install** `[VISION]` — Replace / Rename / Cancel.
- **Missing dependency on adopt** `[VISION]` — e.g. a team member references a skill you don't have → warn.
- **Source deleted after sharing** — the space copy is independent; provenance link may dangle (show gracefully).

## Members & invites edge cases
- **Copy link with no clipboard permission** — fall back to select-all + manual copy.
- **Private space link opened by a non-member** `[VISION]` — "Request access," not auto-join.
- **Pending requests** `[VISION]` — approve/deny; handle race (already approved).
- **Removing/demoting the owner** — disallowed; hide/disable the action.
- **Last member / last admin leaving** — design what happens (block, transfer, or delete-on-empty).

## Presence, unread, notifications `[VISION]`
- **Presence unknown** — default to offline/neutral rather than guessing online.
- **Agent presence** — derived from session liveness; "thinking/working" sub-state possible.
- **Unread reconciliation across devices** — last-read is per-user; design for multi-device consistency.
- **Notification overload** — batch/group; respect a mute-per-channel / mute-space option.
- **Mention of an offline agent** `[VISION]` — invoking wakes/spawns it; show "invoking @agent…" feedback.

## Cross-cutting
- **Realtime lag** — most data is live; still show optimistic feedback on user actions and a subtle sync indicator.
- **Long lists** — tasks/messages/members can grow; paginate/virtualize; "load more" affordances.
- **Truncation** — long names/descriptions/identity prompts truncate with expand; never break layout.
- **Right-to-left / long i18n strings** `[future]` — leave room; don't hard-code widths.
- **Keyboard** — Enter/Shift+Enter in composer; Esc closes modals/threads/edit; tab order sane; focus returns after modals.
- **Accessibility** — sufficient contrast on the dark theme; presence not conveyed by color alone; all actions reachable by keyboard; ARIA on menus/modals.
