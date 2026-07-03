# Slack + Slack MCP → Designing a Slack-like System on Maestro

> Research report. No feature code. Prepared for the Collab Space / Slack-on-Maestro design effort.
> Date: 2026-07-03. Author: coordinated worker `sess_1783027328469_kksxfbv43`.

## Executive summary

Slack is, at its core, three overlapping systems: (1) a **messaging data model** (workspace → channels/DMs → messages → threads, plus reactions/mentions/presence/read-state), (2) a **real-time delivery layer** (Events API + a WebSocket gateway), and (3) a **platform/app model** (apps, bots, slash commands, webhooks, Block Kit, OAuth scopes) that lets external code participate as a first-class actor in conversations.

Maestro already has the *skeleton* of #1 and #2 on the unmerged `fix/auto-save-architecture` branch: the Firebase **Collab Space** feature (repo-scoped spaces, channels, realtime Firestore messaging, members/roles, plus push-only sharing of tasks/team-members/spells). Messaging and space/membership management are fully built; threads, DMs, reactions, presence, unread state, search, and notifications are **not** — most exist only as reserved fields (`threadId`, `replyCount`) or stubs.

The strategic recommendation: **keep Firestore for human↔human chat (Collab Space) and add a maestro-server-native "agent bus" for agent↔human and agent↔agent messaging**, unifying the two behind a thin API. Then expose a **"Maestro Slack MCP"** — a small set of MCP/CLI tools (list channels, post message, reply in thread, read history, search, react, list members, notify) that lets Claude agents read and write Collab Space channels the same way the official Slack MCP lets Claude read/write a Slack workspace. This turns Maestro's multi-agent orchestration into a Slack-like collaboration surface where agents *are* the bots.

---

## Section 1 — How Slack works (data & domain model)

### 1.1 Core hierarchy

```
Enterprise Grid (org)                     ← optional top tier (large orgs)
  └── Workspace (team)                     ← the unit most people call "a Slack"
        ├── Channel  (public / private)    ← conversation container, type="channel"
        ├── DM       (1:1)                  ← conversation, type="im"
        ├── Group DM (3–8 people)           ← conversation, type="mpim"
        ├── User (member)                   ← + guests (single/multi-channel)
        ├── User Group (@team handles)      ← named, mentionable membership sets
        └── App / Bot                       ← installed integrations
```

Slack's key modeling insight: **channels, DMs, and group DMs are all one entity type — a "conversation"** — distinguished by flags. The `conversations.*` Web API family (`conversations.list`, `.history`, `.replies`, `.members`, `.open`, `.create`) treats them uniformly. Conversation subtypes:

| Type       | `is_channel` | `is_group` | `is_im` | `is_mpim` | Members |
|------------|:---:|:---:|:---:|:---:|---------|
| Public channel  | ✓ | | | | many |
| Private channel | | ✓ | | | many |
| DM (IM)         | | | ✓ | | exactly 2 |
| Group DM (MPIM) | | | | ✓ | 3–8 |

### 1.2 Messages, threads, and identity

- A **message** lives in a conversation and is uniquely keyed by `(channel_id, ts)` where `ts` is a microsecond Unix timestamp string (e.g. `"1719950400.123456"`) that doubles as the message's ID and sort key.
- A **thread** is formed when a reply carries `thread_ts` = the parent message's `ts`. The parent is the "thread root"; replies have both their own `ts` and the shared `thread_ts`. `reply_count`, `reply_users`, `latest_reply` are denormalized onto the root. A reply can be "also sent to channel" (`reply_broadcast`).
- Messages carry `subtype` (e.g. `channel_join`, `bot_message`, `me_message`), optional `blocks` (Block Kit), `attachments` (legacy), `files`, `edited`, and `reactions`.
- Every message has an author: a `user` id **or** a `bot_id`. Bots can also post "as" a custom `username`/`icon` (impersonation-lite).

### 1.3 Reactions, mentions, pins, saves

