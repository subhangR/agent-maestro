# 02 — End-to-End Flows

Every flow a designer needs to draw, step by step. Each notes the **entry point**, the **steps** (with the states the UI passes through), and the **result**. Flows marked `[BUILT]` exist today; `[VISION]` are aspirational (design them anyway).

---

## A. Onboarding & account

### A1. First sign-in (Google) `[BUILT]`
1. User opens **Collab** in the icon rail → Collab Space Panel.
2. If Firebase isn't configured → **not-configured** empty state (dev only). Else → **sign-in view**.
3. User clicks **Continue with Google** → OS/browser Google auth popup.
4. On success → panel switches to **signed-in view**; the app begins loading the user's joined spaces (live).
5. Panel shows account header (name/email + sign out), repo context, and spaces.

### A2. Sign-in / create account (email) `[BUILT]`
1. In the sign-in view, user enters email + password.
2. Toggle between **Sign in** and **Create account** (a text toggle changes the primary button + intent).
3. Submit → button shows loading ("…"), inputs disabled.
4. Error (wrong password, email in use, weak password) → dismissible inline error banner; user corrects and retries.
5. Success → signed-in view.

### A3. Sign out `[BUILT]`
1. Signed-in view header → **Sign out**.
2. Returns to sign-in view; joined-spaces subscriptions stop; any open Space Window falls back to a signed-out prompt.

---

## B. Spaces: create, discover, join, leave, delete

### B1. Repo detection `[BUILT]`
1. On entering the signed-in panel, Maestro auto-detects the **current project's git remote** (`git remote get-url origin`), normalizes to `github.com/owner/repo`.
2. States: *detecting…* → *detected (shows canonical URL)* → or *no remote found*.
3. If no remote → empty "No GitHub remote detected" state with a **set manually** action (text input → Save).
4. The detected repo scopes everything below: your spaces + public spaces are filtered to this repo.

### B2. Create a space `[BUILT]`
1. Signed-in panel → **+ Create Space** → Create Space Modal.
2. Fields: **name** (required, autofocus), **description** (optional), **GitHub repo** (read-only, pre-filled from detection), **visibility** (radio: Public / Private).
3. **Create** → button shows "Creating…", disabled if name empty.
4. Behind the scenes a space doc + a default `#general` channel are created; creator becomes **owner**.
5. On success → modal closes, the new space opens (Space Window). On error → dismissible error banner in modal.

### B3. Discover & join a public space `[BUILT]`
1. Signed-in panel lists **Public Spaces** for this repo that the user hasn't joined (name, description, member count, **Join**).
2. **Join** → button shows joining state → user added as **member**.
3. Space moves from *Public* to *Your Spaces*; the Space Window opens.
4. Private spaces are **not** discoverable here — they require an invite (see D).

### B4. Open a space `[BUILT]`
1. From *Your Spaces* (panel) or a **spaces-rail avatar** → Space Window opens in the center workspace.
2. Window shows loading → then the active tab (defaults to Messages / `#general`).
3. If the user isn't a member (e.g., stale link) → "You're not a member of this space" empty state with a path to join.

### B5. Leave a space `[BUILT — action; VISION — confirm UX]`
1. Space Window → Settings → Danger zone → **Leave**.
2. Confirm ("You'll lose access to messages, tasks, and shared resources").
3. User removed from members; space disappears from *Your Spaces* and the rail; window closes.

### B6. Delete a space (owner) `[BUILT — action; VISION — confirm UX]`
1. Settings → Danger zone → **Delete** (owner only).
2. Confirm ("Permanently removes the space for all members. Cannot be undone").
3. Space deleted; all members' lists update live; the window closes for everyone.

---

## C. Channels & messaging

### C1. Enter a channel `[BUILT]`
1. Open a space → Messages tab. Channels load; **#general** (or first) auto-selects.
2. Message stream loads (most recent ~50), scrolled to bottom.
3. Header shows `# channel · Space Name`.

