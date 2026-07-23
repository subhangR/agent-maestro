# OpenClaw Channel Architecture Research

## Executive Summary

OpenClaw's channel system is a **plugin-based architecture** where each messaging platform (WhatsApp, Telegram, Discord, Slack, Signal, etc.) is implemented as a `ChannelPlugin` with standardized adapters for outbound messaging, inbound monitoring, configuration, and gateway lifecycle.

**Key Finding: Channels CAN be used independently for outbound messaging.** The send functions (`sendMessageTelegram`, `sendMessageDiscord`, `sendMessageSlack`, `sendMessageWhatsApp`) are completely independent of the gateway server and AI agent runtime. They require only platform credentials and a target recipient ID.

For two-way messaging, the inbound monitors can run without the gateway server but currently depend on the agent/LLM stack for generating replies. Custom reply resolvers can be injected to bypass the AI agent entirely.

---

## 1. Channel Plugin Architecture

### Plugin Structure

Every channel implements the `ChannelPlugin` interface (`src/channels/plugins/types.plugin.ts`):

```typescript
type ChannelPlugin = {
  id: ChannelId;                    // "telegram", "discord", "slack", etc.
  meta: ChannelMeta;                // Display metadata (label, docs, blurb)
  capabilities: ChannelCapabilities; // Feature flags

  // Core adapters:
  config: ChannelConfigAdapter;     // Account resolution & config management
  outbound?: ChannelOutboundAdapter; // Sending messages (text, media, polls)
  gateway?: ChannelGatewayAdapter;   // Lifecycle (start/stop/login/logout)
  setup?: ChannelSetupAdapter;       // Onboarding wizard

  // Optional adapters:
  pairing?: ChannelPairingAdapter;   // DM pairing/allowlisting
  security?: ChannelSecurityAdapter; // DM policies, warnings
  groups?: ChannelGroupAdapter;      // Group mention & policy
  streaming?: ChannelStreamingAdapter;
  threading?: ChannelThreadingAdapter;
  messaging?: ChannelMessagingAdapter;
  directory?: ChannelDirectoryAdapter; // Peer/group listing
  resolver?: ChannelResolverAdapter;   // Target ID resolution
  heartbeat?: ChannelHeartbeatAdapter;
  actions?: ChannelMessageActionAdapter;
  agentTools?: ChannelAgentToolFactory; // Channel-specific agent tools
};
```

### Two Implementation Patterns

1. **Core channels** (Telegram): Code in `src/telegram/`, outbound adapter in `src/channels/plugins/outbound/telegram.ts`. Direct imports from core modules.

2. **Extension channels** (WhatsApp, Discord, Slack, Signal, etc.): Code in `extensions/<channel>/`. Use `PluginRuntime` facade for dependency injection. No direct imports from core.

### Supported Channels

| Channel | Location | Delivery Mode | Auth Method |
|---------|----------|---------------|-------------|
| Telegram | src/telegram/ + extensions/telegram/ | direct | Bot token (BotFather) |
| WhatsApp | extensions/whatsapp/ | gateway | QR code / web login (Baileys) |
| Discord | extensions/discord/ | direct | Bot token |
| Slack | extensions/slack/ | direct | botToken + appToken (Socket Mode) |
| Signal | src/signal/ | direct | signal-cli linked device |
| iMessage | extensions/imessage/ | direct | macOS native (imsg) |
| Matrix | extensions/matrix/ | direct | Access token |
| MS Teams | extensions/msteams/ | direct | Bot Framework |
| Google Chat | extensions/googlechat/ | direct | Chat API |
| IRC | extensions/irc/ | direct | Server + Nick |
| LINE | extensions/line/ | direct | Channel access token |
| Nostr | extensions/nostr/ | direct | Private key |
| Feishu | extensions/feishu/ | direct | App credentials |
| Zalo | extensions/zalo/ | direct | OA credentials |
| Twitch | extensions/twitch/ | direct | OAuth token |
| Mattermost | extensions/mattermost/ | direct | Bot token |
| Nextcloud Talk | extensions/nextcloud-talk/ | direct | App password |

---

## 2. Outbound Message Sending

### ChannelOutboundAdapter Interface

