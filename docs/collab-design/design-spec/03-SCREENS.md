# 03 — Screen Specifications

Every surface, its layout regions, controls, and **all** rendered states. ASCII wireframes are structural hints only — they show regions, not visual design. `[BUILT]` = exists today; `[VISION]` = design it, not yet built.

---

## S1. Collab Space Panel (the lobby) `[BUILT]`

A single narrow column in the left panel, full height, scrollable. It has five top-level states.

### S1.0 States overview
```
not-configured → loading → sign-in ─┬─→ signed-in
                                     └─(auth)──┘
```

### S1.1 Not-configured `[BUILT, dev-only]`
- Centered empty card. Title: "Firebase not configured." Body: instructions to set env vars. No actions. (Only appears in dev builds without credentials — treat as an edge state, low design priority.)

### S1.2 Loading
- Centered spinner + "Loading…". No interactions.

### S1.3 Sign-in view
```
┌───────────────────────────────┐
│  Sign in to Maestro Collab     │
│  Connect with collaborators    │
│  on GitHub repos               │
│                                │
│  [ Continue with Google ]      │
│  ──────── or ────────          │
│  Email    [______________]     │
│  Password [______________]     │
│  [ Sign in ]                   │
│  Don't have an account? Create │
│  [ error banner if any ]       │
└───────────────────────────────┘
```
- **Regions:** heading + subtitle; Google button; divider; email/password form; primary button; mode-toggle text link; error banner.
- **Controls:** Google OAuth button; email + password inputs; primary submit; **Sign in ↔ Create account** toggle (changes button label + intent); error dismiss.
- **States:** default; loading (buttons disabled, "…"); error (dismissible banner); create-account mode (adds confirm expectations, button reads "Create account").

### S1.4 Signed-in view
```
┌───────────────────────────────────────┐
│ Signed in as you@email.com   [Sign out]│
│ Repo: github.com/owner/repo   [change] │
├───────────────────────────────────────┤
│ [ + Create Space ]                     │
│                                        │
│ YOUR SPACES                            │
│  ▸ Backend Squad   5 members        →  │
│  ▸ Frontend Team   3 members        →  │
│                                        │
│ PUBLIC SPACES (this repo)              │
│  ▸ Infra Guild     8 members   [Join]  │
└───────────────────────────────────────┘
```
- **Account header:** identity (name/email, avatar), **Sign out**.
- **Repo context:** detected canonical remote OR "detecting…" OR "no remote found." **change / set manually** → inline text input with **Save / Cancel**.
- **Create:** **+ Create Space** → S5.
- **Your Spaces list:** rows (name, description, member count, chevron). Click → opens Space Window (S2).
- **Public Spaces list:** rows with **Join** (member count, visibility). Private spaces are absent here.
- **Space row variants:** member (chevron, opens) · visitor (Join button) · private badge.
- **States:** no-remote (empty state + set manually); no spaces (empty prompt + create CTA); loading spaces; populated.

---

## S2. Space Window (inside a space) `[BUILT shell]`

Wide surface in the center workspace (or full-screen). Three stacked regions: **chrome**, **top tabs**, **tab body**.