### C2. Create a channel `[BUILT]`
1. Channel list → **+** → Create Channel Modal.
2. **Name** (kebab-case: lowercase, numbers, dashes; ≤64 chars; live validation + hint), **description** (optional).
3. **Create** → "Creating…"; validation/server errors shown inline.
4. New channel appears in the list and becomes active.

### C3. Send a message `[BUILT]`
1. Composer: multiline textarea, placeholder `Message #channel`. **Enter** sends, **Shift+Enter** = newline.
2. On send → message appears **optimistically** (pending style) immediately; composer clears + refocuses.
3. On confirm → pending replaced by the real message (author avatar, name, time).
4. On failure → pending shows "Failed to send" with **Retry** / **Discard**.
5. Consecutive messages by the same author within a short window are **grouped** (avatar/header only on the first).

### C4. Edit a message `[BUILT]`
1. Hover own message → **edit** → inline textarea with current content. **Enter** saves, **Esc** cancels.
2. Saved message shows an **(edited)** marker after the timestamp.

### C5. Delete a message `[BUILT]`
1. Hover own message (or any message if owner) → **delete** (soft).
2. Content becomes **[deleted]**; timestamp kept; no further actions.

### C6. Load older messages `[BUILT]`
1. Scroll to top → **Load older messages** (or auto-load). Older page prepends; scroll position preserved.

### C7. Reply in a thread `[VISION]`
1. Hover message → **Reply in thread** → thread pane opens (right side or overlay) anchored to the parent.
2. Reply composer; option **"Also send to channel."**
3. Parent gets a **"N replies"** affordance; clicking it reopens the thread.

### C8. React to a message `[VISION]`
1. Hover message → **add reaction (+)** → emoji picker.
2. Pick emoji → reaction chip appears under the message with a count; your own reactions are highlighted.
3. Click a chip → toggle your reaction; hover → see who reacted.

### C9. Mention a person or agent `[VISION]`
1. Type `@` in the composer → autocomplete of space members (humans and **agents**).
2. Select → inserts a mention chip.
3. On send: humans get a notification/badge; **an agent mention invokes that agent** (see F1).

---

## D. Members & invites