- **Reactions**: `reactions.add/remove/get`. Stored as `reactions: [{ name: "thumbsup", count, users: [uid...] }]`. Emoji are workspace-scoped (standard + custom).
- **Mentions**: encoded inline in message text as `<@U123>` (user), `<#C123|general>` (channel), `<!subteam^S123>` (user group), and specials `<!here>`, `<!channel>`, `<!everyone>`. Mentions drive notifications.
- **Pins**: `pins.add/list` — per-conversation pinned messages.
- **Saved items / "Save for Later"**: `stars.*` (now the "saved" API) — per-user bookmarks.

### 1.4 Presence, read/unread state

- **Presence** is coarse: `active` | `away`, exposed via `users.getPresence` and `presence_change` real-time events; Slack auto-derives it and clients can force `away`. It is *not* per-channel and *not* "typing." **Typing indicators** are a separate ephemeral real-time signal (`user_typing`).
- **Read/unread state is per-user, per-conversation**, tracked by a "last read" marker (`conversations.mark` sets it to a `ts`). The server computes `unread_count` / `unread_count_display` and `has_unreads` per conversation for the requesting user. Mentions are counted separately (the red badge vs. the bold channel). There is **no global "message read by X" receipt** in channels — read state is private to each user.

### 1.5 Real-time delivery

Slack has evolved through three real-time mechanisms:

1. **RTM API (legacy, deprecated for new apps)** — a single persistent **WebSocket** per client carrying a firehose of events (`message`, `reaction_added`, `user_typing`, `presence_change`, …). Clients called `rtm.connect` to get a WSS URL. Simple but heavy; being retired.
2. **Events API (current default)** — Slack **pushes events to your app over HTTPS webhooks** (you register a request URL; Slack POSTs signed JSON envelopes for subscribed event types). Scales better; no persistent socket to maintain; requires a public HTTPS endpoint.
3. **Socket Mode** — for apps that can't expose a public URL, Slack provides the Events API payloads over an **outbound WebSocket** the app opens to Slack (`apps.connections.open`). Best of both: push semantics without inbound webhooks.

The official desktop/web clients themselves use an internal WebSocket gateway ("flannel"/edge) with lazy hydration of channel/user metadata; the public equivalents are the three above.

### 1.6 Domain ER model (essentials)

```
Workspace(id, name, domain, enterprise_id?)
User(id, workspace_id, name, real_name, email, tz, is_bot, is_admin, presence, profile{...})
UserGroup(id, workspace_id, handle, name, user_ids[])
Conversation(id, workspace_id, name?, is_channel, is_private, is_im, is_mpim,
             topic, purpose, creator, created, is_archived, member_count)
ConversationMember(conversation_id, user_id, date_joined)            -- M:N
Message(channel_id, ts, user|bot_id, text, blocks[], subtype?,
        thread_ts?, reply_count, edited?, files[])                    -- PK (channel_id, ts)
Reaction(channel_id, message_ts, name, user_ids[])
ReadState(user_id, conversation_id, last_read_ts, unread_count, mention_count)  -- per-user
Star/Saved(user_id, channel_id, message_ts, state)
File(id, name, mimetype, url_private, channels[], user_id)
App(id, name, scopes[], bot_user_id?)
```

Key normalization decisions worth stealing: **one conversation table for all chat surfaces**; **messages keyed by (channel, ts)** so ordering and identity are the same field; **read-state is a private per-user side table**, never embedded in the message.

---

## Section 2 — Slack's "main model": the platform / app model

Slack is not just a chat DB; it's a **programmable platform**. The pieces:

