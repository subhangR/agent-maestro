# Maestro Multi-Channel Integration Architecture

## Overview

This document describes the architecture for integrating multi-platform messaging channels (Telegram, WhatsApp, Discord, Slack, Signal, etc.) into the Maestro multi-agent orchestration platform. The integration enables bidirectional communication between Maestro sessions/tasks and messaging platforms.

**Design Decisions:**
- Library-first approach: Fork/copy channel send functions from OpenClaw (no runtime dependency)
- Maestro-managed credentials: All channel config stored in Maestro's configuration
- Project-level channel mapping: One channel/group per Maestro project
- Configurable verbosity: Each channel subscription defines its own detail level
- Custom flexible routing: Bidirectional message flow between channels and Maestro entities

---

## Architecture Diagram

```
                    ┌─────────────────────────────────────────────────┐
                    │                 Maestro Server                   │
                    │                                                  │
                    │  ┌──────────────────────────────────────────┐   │
                    │  │           Domain Event Bus               │   │
                    │  │  notify:task_completed                    │   │
                    │  │  notify:session_failed                    │   │
                    │  │  notify:needs_input                       │   │
                    │  │  notify:progress                          │   │
                    │  │  channel:inbound     ← NEW                │   │
                    │  │  channel:outbound    ← NEW                │   │
                    │  └──────────┬───────────────────┬────────────┘   │
                    │             │                   │                │
                    │  ┌──────────▼──────────┐  ┌────▼─────────────┐  │
                    │  │  ChannelRouter      │  │ WebSocketBridge  │  │
                    │  │  (Event→Channel)    │  │ (→ UI clients)   │  │
                    │  │                     │  └──────────────────┘  │
                    │  │  • Verbosity filter │                        │
                    │  │  • Project→Channel  │                        │
                    │  │  • Inbound routing  │                        │
                    │  └──────────┬──────────┘                        │
                    │             │                                    │
                    │  ┌──────────▼──────────┐                        │
                    │  │  ChannelService     │                        │
                    │  │                     │                        │
                    │  │  send(channel, to,  │                        │
                    │  │       text, opts)   │                        │
                    │  │  getStatus(channel) │                        │
                    │  └──────────┬──────────┘                        │
                    │             │                                    │
                    │  ┌──────────▼──────────────────────────────┐    │
                    │  │         Channel Adapters                │    │
                    │  │                                         │    │
                    │  │  ┌───────────┐  ┌───────────┐          │    │
                    │  │  │ Telegram  │  │ Discord   │          │    │
                    │  │  │ (grammy)  │  │ (carbon)  │          │    │
                    │  │  └───────────┘  └───────────┘          │    │
                    │  │  ┌───────────┐  ┌───────────┐          │    │
                    │  │  │  Slack    │  │ WhatsApp  │          │    │
                    │  │  │ (web-api) │  │ (baileys) │          │    │
                    │  │  └───────────┘  └───────────┘          │    │
                    │  │  ┌───────────┐  ┌───────────┐          │    │
                    │  │  │  Signal   │  │  Matrix   │  ...     │    │
                    │  │  │(signal-cl)│  │(matrix-sdk│          │    │
                    │  │  └───────────┘  └───────────┘          │    │
                    │  └────────────────────────────────────────┘    │
                    └─────────────────────────────────────────────────┘
                                         │
                              ┌──────────┴──────────┐
                              │                     │
                         ┌────▼────┐           ┌────▼────┐
                         │Telegram │           │ Discord │  ...
                         │ Servers │           │ Servers │
                         └─────────┘           └─────────┘
```

---

## Component Design

### 1. Channel Adapters (`src/infrastructure/channels/adapters/`)

Each adapter wraps a platform SDK and implements the `IChannelAdapter` interface.