### D1. View members `[BUILT roster; VISION presence]`
1. Space Window → Members tab. Roster grouped by presence (**Active** / **Offline** — presence is `[VISION]`; today it's a flat list).
2. Each row: avatar + presence dot, name, role badge (owner/admin), email + joined date, overflow **···** menu.

### D2. Invite by link `[BUILT]`
1. Members tab → **+ Invite** → Invite Modal.
2. Shows a copyable invite link (`.../space/{id}/join`); **Copy** → "Copied" for ~1.5s.
3. Recipient opens link (signed in) → for a **public** space they can join; for **private**, they need to be added (email invites + requests are `[VISION]`, see D3).

### D3. Invite by email / request to join (private) `[VISION]`
1. Invite modal offers **Send email invite**: enter email(s) + optional note → email sent with a join link.
2. For private spaces, opening a link shows **Request access** instead of auto-join.
3. Owner/admin sees **Pending requests** in Members with **Approve** / **Deny**.

### D4. Manage a member (owner/admin) `[VISION UI; roles exist in data]`
1. Members → member **···** → menu: **View profile**, **Send DM**, **Make admin** / **Make member**, **Remove from space** (danger).
2. Actions update the roster live; you can't demote/remove the owner.

### D5. Member profile popover `[VISION]`
1. Click/hover a member (in chat or roster) → popover: avatar, name, email, role, timezone, status, "joined X ago".
2. Quick actions: **Send message** (DM), **Mention**.

---

## E. Sharing (tasks, team members, spells)

The core mechanic: **push** a local entity up into a space; others **pull/adopt/install** it into their local project. Copy-based, with provenance. Two ways to trigger a push: from *inside* the space (a tab's "+ Push/Publish" button) or from the *local* entity (a "Share" button that opens the Share-to-Space modal).

### E1. Push a task from inside a space `[BUILT]`
1. Space → Tasks tab → **+ Push from local** → Push Tasks Modal.
2. Checklist of tasks from the active local project (title + project). Select one or more.
3. **Push (N)** → tasks copied into the space (with provenance: source task/project/user). They appear live in the shared list for all members.

### E2. Share a local entity via the Share-to-Space modal `[BUILT]`
1. On a local **task row** or **team-member row**, click **Share (↗)** → Share-to-Space Modal.
2. Modal shows the entity preview + a pick-list of **your joined spaces** (avatar, name, visibility, member count).
3. States: not-signed-in ("Sign in to share"), no spaces ("You haven't joined any…"), loading, list.
4. Select a space → **Share** → "Sharing…" → success state ("✓ Shared to {space}") → Done.
5. Team-member shares warn: *"The identity prompt and permissions become visible to every member."*

### E3. Pull a shared task `[BUILT UI; wiring partial]`
1. Space → Tasks tab → a shared task row → expand for details (description, priority, "pulled by N").
2. **Pull to local** → creates a new task in your active local project (status reset to todo, assignees stripped); records that you pulled it.
3. Row now shows **✓ Pulled**; the shared task's "pulled by" count increments live.

### E4. Publish / adopt a team member `[BUILT UI]`
1. Space → Team tab → **+ Publish from local** → pick one local team member (radio) → **Publish**. Warned about secrets in identity prompts.
2. Others see it in the shared list (name, mode, model, identity preview, permissions, adoption count).
3. **Adopt locally** → clones the agent persona into their project; adoption count increments.

### E5. Publish / install a spell `[BUILT UI]`
1. Space → Spells tab → **+ Publish from local** → pick a spell → publish.
2. Others see it (name, target entities, description, **Preview** to expand the body, install count).
3. **Install** → adds the spell to their local library; on name conflict → Replace / Rename / Cancel `[VISION UX]`; install count increments.

### E6. See & manage provenance `[VISION]`
1. A local entity that's been shared shows a badge: **↑ N** (pushed to N spaces), **↓** (pulled from a space), or **⇅**.
2. Click → popover: which spaces, who pushed/pulled, when; actions: **Open in space**, **Unlink**.

---

## F. The Maestro-unique flows (agents in the loop)

### F1. @mention an agent → invoke it `[VISION — the superpower]`
1. A space has an **agent team-member** (e.g. `@CodeReviewer`) as a member.
2. A human posts: `@CodeReviewer review PR #42`.
3. The mention **invokes** the agent: Maestro wakes that agent's session with context (space, channel, message, thread).
4. The agent runs, then **posts its result back** into the channel as a message authored by the agent.
5. Humans and the agent continue in the same stream (or thread).

### F2. Agent as a first-class member `[VISION]`
1. Agents appear in the **Members roster** alongside humans, visually marked as agents (badge/icon), with presence derived from whether their session is alive.
2. Agents can be @mentioned, DM'd, and can post/share tasks back to the space.

---

## G. Notifications & unread `[VISION]`

### G1. Unread & mention badges
1. Channels with new messages appear **bold**; the spaces-rail avatar and channel show an unread count.
2. An **@mention** of you shows a distinct (red) badge, separate from generic unread.
3. Reading a channel (scrolling to bottom / focusing) clears its unread; per-user last-read marker persists.

### G2. In-app notification
1. A relevant event (mention, task assigned, member joined, agent replied) → toast (bottom-right): summary + jump action.
2. Click → navigates to the source (channel + scrolls to message).

### G3. Push notification
1. Same triggers, delivered as desktop/mobile push (and optionally via existing messaging integrations like Telegram/Slack/Discord).
2. Click → opens Maestro to the source.

---

## H. Search `[VISION]`

### H1. Search messages / people / tasks
1. Global search entry (icon / shortcut) → search surface.
2. Type a query → results grouped: **Messages** (with channel + author + snippet), **People**, **Tasks**.
3. Filters: this space / this channel / from @person / date range / status.
4. Click a message result → jump to it in context (scroll + highlight).