### 2.1 Apps & bots
- An **App** is the unit of integration (has an `app_id`, a config, a set of OAuth scopes). An app *may* include a **bot user** (its own `U…`/`bot_id` identity that can be @mentioned, DM'd, and added to channels).
- **Two token classes:**
  - **Bot token (`xoxb-…`)** — acts as the app's bot user; scoped by **bot scopes** (`chat:write`, `channels:history`, `reactions:write`, `app_mentions:read`, …). Same token workspace-wide.
  - **User token (`xoxp-…`)** — acts *on behalf of an installing user*; scoped by **user scopes**; can do things the user can (e.g. search, which bots can't).
  - (Browser session tokens **`xoxc`/`xoxd`** exist but are unofficial; see Section 3.)

### 2.2 OAuth 2.0 + scopes
- Install flow: `oauth/v2/authorize` → user consents to requested `scope`/`user_scope` → exchange `code` at `oauth.v2.access` → receive bot + user tokens. Enterprise Grid adds **org-wide install** and **admin-approved scopes**.
- Scopes are **granular and per-capability**: reading history (`channels:history`, `groups:history`, `im:history`, `mpim:history`), writing (`chat:write`), reacting (`reactions:write`), searching (`search:read`), user info (`users:read`, `users:read.email`), channel management (`channels:manage`), canvases (`canvases:read/write`). **This granular scope map is the single most important thing to copy for a Maestro MCP** — see Section 4.

### 2.3 Interaction surfaces
- **Slash commands** (`/deploy`, `/giphy`) — user types a command; Slack POSTs a payload (command, text, channel, user, `response_url`) to the app; app replies (ephemeral or in-channel), optionally async via `response_url` (valid ~30 min, 5 uses).
- **Incoming webhooks** — a per-channel URL that accepts a POST and posts a message; simplest one-way "notify a channel" primitive.
- **Interactivity** (buttons, selects, modals) — Block Kit interactive components POST an `interaction_payload` with a `trigger_id`; the app opens **modals** (`views.open/update/push`) or updates messages.
- **Events API subscriptions** — declare which events (`message.channels`, `app_mention`, `reaction_added`, `member_joined_channel`, …) Slack should push.
- **App Home**, **shortcuts** (global/message), **workflows/Workflow Builder steps**, **bookmarks**, **canvases**, **lists**.

### 2.4 Block Kit
A JSON UI framework. A message/modal/home tab is an array of **blocks** (`section`, `divider`, `actions`, `context`, `input`, `header`, `image`) containing **elements** (`button`, `static_select`, `datepicker`, `overflow`, `plain_text_input`) with **`block_id`/`action_id`** for routing interactions. This is how apps render rich, interactive UIs without owning the client. **Relevant to Maestro**: an agent posting a "task card" with Approve/Reject buttons is exactly a Block Kit `actions` block; Maestro's UI would be the Block Kit renderer.

### 2.5 The "agentic" turn (2025–2026)
Slack now ships an **official Slack MCP server** and an "Agents & AI Apps" model (agents appear in a dedicated split view, can be `@`-mentioned, and read/write via MCP). This is the direction Maestro is philosophically already in — Maestro's agents are the equivalent of Slack's AI apps, but Maestro *owns the client*, so it can go further (agents as native members, not bolted-on apps).

---

## Section 3 — Slack MCP servers (official + community)

### 3.0 History
Anthropic shipped an early **reference Slack MCP server** in the original `modelcontextprotocol/servers` repo (Nov 2024), then **archived it in May 2025**. It used a **bot token** (`SLACK_BOT_TOKEN`) + `SLACK_TEAM_ID` and exposed ~8 tools (`slack_list_channels`, `slack_post_message`, `slack_reply_to_thread`, `slack_add_reaction`, `slack_get_channel_history`, `slack_get_thread_replies`, `slack_get_users`, `slack_get_user_profile`). It is the cleanest minimal template and is essentially the tool set Maestro should mirror. It is now superseded by:

### 3.1 Official Slack MCP server (`mcp.slack.com`)
Slack-hosted, **not self-hosted**. [docs.slack.dev/ai/slack-mcp-server](https://docs.slack.dev/ai/slack-mcp-server/).

- **Transport:** JSON-RPC 2.0 over **Streamable HTTP** at `https://mcp.slack.com/mcp`. **SSE and Dynamic Client Registration are explicitly unsupported.**
- **Auth:** **Confidential OAuth** for MCP clients (`client_id` + `client_secret`), issuing **user tokens** (acts as the user, not a bot). Authorize `https://slack.com/oauth/v2_user/authorize`, token `https://slack.com/api/oauth.v2.user.access`. Supports RFC 8414 metadata discovery. Only **directory-published or internal apps** may use it (unlisted apps prohibited); subject to workspace admin approval and app IP allowlists.
- **Clients:** Claude.ai, Claude Code, Perplexity, Cursor.
- **Tools (grouped):**

  | Capability | Tool(s) | Scopes |
  |---|---|---|
  | Search messages/files | search messages, search files | `search:read.public/.private/.mpim/.im`, `search:read.files` |
  | Search users / channels / emoji | search users, search channels, search emoji | `search:read.users`, `emoji:read` |
  | Send / draft message | send message, draft message | `chat:write` |
  | Read history / thread | read channel, read thread | `channels:history`, `groups:history`, `mpim:history`, `im:history` |
  | Reactions | add reaction | `reactions:write` |
  | Create conversation | create channel / group DM / IM | `channels:write`, `groups:write`, `mpim:write`, `im:write` |
  | Canvas | create/update canvas, read canvas | `canvases:read`, `canvases:write` |
  | Users | fetch user info, list channel members | `users:read`, `users:read.email`, `channels:read`/`groups:read`/`mpim:read` |

- **Limits:** standard Web API rate tiers (Tier 2–4); special limits on search + send. One user token per OAuth session (no service accounts). Read-heavy is fully supported; write is gated by scopes + admin approval.

### 3.2 Community: **korotovsky/slack-mcp-server** (most popular self-hosted)
[github.com/korotovsky/slack-mcp-server](https://github.com/korotovsky/slack-mcp-server) — "most powerful, no permissions required."

- **Auth (its headline feature): multiple token modes**, including **browser session tokens `xoxc` + `xoxd`** (no app creation / admin approval needed — it rides your existing logged-in session), plus **`xoxp`** user OAuth tokens and **`xoxb`** bot tokens (limited: invited channels only, no search). Supports **GovSlack** (routes to `slack-gov.com`), Enterprise, proxies, custom User-Agent/TLS.
- **Transports:** stdio, **SSE**, HTTP.
- **Safety:** all writes **disabled by default** — `SLACK_MCP_ADD_MESSAGE_TOOL` (posting), `SLACK_MCP_REACTION_TOOL` (reactions), `SLACK_MCP_MARK_TOOL` (mark-read); optional per-channel write whitelist.
- **Resources:** `slack://<workspace>/channels` and `slack://<workspace>/users` as CSV directories (bulk context).
- **Tools (18):**

  | # | Tool | Purpose |
  |---|---|---|
  | 1 | `conversations_history` | messages from a channel/DM, paginated by date or count |
  | 2 | `conversations_replies` | thread replies, cursor pagination |
  | 3 | `conversations_add_message` | post to channel/thread *(off by default)* |
  | 4 | `conversations_search_messages` | search with channel/user/date/content filters |
  | 5 | `channels_list` | list channels, sort/paginate |
  | 6 | `reactions_add` | add emoji reaction *(off by default)* |
  | 7 | `reactions_remove` | remove reaction *(off by default)* |
  | 8 | `users_search` | find users by name/email/display name |
  | 9 | `usergroups_list` | list user groups (+ members) |
  | 10 | `usergroups_create` | create user group |
  | 11 | `usergroups_update` | edit user group metadata |
  | 12 | `usergroups_users_update` | replace group membership |
  | 13 | `usergroups_me` | list/join/leave own groups |
  | 14 | `conversations_unreads` | unread messages across channels, priority-sorted |
  | 15 | `conversations_mark` | mark channel read *(off by default)* |
  | 16 | `saved_list` | "Save for Later" items |
  | 17 | `saved_update` | mark saved item complete / set reminder |
  | 18 | `saved_clear_completed` | bulk-clear completed saved items |

### 3.3 Other community servers
- **zencoderai/slack-mcp-server** — bot-token oriented fork lineage of the archived reference server.
- Numerous re-hosts on PulseMCP / mcp.so / Apify wrapping the above two.

### 3.4 What the ecosystem tells us (design lessons)
1. **A tiny tool surface covers 90% of value**: list channels, read history, read thread, post, reply, react, search, list/get users. Both the archived reference (8 tools) and the official server converge on this set.
2. **Writes must be opt-in and gated.** Every serious server disables posting/reacting/marking by default and gates them behind env flags + channel whitelists. Maestro should do the same for agents.
3. **Two identity models coexist:** bot identity (workspace-wide, limited, safe) vs. user identity (full reach incl. search, but impersonating a human). Maestro agents map naturally to **bot-like identities** but should be able to post *as themselves* (named agent).
4. **Search and unread are the hard parts** (special rate limits, private per-user state) — plan for them explicitly rather than as afterthoughts.

---

## Section 4 — Synthesis: a Slack-like system on Maestro

### 4.1 What Maestro already has (Collab Space, `fix/auto-save-architecture`)

| Slack concept | Collab Space equivalent | Status |
|---|---|---|
| Workspace | **Space** scoped to a GitHub repo (`githubUrl/Owner/Repo`), `public`/`private` | ✅ built |
| Channel | `collabSpaces/{id}/channels/{id}` (`name`, `isDefault`, `position`, `lastMessageAt`) | ✅ built (default `#general` auto-created) |
| Message | `.../channels/{id}/messages/{id}` (`authorUid`, `content`, `createdAt`, `editedAt`, `deletedAt`) | ✅ built (edit + soft-delete + 50/page cursor pagination) |
| Real-time | Firestore `onSnapshot` listeners; `serverTimestamp()` ordering | ✅ built |
| Members / roles | `members[uid]{role: owner\|admin\|member}`, `memberIds[]`; Firestore rules enforce RBAC | ✅ built |
| Auth | Firebase Auth (Google OAuth + email/password) | ✅ built |
| Threads | `threadId` + `replyCount` fields **reserved, unused** | ⛔ not built |
| DMs / Group DMs | — | ⛔ not built |
| Reactions | — | ⛔ not built |
| Presence / typing | static `joinedAt` only | ⛔ not built |
| Unread / read state | — | ⛔ not built |
| Search | — (Firestore can't substring-search `content`) | ⛔ not built |
| Mentions / notifications | — | ⛔ not built |
| Sharing (task/team-member/spell) | `SpaceShareClient` **push-only**; pull/subscribe stubbed | 🟡 write-only |

Fully working: **messaging, channels, space CRUD, membership, RBAC, auth.** The messaging core is genuinely Slack-shaped (soft-delete, edit, pagination, denormalized author name). The gaps are exactly Slack's "next layer": threads, DMs, reactions, presence, unread, search, notifications.

### 4.2 The critical architecture decision: Firestore vs. maestro-server

There are **two backends in play** and they serve different traffic:

- **Firestore** (Collab Space) — great for *human↔human*, cross-machine, cross-network collaboration (each user has their own machine; Firestore gives them a shared cloud store + realtime + auth for free). Weak at: server-authoritative logic, full-text search, and integrating with agents that live inside a local maestro-server.
- **maestro-server** (Express + WebSocket bridge) — already the authoritative store for tasks/sessions/team-members/spells, already has a batched/throttled WebSocket bridge and file-based repos. Great for *agent↔agent* and *agent↔human on the same box*. Weak at: cross-user cloud reach (it's a local/LAN server, per the Tailscale deploy notes).

**Recommendation — a hybrid, unified behind one interface:**

1. **Keep Firestore as the transport for the *human-facing* Collab Space chat** (it already works and solves the cross-user cloud problem Firebase was chosen for). Finish threads/reactions/DMs/unread *in Firestore* — they're all additive schema changes (below).
2. **Add a maestro-server "messages" domain** (`IMessageRepository`, `MessageService`, `/api/spaces/:id/channels/:id/messages`, WebSocket `message:*` events) that mirrors the same channel/message model for **agents**. Agents talk to *maestro-server*, not Firestore directly (they already have the CLI + WS bridge; they shouldn't need Firebase creds).
3. **Bridge the two.** A small sync worker relays maestro-server channel messages ↔ Firestore Collab Space messages for spaces that are "cloud-shared," so an agent posting via CLI shows up in a human's Collab Space and vice-versa. Model messages with a **`source`/`author` discriminator** (`{ kind: 'human'|'agent', id }`) so both sides render authorship correctly. This is the same dual-identity pattern Slack uses (`user` vs `bot_id`).

If cross-user cloud reach is *not* required for v1 (single-user, agents-on-one-box), you can skip Firestore entirely and build the whole thing on maestro-server — simpler, server-authoritative, enables real search. Choose based on whether the primary use case is **distributed human teams** (→ Firestore stays) or **one operator + many agents** (→ maestro-server only). Given Maestro's identity as agent orchestration, **maestro-server-first with optional Firestore mirror** is the cleaner long-term bet.

### 4.3 Reuse vs. build — the missing pieces

| Feature | Recommendation |
|---|---|
| **Threads** | Cheapest win — fields already reserved. Populate `threadId = parentMessageId`; maintain `replyCount`/`lastReplyAt` on the root (Firestore transaction or server increment). Slack's `thread_ts` model maps 1:1. |
| **Reactions** | Add `reactions: Record<emoji, uid[]>` on the message doc (Slack's exact shape). Cheap; no new collection. |
| **DMs / Group DMs** | Model as **channels with a type discriminator** (steal Slack's "everything is a conversation"): add `kind: 'channel'\|'dm'\|'group_dm'` + `memberIds[]` to the channel doc; DMs are just private channels with a canonical membership key (sorted uids). Avoids a parallel schema. |
| **Presence / typing** | Firestore is a poor fit (write amplification). Use **Firebase Realtime Database** `onDisconnect` (Google's documented presence pattern) for humans, and for agents derive presence from **maestro-server session liveness** (a session with an active PTY = online). Typing = ephemeral RTDB/WS signal, optional. |
| **Unread / read state** | Add a **private per-user side collection** (Slack's model): `users/{uid}/readState/{channelId} = { lastReadAt, mentionCount }`. Never embed in the message. Compute `hasUnreads`/badge client-side vs. `channel.lastMessageAt`. |
| **Search** | Firestore can't substring-search. Options: (a) mirror messages into maestro-server and use a local index (SQLite FTS / lunr) — best if going server-first; (b) Algolia/Typesense extension on Firestore; (c) Firestore-only "recent + filter" as a stopgap. Recommend server-side FTS aligned with 4.2. |
| **Mentions / notifications** | Parse `@agent`/`@user`/`#channel` at send time into a `mentions[]` array (Slack encodes inline; a parsed side-array is simpler). On mention, fan out notifications: reuse the existing **`maestro-notify` skill / OpenClaw** path (Telegram/WhatsApp/Slack/Discord) for humans, and **`maestro session prompt <id>`** to actually *wake an agent* when it's `@`-mentioned — this is Maestro's superpower over Slack: a mention can literally invoke the agent. |
| **Sharing pull** | Finish the stubbed `SpaceTasksClient`/`SpaceTeamMembersClient`/`SpaceSpellsClient` read/subscribe + local adopt adapters (call maestro-server REST to create local copies). Independent of chat. |

### 4.4 Proposed "Maestro Slack MCP" (agent/CLI tool surface)

The payoff: give **agents** the same read/write access to Collab Space channels that the Slack MCP gives Claude over a Slack workspace. Because Maestro owns the client and the server, this is a native maestro-server capability exposed **two ways**: as **CLI subcommands** (agents already use the `maestro` CLI) and as an **MCP server** (for external Claude/Cursor clients). Mirror the converged Slack tool set, plus Maestro-native verbs:

| Maestro tool (CLI + MCP) | Slack analog | Notes |
|---|---|---|
| `maestro space list` / `space_list` | `channels_list` (workspace) | list spaces for the repo |
| `maestro channel list <spaceId>` / `channels_list` | `channels_list` | + `kind` filter (channel/dm/group_dm) |
| `maestro message post <spaceId> <channelId> --text` / `message_post` | send message / `conversations_add_message` | **off by default**, gated per Section 3.4; posts as the agent's team-member identity |
| `maestro message reply <...> --thread <msgId>` / `message_reply` | `conversations_replies` + reply_broadcast | thread reply |
| `maestro message history <channelId>` / `conversations_history` | read channel | cursor pagination |
| `maestro thread read <channelId> <rootMsgId>` / `conversations_replies` | read thread | |
| `maestro message search <query>` / `search_messages` | `conversations_search_messages` | needs the search layer (4.3) |
| `maestro react add <msgId> <emoji>` / `reactions_add` | `reactions_add` | off by default |
| `maestro channel members <channelId>` / `members_list` | list channel members | includes agents + humans |
| `maestro user list <spaceId>` / `users_list` | `users_search` | humans + agent personas |
| `maestro message dm <userOrAgentId> --text` / `dm_open` | create IM | agent↔human / agent↔agent DM |
| `maestro notify <target> --text` (exists via skill) | incoming webhook | already available via `maestro-notify`/OpenClaw |
| `maestro mark read <channelId>` / `conversations_mark` | `conversations_mark` | updates per-user readState |

**Design rules carried over from Slack MCP research:**
- **Writes opt-in + whitelisted.** Default to read-only; enable posting/reacting per space or per channel via config, exactly like `SLACK_MCP_ADD_MESSAGE_TOOL`. This dovetails with Maestro's existing `commandPermissions` on team members — posting to a channel is just another gated command group.
- **Bot-style identity.** Agents post as their **team-member persona** (name + avatar), the direct analog of Slack's `bot_id`/custom username. Read authorship off the same `author{kind, id}` discriminator from 4.2.
- **Mention = invoke.** When an agent is `@`-mentioned in a channel, the notification fan-out calls `maestro session prompt <sessionId>` (or spawns one) — turning the chat channel into a control plane for the agent fleet. This is the single most valuable Maestro-specific extension and has no Slack equivalent.
- **Resources for bulk context.** Mirror korotovsky's CSV directory idea: expose `maestro://space/<id>/channels` and `maestro://space/<id>/users` (or CLI `--json`) so an agent can grab the full roster in one call instead of paging.
- **Keep the surface tiny.** ~10 tools, matching the reference server. Resist adding usergroups/canvas/saved until there's demand.

### 4.5 Recommended architecture (one diagram)

```
                 ┌─────────────────────────── Humans (browser / mobile) ──────────────────────────┐
                 │                                                                                  │
        Collab Space UI (Firestore onSnapshot)                                    maestro-notify → Telegram/WhatsApp/Slack/…
                 │  chat, threads, reactions, DMs, unread                                          ▲
                 ▼                                                                                  │ (mention fan-out)
        ┌──────────────────┐        bridge/sync worker        ┌──────────────────────────────────────────────┐
        │  Firestore        │  ◀────────────────────────────▶ │  maestro-server                              │
        │  (Collab Space)   │   messages ⇄ (source=human/agent)│  • IMessageRepository / MessageService       │
        │  human↔human cloud│                                   │  • /api/spaces/:id/channels/:id/messages     │
        └──────────────────┘                                   │  • WebSocket bridge  message:* events         │
                                                                │  • search index (FTS)                         │
                                                                │  • presence = session liveness                │
                                                                └───────────────┬──────────────────────────────┘
                                                                                │ CLI + MCP  (the "Maestro Slack MCP")
                                                                                ▼
                                                     Agents (Claude sessions) — post/read/react/search/@mention→invoke
```

### 4.6 Phasing

1. **Phase 1 (finish the chat core, Firestore):** wire the real `MessagingClient` into `MessagesSection` (remove mocks), add **threads** + **reactions** (reserved-field + additive schema, cheapest wins).
2. **Phase 2 (agent bus, maestro-server):** add the `messages` domain + WS events + CLI verbs so agents can read/post channels **without Firebase creds**; add the Firestore↔server bridge.
3. **Phase 3 (Slack-parity):** DMs/group DMs (channel-with-kind), per-user unread/read-state side collection, presence via RTDB + session liveness.
4. **Phase 4 (search + notifications + MCP):** server-side FTS search, `@mention`→`maestro session prompt` invoke path + `maestro-notify` fan-out, and package the CLI verbs as a standalone **Maestro Slack MCP** server for external clients.
5. **Phase 5 (sharing):** finish the stubbed task/team-member/spell **pull** adapters (orthogonal, can proceed in parallel).

---

## Appendix — key facts to remember

- Slack's uniformity trick: **channels, DMs, group DMs are one "conversation" entity**; **messages keyed by `(channel, ts)`**; **read-state is a private per-user side table**.
- Slack real-time: **RTM (WebSocket, legacy)** → **Events API (HTTPS webhooks, default)** → **Socket Mode (outbound WS)**.
- Platform model = **apps + bots + OAuth granular scopes + slash commands + webhooks + Block Kit + Events API**. The **granular scope map** is the most reusable artifact.
- Official Slack MCP: **Slack-hosted, Streamable HTTP, user-token OAuth, ~14 tools, no SSE/DCR, admin-approved apps only.**
- Community `korotovsky`: **self-hosted, 18 tools, `xoxc/xoxd/xoxp/xoxb` tokens (browser session = no admin approval), writes off by default, DMs/group DMs/threads/GovSlack supported, CSV directory resources.**
- Maestro Collab Space (`fix/auto-save-architecture`): messaging + channels + members + RBAC + auth **built**; threads/DMs/reactions/presence/unread/search/notifications **missing**; sharing **push-only**.
- Biggest Maestro-native opportunity: **`@mention` an agent → `maestro session prompt` invokes it.** Chat becomes the fleet control plane.

### Sources
- [Official Slack MCP Server — Slack Developer Docs](https://docs.slack.dev/ai/slack-mcp-server/)
- [Overview / developing with the Slack MCP Server](https://docs.slack.dev/ai/slack-mcp-server/developing/)
- [modelcontextprotocol/servers (archived reference Slack server)](https://github.com/modelcontextprotocol/servers)
- [korotovsky/slack-mcp-server](https://github.com/korotovsky/slack-mcp-server)
- [zencoderai/slack-mcp-server](https://github.com/zencoderai/slack-mcp-server)
- [Official Slack MCP Server — PulseMCP](https://www.pulsemcp.com/servers/slack)
- [Slack Conversations MCP Server — PulseMCP](https://www.pulsemcp.com/servers/korotovsky-slack-conversations)
- [Introducing the Model Context Protocol — Anthropic](https://www.anthropic.com/news/model-context-protocol)
- Maestro codebase, branch `fix/auto-save-architecture`: `maestro-ui/src/firebase/{CollabSpaceClient,MessagingClient,SpaceShareClient,auth}.ts`, `collabSpaceTypes.ts`, `messagingTypes.ts`, `spaceShareTypes.ts`, `firestore.rules`, `firestore.indexes.json`, `components/space-window/**`, `stores/useCollabSpaceStore.ts`; `docs/COLLAB_SPACE_{BACKEND,UI_UX}_PLAN.md`.
