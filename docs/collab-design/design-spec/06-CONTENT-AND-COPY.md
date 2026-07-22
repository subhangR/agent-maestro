# 06 — Content & Copy

Microcopy for every surface. Copy marked `[BUILT]` is the current in-product wording (keep or refine); `[VISION]`/`[suggested]` is proposed. Tone: **clear, calm, a little technical, never cutesy.** Speak to a developer.

## Voice principles
- Plain and direct. "Sign in to collaborate," not "Join the party!"
- Explain *why* in empty states (what this surface is for + the one action to take).
- Errors are specific and recoverable ("That email is already in use. Sign in instead?").
- Agents are teammates: refer to them by name, not "the bot."

## Auth
- Title `[BUILT]`: **"Sign in to Maestro Collab"**
- Subtitle `[BUILT]`: **"Connect with collaborators on GitHub repos"**
- Buttons: **"Continue with Google"** · **"Sign in"** · **"Create account"**
- Toggle: **"Don't have an account? Create one"** ↔ **"Already have an account? Sign in"**
- Divider: **"or"**
- Account header: **"Signed in as {email}"** · **"Sign out"**
- Errors `[suggested]`: "Wrong email or password." · "That email is already in use." · "Password must be at least 6 characters." · "Sign-in was cancelled." · "Couldn't reach the server. Check your connection."
- Not configured `[BUILT, dev]`: **"Firebase not configured"** / "Set VITE_FIREBASE_* env vars to enable collaboration."

## Repo context
- Detecting: **"Detecting repository…"**
- Detected: **"Repo: {github.com/owner/repo}"** + **"change"**
- None `[BUILT]`: **"No GitHub remote detected"** / "{project} isn't a git repo, or has no origin remote." + **"set manually"**
- Manual input placeholder: "github.com/owner/repo"

## Spaces (panel)
- Section labels: **"Your Spaces"** · **"Public Spaces"**
- Create button: **"+ Create Space"**
- Space row meta: **"{N} members"**, **"private"** badge
- Join: **"Join"**
- Empty (no spaces): `[suggested]` **"No spaces for this repo yet."** / "Create one to start collaborating with others working on {repo}." + **Create Space**

## Create Space modal
- Title: **"Create a Space"**
- Fields: **"Name"** (required) · **"Description"** (optional) · **"GitHub repo"** (read-only) · **"Visibility"**
- Visibility options `[BUILT]`: **"Public — any signed-in Maestro user can find and join it"** · **"Private — invite-only"**
- Actions: **"Cancel"** · **"Create"** (→ "Creating…")

## Space Window
- Chrome subtitle: the repo URL.
- Tabs: **Messages · Tasks · Team Members · Spells · Members · Settings**
- Empty — loading: **"Opening space…"** / "Loading channels and members."
- Empty — not member: **"You're not a member of this space"** / "Join the space from the Collab tab to enter. ({space})"
- Empty — missing: **"Space not found"** / "This space may have been deleted or you no longer have access."

## Channels & messages
- Channels header: **"Channels"** · create tooltip **"New channel"**
- Channels empty: **"No channels yet"** · loading **"Loading channels…"**
- Message header: **"# {channel} · {space}"**
- Messages empty `[BUILT]`: **"No messages yet — be the first to say something."**
- Messages loading: **"Loading messages…"**
- Load older: **"Load older messages"** (→ "Loading…")
- Composer placeholder `[BUILT]`: **"Message #{channel}"**
- Composer hint `[BUILT]`: **"Enter to send · Shift+Enter for newline"**
- Too long: **"Message too long ({n}/{max})"**
- Edited marker `[BUILT]`: **"(edited)"**
- Deleted `[BUILT]`: **"[deleted]"**
- Edit hint: **"Enter to save · Esc to cancel"**
- Send failure: **"Failed to send"** + **"Retry"** / **"Discard"**
- No permission `[VISION]`: **"You don't have permission to post here."**
- Create Channel modal: title **"Create a channel"**; name hint **"Lowercase letters, numbers, and dashes only"**; error **"Channel name must be 1–64 characters"** / **"Use lowercase letters, numbers, and dashes"**.

