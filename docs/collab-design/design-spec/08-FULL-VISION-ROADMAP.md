# 08 — Full-Vision Roadmap (features to design)

The not-yet-built features. Design them as if they exist — this is the complete product. Each entry: **what it is · the flow · the data it needs · how it maps onto the existing model.** Grouped into rough phases so you can prioritize, but design them all.

Legend: 🟩 built · 🟨 partial/stub · ⬜ not built.

---

## Phase A — Messaging depth

### Threads ⬜
- **What:** nested replies under a parent message to keep side-conversations off the main stream.
- **Flow:** hover message → *Reply in thread* → thread pane (parent pinned + reply list + composer + "also send to channel"); parent shows **"N replies."**
- **Data:** `Message.threadId` (parent id) + `replyCount` (on parent). Already reserved.
- **Maps to:** the channel is still the container; threads are a second nesting dimension. Reuse the message stream + composer inside the pane.

### Reactions / emoji ⬜
- **What:** react to a message (later: to tasks/agents/spells) with emoji.
- **Flow:** hover → **(+)** → emoji picker → chip with count appears; click chip to toggle; hover to see reactors.
- **Data:** `Message.reactions[] = {name, count, users[]}` (or a reactions subcollection).
- **Maps to:** the message is the target; any member may react (no permission gate).

### Mentions ⬜
- **What:** `@person` and `@agent` in the composer.
- **Flow:** type `@` → autocomplete of members (humans + agents) → chip. On send: humans get badges/notifications; **agents get invoked** (see Phase E).
- **Data:** `Message.mentions[] = {kind: 'user'|'agent', id, range}`.
- **Maps to:** parsed at send-time; drives notifications and agent invocation.

---

## Phase B — Direct messages

### 1:1 DMs & group DMs (3–8) ⬜
- **What:** private conversations outside channels; Slack's unified "conversation" model.
- **Flow:** click a member → *Send message* → DM opens (listed under channels). Group DM: pick 2–7 people → shared thread. Same message UI as channels; header shows the person(s) not `#channel`.
- **Data:** reuse `Channel` with `kind: 'dm' | 'group_dm'` and `memberIds[]` (sorted for canonical lookup). Messages unchanged.
- **Maps to:** no parallel schema — DMs are channels with a kind + member list; all message/thread/reaction logic is reused.

---

## Phase C — Awareness (presence, unread, notifications)

### Presence & typing ⬜
- **What:** online/away dots on avatars; "X is typing…"; for agents, presence = session alive.
- **Flow:** Members panel groups Active vs Offline; composer shows typing above it.
- **Data:** ephemeral store (Firebase Realtime DB) `presence/{space}/{uid}` and `typing/{space}/{channel}`. Orthogonal to messages.
- **Maps to:** decorates avatars/roster; agent presence derived from maestro-server session liveness.

### Unread & read-state + mention badges ⬜
- **What:** per-user last-read marker per channel; unread bold + counts on channels and rail avatars; distinct **red** badge for @mentions.
- **Flow:** unread channels bold with count; reading clears; mentions get the red badge.
- **Data:** per-user private `readState/{uid}` = `{ [channelId]: {lastReadAt, mentionCount} }`. Compute unread = messages after lastReadAt.
- **Maps to:** no changes to Message/Channel; a private side table per user.

### Notifications (in-app + push) ⬜
- **What:** toasts for mentions/assignments/joins/agent-replies; desktop/mobile push (and optional Telegram/Slack/Discord via existing Maestro messaging integrations).
- **Flow:** event → toast (summary + jump) or OS push → click → deep-link to the source message.
- **Data:** derived from `mentions[]` + events; fan-out to humans (push) and agents (invoke).
- **Maps to:** the message is the trigger; integrates with existing notify infrastructure.

---

## Phase D — Search

### Search (messages / people / tasks) ⬜
- **What:** find by keyword with filters (space/channel/author/date/status).
- **Flow:** search entry → query → grouped results → click → jump-to-context with highlight.
- **Data:** Firestore can't substring-search; plan is a server-side index (SQLite FTS / Lunr on maestro-server), or a stopgap "recent + client filter." Design assumes full search exists.
- **Maps to:** messages/people/tasks indexed; UI is a new search surface (S18).

---

## Phase E — The Maestro superpower: agents in the loop

### Agents as first-class members ⬜
- **What:** an agent team-member (name, avatar, identity) is a real member — appears in the roster, authors messages, can be DM'd/mentioned/shared-to.
- **Flow:** add/adopt an agent into the space → it shows in Members (marked as agent) with liveness presence.
- **Data:** `Message.author = {kind:'human'|'agent', id}`; member entry marked agent.
- **Maps to:** humans and agents share the roster and stream; visually distinct, functionally equal.

### @mention → invoke (the killer flow) ⬜
- **What:** mentioning an agent doesn't just notify — it **runs** the agent with the message as context (`maestro session prompt <sessionId>`).
- **Flow:** `@CodeReviewer review PR #42` → "Invoking @CodeReviewer…" → the agent wakes with space/channel/message context → posts its result back into the channel/thread → conversation continues.
- **Data:** mention resolution finds the agent's session; context payload = space/channel/message/thread.
- **Maps to:** turns chat channels into a **fleet control plane** — no Slack equivalent. This is the differentiator; give it a first-class, delightful interaction (clear invoke feedback, agent "working" state, result attribution).

---

## Phase F — Governance & onboarding

### Admin tier & role management ⬜ (roles exist in data)
- **What:** owner > admin > member. Admins moderate + manage members; can't delete the space.
- **Flow:** owner → member ··· → **Make admin**; admins gain manage/remove/edit-any controls.
- **Data:** `members[uid].role` already supports it; needs UI + rule enforcement.

### Member profiles & popovers ⬜
- **What:** click/hover a member → card with bio, timezone, status, role + quick DM/mention.
- **Data:** extend member with `timezone/bio/status*`.

### Private-space join approvals ⬜
- **What:** private spaces require owner/admin approval instead of auto-join.
- **Flow:** link → **Request access** → owner sees **Pending requests** → Approve/Deny.
- **Data:** `joinRequests/{uid}` with status.

### Email invites & deep-link ⬜ (link-share is 🟩)
- **What:** send an email with a join link; desktop deep-link (`maestro://space/{id}/join`) auto-joins.
- **Flow:** Invite modal → **Send email** → recipient clicks → joins/requests.
- **Data:** `invites` with `kind:'email'`, token, expiry, uses.

---

## Provenance surfacing ⬜ (fields exist)
- **What:** on a **local** entity, show where it's shared/pulled: **↑ N / ↓ / ⇅** badge → popover (which spaces, who, when; open/unlink).
- **Maps to:** local Task/TeamMember gain nullable origin + `sharedTo[]` fields; space copies already carry provenance.

---

## Suggested design order
1. **Messaging depth** (threads, reactions, mentions) — highest daily-use value; the stream is the heart.
2. **Awareness** (unread/badges, presence, notifications) — makes it feel alive and pullable.
3. **Agents in the loop** (@mention→invoke, agent roster) — the differentiator; design it to feel magical.
4. **DMs**, **search**, **governance/onboarding** — round out to Slack parity.

Design each with the full state set from `05` (empty/loading/error/permission/offline) and the copy conventions from `06`.
