# 04 — Component Inventory

Reusable building blocks to design once and use across surfaces. For each: purpose, key variants/props, and states. This is a design component list (not code).

## Identity & people

### Avatar
- **Purpose:** represent a user, agent, or space.
- **Variants:** photo (user's Google photo) · initials fallback (1 letter on a deterministic color) · **space avatar** (space's first letter, deterministic color) · **agent avatar** (visually marked as non-human).
- **Sizes:** rail (26px), roster/bubble (~32px), popover (large).
- **States:** with/without presence dot (online/idle/offline); active ring.

### Presence dot `[VISION]`
- Small status indicator overlaid on an avatar. States: online (green) · idle (amber) · offline (gray). For agents: "session alive" = online.

### Member row
- Avatar + presence, name, **role badge** (owner/admin/member), email + joined date, overflow **···** menu. Variants for roster vs. compact.

### Role badge
- Pill: owner · admin · member (member often unlabeled). Distinct emphasis for owner.

### Author chip
- `@name` inline tag (colored), used on task/team/spell rows and in mentions. Agent variant marked distinctly.

### Member profile popover `[VISION]`
- Card triggered by clicking a person: identity, role, timezone, status, quick actions (DM, mention, admin controls).

## Messaging

### Message bubble
- **Regions:** avatar, author, timestamp, content (markdown), hover action bar.
- **Variants:** first-in-group (full header) · grouped continuation (no header) · own vs. others · **agent-authored** (`[VISION]`).
- **States:** normal · edited (marker) · pending/sending · failed (Retry/Discard) · edit-mode (inline editor) · deleted ([deleted]) · `[VISION]` with reactions row / thread indicator / mention-highlight / system-share tag.

### Composer
- Toolbar (attach/mention/emoji — several disabled today), auto-growing textarea, send button, hint line. States: default · sending · too-long · no-permission `[VISION]`.

### Channel list item
- `#` + name; active highlight; `[VISION]` unread bold + count, mention badge, DM/group-DM variants.

### Reaction chip `[VISION]`
- Emoji + count; highlighted when the current user reacted; hover → reactor list. Plus an "add reaction (+)".

### Thread indicator / thread pane `[VISION]`
- "N replies" affordance on a parent; a pane with pinned parent + reply list + composer + "also send to channel."

### Typing indicator `[VISION]`
- Ephemeral "X is typing…" line above the composer.

## Shared entities (task / team-member / spell)

### Shared-entity row (expandable)
- Shared pattern across Tasks/Team/Spells: collapsed summary → expanded detail + actions.
- **Common regions:** leading marker (priority dot / avatar / `/name`), title, status/meta chips, author chip, relative time, **fan-out count** (↑ pulled/adopted/installed).
- **Actions:** primary pull/adopt/install (with done state ✓ Pulled/Adopted/Installed), plus edit/delete/fork/preview per type.
- **States:** collapsed · expanded · done (already taken by you) · owner actions available.

### Status pill (task)
- todo · in_progress · in_review · blocked · completed · cancelled. Distinct color per status.

### Priority dot / label
- low · medium · high.

### Permission pills (team member)
- Small chips listing an agent's command permissions (read, search, review, delegate, …).

### Provenance badge `[VISION]`
- ↑ N (shared to N spaces) · ↓ (pulled) · ⇅. Click → provenance popover (which spaces, who, when, open/unlink).

### Entity preview (in Share modal)
- Kind label + entity name (e.g. "[Task] Implement auth flow").

## Spaces & navigation

### Space avatar (rail)
- Deterministic color circle + first letter; active indicator; tooltip.

### Space row (panel)
- Name, description, member count; member variant (chevron, opens) vs. visitor variant (Join button); private badge.

### Top tab bar (Space Window)
- Icon + label tabs; active state; `[VISION]` unread badge on Messages.

### Section header (tabs)
- Title + count badge + right-aligned controls (search, filter, + action). Shared across Tasks/Team/Spells/Members.

### Search input (in-section)
- Live-filter text field used in Tasks/Team/Spells headers.

### Status filter dropdown
- Used in Tasks header (all/status values).

## Shell & feedback

### Modal shell
- Overlay + centered card; title, body, footer actions; dismiss on Cancel/overlay/Esc. Mobile → full-screen sheet. Used by all modals (S5–S9, S13, S16).

### Empty-state card
- Centered icon + title + hint + optional CTA. Used pervasively (see `06-CONTENT-AND-COPY.md`).

### Loading state
- Spinner + short label (reuse Maestro's existing "terminal spinner" aesthetic).

### Error banner
- Inline, dismissible, non-blocking (red). Used in sign-in, modals, share.

### Success state (share)
- Check + confirmation line + Done.

### Toast notification `[VISION]`
- Bottom-right transient card: icon, summary, jump action.

### Copy-link field + button
- Read-only field + Copy button that flips to "Copied" for ~1.5s. Used in Invite and Settings.

### Confirm dialog `[VISION polish]`
- For destructive actions (leave, delete space, delete message, remove member): title, consequence text, Cancel + destructive confirm.

### Unread badge `[VISION]`
- Count pill on rail avatars, channels, tab. Mention variant (red) distinct from generic unread.

## Notes on reuse
- Tasks/Team/Spells tabs are **the same shell** (section header + expandable rows + publish modal) parametrized by entity kind — design one master pattern with three skins.
- The **message stream + composer** are reused for channels, threads, and DMs.
- **Modal shell**, **empty-state card**, **error banner**, and **section header** are the highest-leverage components — get them right first.