```typescript
type ChannelOutboundAdapter = {
  deliveryMode: "direct" | "gateway" | "hybrid";
  chunker?: ((text: string, limit: number) => string[]) | null;
  chunkerMode?: "text" | "markdown";
  textChunkLimit?: number;
  pollMaxOptions?: number;

  resolveTarget?: (params) => { ok: true; to: string } | { ok: false; error: Error };
  sendText?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendMedia?: (ctx: ChannelOutboundContext) => Promise<OutboundDeliveryResult>;
  sendPayload?: (ctx: ChannelOutboundPayloadContext) => Promise<OutboundDeliveryResult>;
  sendPoll?: (ctx: ChannelPollContext) => Promise<ChannelPollResult>;
};
```

### ChannelOutboundContext (what send functions receive)

```typescript
type ChannelOutboundContext = {
  cfg: OpenClawConfig;       // Full config object
  to: string;                // Recipient ID (phone, chat ID, channel ID)
  text: string;              // Message text
  mediaUrl?: string;         // Media attachment URL
  mediaLocalRoots?: readonly string[];
  gifPlayback?: boolean;
  replyToId?: string | null; // Reply to specific message
  threadId?: string | number | null; // Thread/topic ID
  accountId?: string | null; // Multi-account support
  identity?: OutboundIdentity;
  deps?: OutboundSendDeps;   // Injectable send function overrides (for testing)
  silent?: boolean;
};
```

### OutboundDeliveryResult (what send functions return)

```typescript
type OutboundDeliveryResult = {
  channel: string;           // "telegram", "discord", etc.
  messageId: string;         // Platform message ID
  chatId?: string;
  channelId?: string;
  roomId?: string;
  conversationId?: string;
  timestamp?: number;
  toJid?: string;
  pollId?: string;
  meta?: Record<string, unknown>; // Channel-specific extras
};
```

### Core Delivery Pipeline

The `deliverOutboundPayloads()` function (`src/infra/outbound/deliver.ts`) orchestrates:
1. Write-ahead queue (crash recovery)
2. Plugin hook pipeline (`message_sending` hook can modify/cancel)
3. Channel handler creation via `loadChannelOutboundAdapter(channel)`
4. Text chunking per channel limits
5. Media attachment handling
6. `message_sent` hook notification

### Per-Channel Send Function Dependencies

| Channel | Send Function | Dependencies | Can Run Standalone? |
|---------|--------------|--------------|---------------------|
| Telegram | `sendMessageTelegram` | grammy Bot API, loadConfig | YES - needs bot token only |
| Discord | `sendMessageDiscord` | @buape/carbon REST, discord-api-types | YES - needs bot token only |
| Slack | `sendMessageSlack` | @slack/web-api | YES - needs bot/user token |
| WhatsApp | `sendMessageWhatsApp` | @whiskeysockets/baileys, active WA socket | PARTIALLY - needs running Baileys session |
| Signal | `sendMessageSignal` | signal-cli REST API | YES - needs signal-cli running |
| iMessage | `sendMessageIMessage` | imsg CLI tool | YES - needs macOS + imsg |

---

## 3. Inbound Message Handling

### Common Pipeline (all channels share this flow)

```
[Platform SDK event (webhook/websocket/polling)]
  → Channel-specific message handler
  → Inbound debouncer (batches rapid messages)
  → Build message context (MsgContext / ctxPayload)
  → dispatchReplyWithBufferedBlockDispatcher()
    → dispatchInboundMessageWithBufferedDispatcher()
      → dispatchReplyFromConfig()
        → getReplyFromConfig()        ← AGENT IS INVOKED HERE
          → runPreparedReply()        ← LLM call happens here
```

### Per-Channel Inbound Entry Points

| Channel | Monitor Function | Platform SDK | Connection Type |
|---------|-----------------|--------------|-----------------|
| Telegram | `monitorTelegramProvider` | grammY + @grammyjs/runner | Long-polling or webhook |
| WhatsApp | `monitorWebChannel` | @whiskeysockets/baileys | WebSocket to WA servers |
| Discord | `monitorDiscordProvider` | @buape/carbon | WebSocket gateway |
| Slack | `monitorSlackProvider` | @slack/bolt | Socket Mode WS or HTTP webhook |
| Signal | `monitorSignalProvider` | signal-cli REST | HTTP polling/webhooks |