```
┌ Chrome ─────────────────────────────────────────────── ⚙ ┐
│ Backend Squad · github.com/owner/repo                      │
├ Tabs ─────────────────────────────────────────────────────┤
│ [Messages] Tasks  Team Members  Spells  Members  Settings  │
├ Body (active tab) ─────────────────────────────────────────┤
│                                                            │
│                    … tab content …                         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### S2.1 Chrome `[BUILT]`
- Left: space **name** (title) + **repo URL** (subtitle). Right: **settings gear** → jumps to Settings tab. In an inline (docked) variant, the back button is hidden; full-screen shows back.

### S2.2 Top tabs `[BUILT]`
- Six tabs with icons: **Messages** (chat), **Tasks** (checkbox), **Team Members** (users), **Spells** (star), **Members** (person), **Settings** (gear). Active tab highlighted. Click → switch body.
- `[VISION]` unread/mention badge may sit on Messages (and per-channel inside).

### S2.3 Window empty states `[BUILT]`
- **Loading:** "Opening space… Loading channels and members."
- **Not a member:** "You're not a member of this space. Join the space from the Collab tab to enter." (+ space name)
- **Missing:** "Space not found. This space may have been deleted or you no longer have access."

---

## S3. Messages tab `[BUILT]`

The chat surface. Full vision is a 3-region layout: **channel list | message stream | (members)**. Today the stream + composer are primary; the multi-channel sidebar and members column are part of the full layout.

```
┌ Channels ─┬ # general · Backend Squad ───────────────┐
│ + New     │                                          │
│ #general  │  ┌ Asha  10:02 ─────────────────┐        │
│ #design   │  │ hey, pushed the auth task     │        │
│ #api      │  └───────────────────────────────┘        │
│           │  ┌ (grouped) 10:03 ─────────────┐         │
│           │  │ can someone pull it?          │         │
│           │  └───────────────────────────────┘        │
│           │  ┌ You  10:05  (sending…) ───────┐        │
│           │  │ on it                          │        │
│           │  └───────────────────────────────┘        │
│           ├──────────────────────────────────────────┤
│           │ [📎] [@] [🙂]                             │
│           │ [ Message #general … ]          [ Send ]  │
│           │ Enter to send · Shift+Enter for newline   │
└───────────┴──────────────────────────────────────────┘
```

### S3.1 Channel list `[BUILT]`
- Header "Channels" + **+** (create channel → S6). Rows: `#` + name; active row highlighted. `[VISION]` unread bold + count; DMs/group-DMs listed below channels.
- **States:** loading ("Loading channels…"); empty ("No channels yet").

### S3.2 Channel header `[BUILT]`
- `#` + channel name; separator; space name. `[VISION]` topic/description; member count; search-in-channel; thread/pins entry.

### S3.3 Message stream `[BUILT]`
- Scrollable, auto-sticks to bottom on new messages; **Load older** at top when more exist.
- **Message bubble regions:** avatar (photo or initials) · author name · timestamp · content (markdown) · hover actions (edit/delete for own or owner).
- **Grouping:** consecutive same-author messages omit avatar/header (indented continuation).
- **System/share tags:** a message can carry a tag when it represents a shared task / team-member / spell event (e.g. a colored chip).
- **Bubble states:**
  - **Normal** — avatar, author, time, content; **(edited)** marker if edited.
  - **Pending (optimistic)** — lighter, "sending…" tag; on failure → "Failed to send" + **Retry** / **Discard**.
  - **Edit mode** — inline textarea + **Save** / **Cancel**; hint "Enter to save · Esc to cancel."
  - **Deleted** — content "[deleted]", timestamp kept, no actions.
  - `[VISION]` reactions row (chips + counts); thread indicator ("N replies"); mention highlight.
- **States:** loading ("Loading messages…"); empty ("No messages yet — be the first to say something.").

### S3.4 Composer `[BUILT]`
- Toolbar: **attach** (📎, "coming soon" — disabled today), **mention** (@, disabled today → `[VISION]` autocomplete), **emoji** (🙂, disabled today → `[VISION]`).
- Textarea: placeholder `Message #channel`, auto-grows, **Enter** sends / **Shift+Enter** newline.
- **Send** button: disabled when empty / sending / over max length.
- Hint line: "Enter to send · Shift+Enter for newline" OR "Message too long (N/MAX)".
- **States:** default; sending (send disabled); too-long; **no-permission** (`[VISION]` — banner "You don't have permission to post here.").

### S3.5 Thread pane `[VISION]`
- Opens beside/over the stream, anchored to a parent message (shown pinned at top), its own reply list + composer, and a "Also send to channel" toggle.

---

## S4. Tasks tab (shared tasks) `[BUILT UI]`

```
┌ Shared Tasks  [5]      [ search ] [ status ▾ ]  [ + Push ] ┐
├────────────────────────────────────────────────────────────┤
│ ● Implement auth flow      IN PROGRESS  @asha        2h ago │
│   ▸ description… · Pulled by 2 · Priority: high            │
│     [ ⤓ Pull to local ]  [ Edit ]  [ Delete ]             │
│ ● Fix sidebar layout       TODO         @you         5h ago │
│ (empty) No shared tasks yet.                                │
└────────────────────────────────────────────────────────────┘
```
- **Header:** title + count badge; **search** (filters live); **status filter** (all/todo/in_progress/blocked/completed); **+ Push from local** → S7.
- **Task row (collapsed):** priority dot; title (click to expand); status pill; author chip `@name`; relative time.
- **Task row (expanded):** description; meta ("Pulled by N", "Priority: X"); actions — **Pull to local** (primary) or **✓ Pulled** (done); **Edit** / **Delete** (owner/creator).
- **States:** empty ("No shared tasks yet…"); no-results ("No tasks match the current filter."); populated.
- `[VISION]`: provenance badge, assignees/avatars, task hierarchy (parent/children), reactions.

---

## S5-modals & the rest

## S5. Create Space modal `[BUILT]`
```
┌ Create a Space ───────────────────┐
│ Name*        [_______________]     │
│ Description  [_______________]     │
│ GitHub repo  github.com/owner/repo │  (read-only)
│ Visibility   ◉ Public  ○ Private   │
│  Public — anyone on this repo can find it
│  Private — invite-only
│ [ error banner ]                   │
│           [ Cancel ] [ Create ]    │
└────────────────────────────────────┘
```
- **States:** default; invalid (Create disabled until name); creating ("Creating…"); error (dismissible).

## S6. Create Channel modal `[BUILT]`
- **Name** (kebab-case; lowercase + numbers + dashes; ≤64; live validation + hint "Lowercase letters, numbers, and dashes only"); **description** (optional).
- **States:** default; validation error; server error; creating ("Creating…"); Create disabled when empty/invalid.

## S7. Push Tasks modal `[BUILT]`
- Title "Push tasks to space" + explainer. **Checklist** of local tasks (title + project). Footer **Push (N)** (disabled when none selected) / **Cancel**.

## S8. Publish Team Member modal `[BUILT]`
- Title "Publish team member." **Radio list** of local team members (name + mode + model). Hint: "Be sure the identity prompt has no secrets." **Publish** (disabled until one selected) / **Cancel**.

## S9. Publish Spell modal `[BUILT]`
- Analogous single-select of local spells → **Publish**.

## S10. Team Members tab (shared agents) `[BUILT UI]`
```
┌ Shared Team Members  [3]   [ search ]      [ + Publish ] ┐
├──────────────────────────────────────────────────────────┤
│ (A) Reviewer   coordinator · opus   @asha            ↑12 │
│   ▸ identity prompt (mono)…                              │
│     agent tool: code-reviewer                           │
│     permissions: [read][search][review]                 │
│     published 6d ago                                    │
│     [ Adopt locally ]  [ Fork ]                         │
└──────────────────────────────────────────────────────────┘
```
- **Row (collapsed):** avatar (initial); name; subtitle (mode badge + model); author chip; **↑ adoption count**.
- **Row (expanded):** identity prompt (preformatted); agent tool (mono); permission pills; published date; actions **Adopt locally** / **✓ Adopted**; **Fork** (`[VISION]`).
- **States:** empty ("No shared team members yet…"); no-results ("No agents match this search."); populated.

## S11. Spells tab (shared spells) `[BUILT UI]`
- **Row:** `/spell-name` + target-entity pills (session/task…); author chip; published time; **↑ install count**; description; **Preview / Hide** (expands the body as a code block); **Install** / **✓ Installed**.
- **States:** empty ("No shared spells yet…"); no-results; populated.

## S12. Members tab `[BUILT roster; VISION presence/actions]`
```
┌ Members  [5]                              [ + Invite ] ┐
├────────────────────────────────────────────────────────┤
│ ACTIVE (3)                                             │
│  (S) Subhang     owner   subhang@… · joined 3mo   [···]│
│  (M) Manzil      admin   …                         [···]│
│ OFFLINE (2)                                            │
│  (A) Asha        …                                 [···]│
└────────────────────────────────────────────────────────┘
```
- **Header:** title + count; **+ Invite** → S13.
- **Grouping:** **Active** / **Offline** (`[VISION]` — presence; today flat).
- **Member row:** avatar + presence dot; name; role badge (owner/admin); email + joined date; **···** overflow.
- **Overflow menu (`[VISION]` mostly):** View profile · Send DM · (—) · Make admin/member · Remove from space (danger). Not shown for the owner.
- **States:** loading; populated. `[VISION]`: pending join requests section; member profile popover (S14).

## S13. Invite Member modal `[BUILT link; VISION email/requests]`
- Title "Invite to {space}." Body about sharing the link (+ note that private spaces need approval). **Invite link** row (read-only + **Copy** → "Copied" ~1.5s). Hint about email invites being a follow-up. **Done**.
- `[VISION]`: tab/segment for **Send email invite** (email input + note + send); link options (expiry, max uses, revoke).

## S14. Member profile popover `[VISION]`
- Avatar, name, email, role, timezone, status (emoji + text), "joined X ago." Actions: **Send message** (DM), **Mention**. Owner/admin: **Make admin/member**, **Remove**.

## S15. Settings tab `[BUILT shell; actions partly disabled]`
```
┌ Settings ──────────────────────────────────────────────┐
│ GENERAL                                                 │
│  Name        [_______________]                          │
│  Description [_______________]                          │
│  Visibility  ◉ Public  ○ Private                        │
│  [ Save changes ] [ Discard ]  (enabled only if dirty)  │
│ INVITE                                                  │
│  Invite link [ …/space/{id}/join ]        [ Copy ]      │
│ ADMINS                                                  │
│  (S) Subhang owner   (M) Manzil admin   [ + Add admin ] │
│ DANGER ZONE                                             │
│  Leave space  → [ Leave ]                               │
│  Delete space → [ Delete ]                              │
└─────────────────────────────────────────────────────────┘
```
- **General:** name, description, visibility radio; **Save / Discard** enabled only when dirty; saving state.
- **Invite:** copyable link.
- **Admins:** list with role badges; **+ Add admin** (`[VISION]`).
- **Danger zone:** **Leave** (all members) and **Delete** (owner) each with hint + confirm.

## S16. Share-to-Space modal `[BUILT]`
```
┌ Share task to a Collab Space ──────────────┐
│ [Task] "Implement auth flow"               │
│ Pick a space:                              │
│  ◉ (B) Backend Squad  Private · 5 members  │
│  ○ (F) Frontend Team  Public · 3 members   │
│ [ hint for team-member visibility ]        │
│ [ error banner ]                           │
│              [ Cancel ]  [ Share ]         │
└────────────────────────────────────────────┘
```
- **Regions:** title + entity preview (kind + name); space pick-list (avatar, name, visibility, member count, selected check); kind-specific hint; error; actions.
- **States:** not-signed-in ("Sign in to share to a Collab Space."); loading ("Loading your spaces…"); no-spaces ("You haven't joined any Collab Spaces yet…"); list; submitting ("Sharing…"); **success** ("✓ Shared to {space}. Members can now pull it into their local projects." + **Done**); error.

## S17. Spaces-rail avatars `[BUILT]`
- A divider + a vertical stack of small circular **space avatars** (deterministic color + first letter) at the bottom of the spaces rail. Active space shows a right-edge indicator. Hover tooltip: "{Space} · {repo}". Click → open Space Window. `[VISION]` unread badge on the avatar; drag to reorder.

## S18. Search surface `[VISION]`
- Entry via icon/shortcut. Query input + filter chips (space/channel/author/date/status). Results grouped **Messages / People / Tasks**; message results show channel + author + snippet; click → jump-to-context with highlight. Empty and no-results states.

## S19. Notifications `[VISION]`
- **Toast:** bottom-right, icon + summary + jump action; auto-dismiss; stack.
- **Notification center (optional):** list of recent notifications, read/unread, grouped by space, mark-all-read.
- **Push:** OS-level (desktop/mobile) — design the copy + deep-link behavior.

## S20. Direct Messages `[VISION]`
- DM list under channels in the Messages tab (person avatar + name + presence + unread). A DM opens the same stream+composer as a channel (header shows the person(s) instead of `#channel`). Group DM header shows stacked avatars + names. "New message" entry to start a DM (pick 1 person or a small group).