```typescript
// src/domain/channels/IChannelAdapter.ts

export type ChannelId =
  | "telegram" | "whatsapp" | "discord" | "slack"
  | "signal" | "imessage" | "matrix" | "msteams"
  | "googlechat" | "irc" | "line" | "nostr"
  | "feishu" | "zalo" | "twitch" | "mattermost"
  | "nextcloud-talk";

export type DeliveryMode = "direct" | "session-based";

export interface ChannelCapabilities {
  canSendText: boolean;
  canSendMedia: boolean;
  canSendPolls: boolean;
  canReceive: boolean;
  supportsThreads: boolean;
  supportsReactions: boolean;
  supportsEdit: boolean;
  maxTextLength?: number;
}

export interface OutboundMessage {
  to: string;             // Recipient ID (chat ID, channel ID, phone number)
  text: string;           // Message content
  mediaUrl?: string;      // Optional media attachment
  replyToId?: string;     // Reply to specific message
  threadId?: string;      // Thread/topic ID
  accountId?: string;     // Multi-account support
  format?: "text" | "markdown" | "html";
}

export interface DeliveryResult {
  success: boolean;
  channel: ChannelId;
  messageId?: string;
  error?: string;
  timestamp?: number;
  meta?: Record<string, unknown>;
}

export interface InboundMessage {
  channel: ChannelId;
  from: string;           // Sender ID
  fromName?: string;      // Display name
  text: string;           // Message content
  messageId: string;      // Platform message ID
  chatId: string;         // Chat/channel ID
  threadId?: string;
  replyToId?: string;
  timestamp: number;
  accountId?: string;
  meta?: Record<string, unknown>;
}

export interface IChannelAdapter {
  readonly id: ChannelId;
  readonly capabilities: ChannelCapabilities;
  readonly deliveryMode: DeliveryMode;

  initialize(config: ChannelConfig): Promise<void>;
  sendText(msg: OutboundMessage): Promise<DeliveryResult>;
  sendMedia?(msg: OutboundMessage): Promise<DeliveryResult>;
  sendPoll?(to: string, question: string, options: string[]): Promise<DeliveryResult>;
  startMonitor?(handler: (msg: InboundMessage) => void): Promise<void>;
  stopMonitor?(): Promise<void>;
  getStatus(): Promise<ChannelStatus>;
  dispose(): Promise<void>;
}
```

#### Per-Channel Implementation Examples