### Key Insight: Reply Resolver Injection

WhatsApp's `monitorWebChannel` accepts an optional `replyResolver` parameter, allowing custom reply logic without the AI agent. The common pipeline's `dispatchReplyFromConfig` can also be replaced at the extension level since it's accessed through `PluginRuntime.channel.reply.*`.

---

## 4. WebSocket Gateway Protocol

### Overview

The gateway runs at `ws://127.0.0.1:18789` and uses a JSON-RPC-like protocol (version 3) with three frame types:

### Frame Types

**RequestFrame (client → server)**
```json
{ "type": "req", "id": "<uuid>", "method": "<method>", "params": { ... } }
```

**ResponseFrame (server → client)**
```json
{ "type": "res", "id": "<uuid>", "ok": true/false, "payload": { ... }, "error": { ... } }
```

**EventFrame (server → client, push)**
```json
{ "type": "event", "event": "<name>", "payload": { ... }, "seq": 42, "stateVersion": { ... } }
```

### Handshake Sequence

1. Server sends `connect.challenge` event with nonce
2. Client sends `connect` request with client info, auth, capabilities
3. Server responds with `hello-ok` containing features, snapshot, policy

### Key Methods for Channel Integration

**`send` — Send message to any channel:**
```json
{
  "type": "req", "id": "...", "method": "send",
  "params": {
    "to": "recipient-id",
    "message": "Hello!",
    "mediaUrl": "https://...",
    "channel": "telegram",
    "accountId": "default",
    "threadId": "optional",
    "idempotencyKey": "<uuid>"
  }
}
```

**`poll` — Send a poll:**
```json
{
  "type": "req", "id": "...", "method": "poll",
  "params": {
    "to": "recipient",
    "question": "What do you prefer?",
    "options": ["A", "B", "C"],
    "channel": "telegram",
    "idempotencyKey": "<uuid>"
  }
}
```

**`channels.status` — Get all channel status:**
```json
{
  "type": "req", "id": "...", "method": "channels.status",
  "params": { "probe": true, "timeoutMs": 10000 }
}
```

Response includes per-account status: connected, running, lastInboundAt, lastOutboundAt, etc.

**`agent` — Send message through AI agent with channel delivery:**
```json
{
  "type": "req", "id": "...", "method": "agent",
  "params": {
    "message": "user input",
    "to": "recipient",
    "channel": "telegram",
    "deliver": true,
    "idempotencyKey": "<uuid>"
  }
}
```

### Server-Push Events

| Event | Description |
|-------|-------------|
| `agent` | Agent run stream (AI output tokens) |
| `chat` | WebChat deltas/finals |
| `presence` | Connected client updates |
| `health` | System health |
| `tick` | Heartbeat keepalive |
| `shutdown` | Server shutting down |

### Gateway Client

OpenClaw provides a TypeScript `GatewayClient` class (`src/gateway/client.ts`) that handles the handshake, request/response matching, and event subscriptions. This could be used by Maestro to connect to a running OpenClaw gateway.

---

## 5. Configuration & Credentials

### Config File

- Path: `~/.openclaw/config.json5` (or `OPENCLAW_CONFIG_PATH` env var)
- Format: JSON5 (superset of JSON with comments, trailing commas)
- All fields optional — empty `{}` is valid
- Supports `${ENV_VAR}` substitution and `$include` directives

### Minimal Channel Config Examples

**Telegram:**
```json5
{
  channels: {
    telegram: {
      accounts: {
        default: { botToken: "${TELEGRAM_BOT_TOKEN}" }
      }
    }
  }
}
```

**Discord:**
```json5
{
  channels: {
    discord: { token: "${DISCORD_BOT_TOKEN}" }
  }
}
```

**Slack:**
```json5
{
  channels: {
    slack: {
      accounts: {
        default: {
          botToken: "${SLACK_BOT_TOKEN}",
          appToken: "${SLACK_APP_TOKEN}"
        }
      }
    }
  }
}
```

### Credential Storage