## Tasks / Team / Spells tabs
- Titles: **"Shared Tasks"** · **"Shared Team Members"** · **"Shared Spells"** (+ count)
- Push buttons: **"+ Push from local"** (tasks) · **"+ Publish from local"** (team/spells)
- Empty `[BUILT/from docs]`:
  - Tasks: **"No shared tasks yet."** / "Push tasks from your local Maestro project to share them with everyone here, or pull them down to work on locally."
  - Team: **"No shared team members yet."** / "Publish your most-used agents so the rest of the space can adopt them with one click."
  - Spells: **"No shared spells yet."** / "Publish a spell to give every member a one-click shortcut to your favorite prompts."
- No results: **"No tasks match the current filter."** / **"No agents match this search."** / **"No spells match this search."**
- Row actions: **"Pull to local"** / **"✓ Pulled"** · **"Adopt locally"** / **"✓ Adopted"** · **"Install"** / **"✓ Installed"** · **"Preview"** / **"Hide"** · **"Edit"** · **"Delete"** · **"Fork"**
- Row meta: **"Pulled by {n}"** · **"↑ {n}"** (adoption/install count) · **"Priority: {level}"** · **"published {t} ago"** / **"{t} ago"**
- Modals: **"Push tasks to space"** · **"Publish team member"** (hint **"Be sure the identity prompt has no secrets."**) · **"Publish spell"**; footer **"Push ({n})"** / **"Publish"** / **"Cancel"**.

## Members & invites
- Header: **"Members"** (+ count) · **"+ Invite"**
- Groups `[VISION]`: **"Active"** · **"Offline"**
- Role badges: **"owner"** · **"admin"**
- Row meta: **"{email} · joined {t} ago"**
- Overflow menu `[VISION]`: **"View profile"** · **"Send DM"** · **"Make admin"** / **"Make member"** · **"Remove from space"**
- Invite modal: title **"Invite to {space}"**; body **"Share this link with anyone you want to collaborate with."** (+ note: private spaces need approval `[VISION]`); **"Copy"** → **"Copied"**; hint **"Email-based invites are coming soon."**; **"Done"**
- Requests `[VISION]`: **"Pending requests"** · **"{name} requested access"** · **"Approve"** / **"Deny"** · requester side **"Request access"** → **"Request sent"**

## Settings
- Sections: **"General"** · **"Invite"** · **"Admins"** · **"Danger Zone"**
- General: **"Space name"** · **"Description"** (placeholder **"What's this space for?"**) · **"Visibility"** (**"Public — anyone with the link can join"** / **"Private — invite-only. Members must be added by an admin."**) · **"Save changes"** / **"Discard"**
- Invite: **"Invite link"** + **"Copy"**
- Admins: **"+ Add admin"**
- Danger zone: **"Leave space"** / "You'll lose access to messages, tasks, and shared resources." + **"Leave"**; **"Delete space"** / "Permanently removes the space for all members. Cannot be undone." + **"Delete"**

## Share-to-Space modal
- Title: **"Share {kind} to a Collab Space"**
- Entity preview: **"[{Kind}] {name}"**
- Pick prompt: **"Pick a space:"**
- States: **"Sign in to share to a Collab Space."** · **"Loading your spaces…"** · **"You haven't joined any Collab Spaces yet. Create or join one from the Collab tab."**
- Team-member hint: **"The identity prompt and command permissions become visible to every member of the space."**
- Actions: **"Cancel"** · **"Share"** (→ "Sharing…") / **"Publish"**
- Success: **"✓ Shared to {space}"** / "Members of this space can now pull it into their local projects." + **"Done"**

## Notifications & search `[VISION]`
- Toast examples: **"New mention in #{channel}"** · **"{name} shared a task"** · **"{agent} replied in #{channel}"** · **"{name} joined {space}"**
- Search placeholder: **"Search messages, people, and tasks"**; filters **"This space"** / **"This channel"** / **"From {@name}"** / **"Last 7 days"**; empty **"No results."**

## Agent-in-chat `[VISION]`
- Invoke feedback: **"Invoking {@agent}…"**
- Agent presence sub-states: **"working…"** / **"idle"**
- Empty roster w/ agents: `[suggested]` "Add an agent team member to let it join the conversation."