**Telegram Adapter** (forked from OpenClaw's `sendMessageTelegram`):
```typescript
// src/infrastructure/channels/adapters/TelegramAdapter.ts
import { Bot } from "grammy";

export class TelegramAdapter implements IChannelAdapter {
  readonly id = "telegram";
  readonly capabilities = {
    canSendText: true, canSendMedia: true, canSendPolls: true,
    canReceive: true, supportsThreads: true, supportsReactions: true,
    supportsEdit: true, maxTextLength: 4096,
  };
  readonly deliveryMode = "direct";

  private bot: Bot | null = null;

  async initialize(config: TelegramConfig) {
    this.bot = new Bot(config.botToken);
    // No bot.start() needed for outbound-only
  }

  async sendText(msg: OutboundMessage): Promise<DeliveryResult> {
    const result = await this.bot!.api.sendMessage(msg.to, msg.text, {
      parse_mode: msg.format === "html" ? "HTML" : "MarkdownV2",
      message_thread_id: msg.threadId ? Number(msg.threadId) : undefined,
      reply_parameters: msg.replyToId ? { message_id: Number(msg.replyToId) } : undefined,
    });
    return {
      success: true, channel: "telegram",
      messageId: String(result.message_id),
      timestamp: result.date * 1000,
    };
  }

  async startMonitor(handler: (msg: InboundMessage) => void) {
    this.bot!.on("message:text", (ctx) => {
      handler({
        channel: "telegram",
        from: String(ctx.from.id),
        fromName: ctx.from.first_name,
        text: ctx.message.text,
        messageId: String(ctx.message.message_id),
        chatId: String(ctx.chat.id),
        threadId: ctx.message.message_thread_id ? String(ctx.message.message_thread_id) : undefined,
        timestamp: ctx.message.date * 1000,
      });
    });
    this.bot!.start();
  }

  // ... getStatus, dispose, etc.
}
```

---

### 2. Channel Service (`src/application/services/ChannelService.ts`)

Manages channel lifecycle, adapter registry, and message dispatch.

```typescript
export interface IChannelService {
  // Lifecycle
  registerAdapter(adapter: IChannelAdapter): void;
  initializeChannel(channelId: ChannelId, config: ChannelConfig): Promise<void>;
  disposeChannel(channelId: ChannelId): Promise<void>;

  // Outbound
  send(channelId: ChannelId, message: OutboundMessage): Promise<DeliveryResult>;
  broadcast(message: OutboundMessage, channels: ChannelId[]): Promise<DeliveryResult[]>;

  // Inbound
  startListening(channelId: ChannelId): Promise<void>;
  stopListening(channelId: ChannelId): Promise<void>;

  // Status
  getChannelStatus(channelId: ChannelId): Promise<ChannelStatus>;
  getAllStatuses(): Promise<Record<ChannelId, ChannelStatus>>;
}
```

---

### 3. Channel Router (`src/application/services/ChannelRouter.ts`)

The router connects Maestro's domain events to channel delivery and handles inbound message routing.

```typescript
export type VerbosityLevel = "silent" | "status" | "progress" | "detailed" | "verbose";

export interface ChannelSubscription {
  id: string;
  projectId: string;
  channelId: ChannelId;
  targetChatId: string;        // Where to send (Telegram group ID, Slack channel, etc.)
  threadId?: string;           // Optional thread within channel
  accountId?: string;          // Which bot account to use
  verbosity: VerbosityLevel;
  eventFilter?: string[];      // Which event types to forward (null = all)
  active: boolean;
}

export interface InboundRoute {
  channelId: ChannelId;
  chatId: string;              // Source chat
  projectId: string;           // Target Maestro project
  sessionId?: string;          // Target session (if direct interaction)
  teamId?: string;             // Target team
}

// Verbosity mapping:
// silent   → nothing (subscription paused)
// status   → task_completed, task_failed, session_completed, session_failed
// progress → status + task_started, progress milestones, needs_input
// detailed → progress + file changes, test results, errors
// verbose  → detailed + all text output from worker sessions
```

#### Event-to-Channel Flow

```
Maestro Event Bus
  │
  ├─ notify:task_completed ──→ ChannelRouter
  │                              │
  │                              ├─ Find subscriptions for event's projectId
  │                              │
  │                              ├─ Filter by verbosity level
  │                              │   (status events pass at "status" and above)
  │                              │
  │                              ├─ Format message for channel
  │                              │   (markdown for Telegram, mrkdwn for Slack, etc.)
  │                              │
  │                              └─ ChannelService.send(channelId, formattedMsg)
  │
  ├─ notify:needs_input ─────→ ChannelRouter
  │                              │
  │                              └─ Send question to channel with reply context
  │                                 (includes sessionId for routing replies back)
  │
  └─ notify:progress ────────→ ChannelRouter
                                 │
                                 └─ Only forward if verbosity >= "progress"
```

#### Inbound Message Flow

```
Channel Platform (e.g., Telegram)
  │
  ├─ User sends message in project group
  │
  └─ TelegramAdapter.onMessage(msg)
       │
       └─ ChannelRouter.handleInbound(msg)
            │
            ├─ Look up InboundRoute for chatId
            │
            ├─ If mapped to a session (needs_input reply):
            │   └─ SessionService.addPrompt(sessionId, msg.text)
            │      (equivalent to `maestro session prompt`)
            │
            ├─ If mapped to a project:
            │   └─ Emit channel:inbound event
            │      Subscribers decide routing
            │
            └─ If contains command prefix (e.g., "/task create ..."):
                └─ Parse and execute Maestro command
                   Return result to channel
```

---

### 4. Channel Configuration

#### Maestro Config Extension

```typescript
// In Config.ts - add channel configuration
export interface ChannelConfig {
  telegram?: {
    accounts: Record<string, { botToken: string }>;
  };
  discord?: {
    accounts: Record<string, { botToken: string }>;
  };
  slack?: {
    accounts: Record<string, { botToken: string; appToken: string }>;
  };
  whatsapp?: {
    accounts: Record<string, { sessionPath: string }>;
  };
  signal?: {
    accounts: Record<string, { apiUrl: string; number: string }>;
  };
  matrix?: {
    accounts: Record<string, { homeserver: string; accessToken: string; userId: string }>;
  };
  // ... more channels
}
```

#### Environment Variables

```bash
# Channel credentials via env vars
MAESTRO_TELEGRAM_BOT_TOKEN=bot123:ABC...
MAESTRO_DISCORD_BOT_TOKEN=MTk...
MAESTRO_SLACK_BOT_TOKEN=xoxb-...
MAESTRO_SLACK_APP_TOKEN=xapp-...
```

#### Subscription Configuration (stored per project)

```json
// ~/.maestro/data/projects/{projectId}/channel-subscriptions.json
{
  "subscriptions": [
    {
      "id": "sub_001",
      "channelId": "telegram",
      "targetChatId": "-1001234567890",
      "accountId": "default",
      "verbosity": "progress",
      "eventFilter": null,
      "active": true
    },
    {
      "id": "sub_002",
      "channelId": "slack",
      "targetChatId": "C0123456789",
      "accountId": "default",
      "verbosity": "status",
      "eventFilter": ["notify:task_completed", "notify:task_failed"],
      "active": true
    }
  ],
  "inboundRoutes": [
    {
      "channelId": "telegram",
      "chatId": "-1001234567890",
      "projectId": "proj_001"
    }
  ]
}
```

---

### 5. Message Formatting

Each channel needs platform-specific formatting:

```typescript
// src/infrastructure/channels/formatters/

export interface IMessageFormatter {
  formatTaskCompleted(task: TaskInfo): string;
  formatTaskFailed(task: TaskInfo, error?: string): string;
  formatTaskBlocked(task: TaskInfo, reason: string): string;
  formatSessionProgress(session: SessionInfo, message: string): string;
  formatNeedsInput(session: SessionInfo, question: string): string;
  formatBroadcast(title: string, body: string): string;
}

// TelegramFormatter uses HTML:
//   <b>Task Completed</b>
//   <code>fix-auth-bug</code> finished successfully.

// SlackFormatter uses mrkdwn:
//   *Task Completed*
//   `fix-auth-bug` finished successfully.

// DiscordFormatter uses Markdown:
//   **Task Completed**
//   `fix-auth-bug` finished successfully.
```

---

### 6. DI Container Integration

```typescript
// In container.ts - wire channel components

// Repositories
const channelConfigRepo = new FileSystemChannelConfigRepository(dataDir);
const channelSubscriptionRepo = new FileSystemChannelSubscriptionRepository(dataDir);

// Adapters (registered dynamically based on config)
const channelAdapters = new Map<ChannelId, IChannelAdapter>();

// Services
const channelService = new ChannelService(channelAdapters, channelConfigRepo, logger);
const channelRouter = new ChannelRouter(
  channelService,
  channelSubscriptionRepo,
  eventBus,
  sessionService,
  logger
);

// Subscribe router to domain events
channelRouter.subscribeToEvents();
```

---

### 7. API Routes (`src/api/channelRoutes.ts`)

```typescript
// Channel management
GET    /channels                          // List all available channels
GET    /channels/:id/status               // Get channel status
POST   /channels/:id/initialize           // Initialize channel with config
DELETE /channels/:id                      // Dispose channel

// Messaging
POST   /channels/:id/send                 // Send message to channel
POST   /channels/broadcast                // Send to multiple channels

// Subscriptions (per project)
GET    /projects/:projectId/subscriptions          // List subscriptions
POST   /projects/:projectId/subscriptions          // Create subscription
PATCH  /projects/:projectId/subscriptions/:subId   // Update subscription
DELETE /projects/:projectId/subscriptions/:subId   // Remove subscription

// Inbound routes
GET    /projects/:projectId/inbound-routes         // List routes
POST   /projects/:projectId/inbound-routes         // Create route
DELETE /projects/:projectId/inbound-routes/:routeId // Remove route
```

---

### 8. CLI Commands (`maestro channel ...`)

```bash
# Channel management
maestro channel list                              # List channels & status
maestro channel status <channelId>                # Detailed channel status
maestro channel init <channelId>                  # Initialize with credentials

# Messaging
maestro channel send <channelId> <to> "<message>" # Send message
maestro channel broadcast "<message>" --channels telegram,slack

# Subscriptions
maestro channel subscribe <channelId> <chatId> --verbosity progress
maestro channel unsubscribe <subscriptionId>
maestro channel subscriptions                     # List all subscriptions

# Inbound routes
maestro channel route <channelId> <chatId> --project <projectId>
maestro channel unroute <routeId>
```

---

## File Structure

```
maestro-server/src/
├── domain/
│   ├── channels/
│   │   ├── IChannelAdapter.ts        # Core adapter interface
│   │   ├── IChannelService.ts        # Service interface
│   │   ├── IChannelRouter.ts         # Router interface
│   │   ├── IChannelConfigRepository.ts
│   │   ├── IChannelSubscriptionRepository.ts
│   │   └── types.ts                  # ChannelId, Message types, etc.
│   └── events/
│       └── DomainEvents.ts           # + channel:inbound, channel:outbound
│
├── application/
│   └── services/
│       ├── ChannelService.ts         # Channel lifecycle & dispatch
│       └── ChannelRouter.ts          # Event→Channel routing
│
├── infrastructure/
│   ├── channels/
│   │   ├── adapters/
│   │   │   ├── TelegramAdapter.ts    # grammy
│   │   │   ├── DiscordAdapter.ts     # @buape/carbon or discord.js
│   │   │   ├── SlackAdapter.ts       # @slack/web-api + @slack/bolt
│   │   │   ├── WhatsAppAdapter.ts    # @whiskeysockets/baileys
│   │   │   ├── SignalAdapter.ts      # signal-cli REST
│   │   │   ├── MatrixAdapter.ts      # matrix-js-sdk
│   │   │   ├── TeamsAdapter.ts       # botbuilder
│   │   │   └── ...
│   │   └── formatters/
│   │       ├── TelegramFormatter.ts
│   │       ├── SlackFormatter.ts
│   │       ├── DiscordFormatter.ts
│   │       └── GenericFormatter.ts
│   └── repositories/
│       ├── FileSystemChannelConfigRepository.ts
│       └── FileSystemChannelSubscriptionRepository.ts
│
└── api/
    └── channelRoutes.ts              # REST API for channels
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Define domain interfaces (`IChannelAdapter`, types)
- [ ] Implement `ChannelService` with adapter registry
- [ ] Implement `ChannelRouter` with event subscription
- [ ] Add channel config to `Config.ts`
- [ ] Wire into DI container

### Phase 2: First Adapters (Telegram + Slack)
- [ ] Fork/adapt Telegram send function from OpenClaw
- [ ] Fork/adapt Slack send function from OpenClaw
- [ ] Implement formatters for both
- [ ] Add outbound-only messaging

### Phase 3: Subscriptions & Routing
- [ ] Implement subscription repository
- [ ] Connect domain events to channel delivery
- [ ] Add verbosity filtering
- [ ] REST API for subscription management
- [ ] CLI commands for channel management

### Phase 4: Inbound (Two-Way)
- [ ] Add inbound monitors for Telegram, Slack
- [ ] Implement inbound routing to sessions
- [ ] Handle `needs_input` → channel → session prompt flow
- [ ] Command parsing in channel messages

### Phase 5: More Channels
- [ ] Discord, WhatsApp, Signal, Matrix adapters
- [ ] Teams, Google Chat, IRC adapters
- [ ] Remaining channels as needed

### Phase 6: Gateway Bridge (Future)
- [ ] Optional: Connect to OpenClaw gateway for channels that need persistent sessions (WhatsApp)
- [ ] Hybrid mode: direct for simple channels, gateway for complex ones

---

## Dependencies to Add

```json
{
  "dependencies": {
    "grammy": "^1.x",
    "@slack/web-api": "^7.x",
    "@slack/bolt": "^4.x",
    "discord.js": "^14.x",
    "@whiskeysockets/baileys": "^6.x",
    "matrix-js-sdk": "^34.x"
  }
}
```

Note: Only install adapters as needed. Use lazy loading to avoid bloating the server for unused channels.