- Bot tokens: stored in config.json5 (or via env vars)
- WhatsApp auth: stored in `~/.openclaw/sessions/` (Baileys auth state)
- Signal: requires running signal-cli REST API separately

---

## 6. Extractability Assessment

### Can Channels Be Used as a Standalone Library?

#### Outbound (Sending Messages) — YES

The send functions are self-contained. They need:
- Platform SDK (`grammy`, `@slack/web-api`, `@buape/carbon`, Baileys)
- Bot credentials (token/auth)
- `loadConfig()` — but config can be passed inline
- No gateway, no agent, no session management

**Extraction difficulty: LOW.** The send functions could be wrapped in a thin adapter layer that accepts credentials directly instead of reading from OpenClaw config.

#### Inbound (Receiving Messages) — PARTIALLY

The monitor functions can run without the gateway server. However, they deeply integrate with:
- `loadConfig()` for allowlists, group policies, session routing
- `createInboundDebouncer` for rate limiting
- The full agent reply pipeline (`getReplyFromConfig` → LLM)
- Session management (JSONL transcripts on disk)

**Extraction difficulty: MEDIUM-HIGH.** The monitor functions would need:
1. A custom reply resolver (replacing the AI agent)
2. Simplified config handling (just credentials + routing)
3. An event emitter interface for forwarding messages to Maestro

#### Gateway Integration — RECOMMENDED PATH

Rather than extracting channels, **connecting to a running OpenClaw gateway via WebSocket** is the cleanest integration:
- Use the `send` method to push messages to any channel
- Subscribe to `agent` events for inbound message notifications
- Use `channels.status` for health monitoring
- Full protocol is documented and versioned (v3)
- `GatewayClient` TypeScript class available for reuse

---

## 7. Integration Architecture Options

### Option A: Gateway Client (Recommended for Full Two-Way)

Maestro connects to OpenClaw's WS gateway as a client:
- Send via `send` method (any channel, immediate)
- Receive via `agent` events (inbound messages trigger agent runs)
- Health via `channels.status`
- Session management via `sessions.*` methods

**Pros:** Full feature access, no code extraction, clean separation
**Cons:** Requires running OpenClaw gateway, couples to OpenClaw's agent for inbound

### Option B: Direct Send Library (Best for Outbound-Only)

Extract/wrap the individual send functions:
- `sendMessageTelegram(to, text, opts)` — needs grammy
- `sendMessageDiscord(to, text, opts)` — needs @buape/carbon
- `sendMessageSlack(to, text, opts)` — needs @slack/web-api
- `sendMessageWhatsApp(to, text, opts)` — needs Baileys session

**Pros:** Minimal dependencies, no OpenClaw runtime needed
**Cons:** No inbound, no session management, must manage platform SDKs

### Option C: Hybrid (Gateway + Direct Send)

- Use direct send functions for outbound (notifications, broadcasts)
- Connect to gateway for inbound message routing
- Best of both worlds

### Option D: OpenClaw Plugin

Build a Maestro plugin for OpenClaw that:
- Registers message hooks (`message_received`, `message_sent`)
- Forwards events to Maestro server via HTTP/WS
- Receives send commands from Maestro

**Pros:** Cleanest integration, uses OpenClaw's plugin system
**Cons:** Requires OpenClaw to be running, plugin API coupling

---

## 8. Core Dependencies Map

```
Send Functions (outbound):
  sendMessageTelegram → grammy, loadConfig
  sendMessageDiscord  → @buape/carbon, loadConfig
  sendMessageSlack    → @slack/web-api, loadConfig
  sendMessageWhatsApp → @whiskeysockets/baileys, loadConfig, session auth
  sendMessageSignal   → signal-cli REST API

Monitor Functions (inbound):
  monitorTelegramProvider → grammy, loadConfig, agent pipeline
  monitorDiscordProvider  → @buape/carbon, loadConfig, agent pipeline
  monitorSlackProvider    → @slack/bolt, loadConfig, agent pipeline
  monitorWebChannel       → baileys, loadConfig, agent pipeline

Gateway:
  WS Server → ws library, all channel plugins, agent runtime
  GatewayClient → ws library (client-side, lightweight)

Config:
  loadConfig → json5, fs, path, zod (validation)
  No external service dependencies
```
