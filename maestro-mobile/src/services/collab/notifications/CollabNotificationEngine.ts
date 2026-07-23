// src/services/collab/notifications/CollabNotificationEngine.ts
//
// Mobile port of maestro-ui/src/notifications/CollabNotificationEngine.ts.
//
// The engine owns the Firestore subscription lifecycle that feeds in-app
// notifications, independent of whatever screen is currently rendered. It
// listens to every space the user belongs to (not just the active one) and
// within each space to every channel, surfacing genuinely-new messages via
// `onNewMessage`.
//
// Key adaptations vs desktop:
//   - No Firestore Timestamp constructor — the engine accepts epoch-ms numbers
//     (the mobile read boundary already normalises them). The `since` guard
//     is a plain number comparison against `createdAtMs`.
//   - `subscribeToNewMessages` callback receives the full message list (same
//     signature as MessagingClient.subscribeToMessages); the engine filters
//     to messages newer than `startMs` itself.
//   - The Unsubscribe type is `() => void` (RN firebase already returns this).
//   - Dependencies are injected so the engine is unit-testable without Firebase.

import type { Channel, CollabSpace, Message } from '../types';
import type { ChannelMeta } from './types';

export type { ChannelMeta };

type Unsubscribe = () => void;

export interface EngineDeps {
  /**
   * Subscribe to all spaces the user belongs to.
   * Calls `cb` immediately with the current list and on every change.
   */
  subscribeToAllSpaces: (
    uid: string,
    cb: (spaces: CollabSpace[]) => void,
    onError?: (err: Error) => void,
  ) => Unsubscribe;

  /**
   * Subscribe to all channels in a space.
   */
  subscribeToChannels: (
    spaceId: string,
    cb: (channels: Channel[]) => void,
    onError?: (err: Error) => void,
  ) => Unsubscribe;

  /**
   * Subscribe to the latest messages in a channel.
   * The engine inspects each delivery for messages newer than `sinceMs`.
   */
  subscribeToMessages: (
    spaceId: string,
    channelId: string,
    cb: (messages: Message[]) => void,
    onError?: (err: Error) => void,
  ) => Unsubscribe;

  /** Called when a genuinely-new, de-duplicated message arrives. */
  onNewMessage: (message: Message, meta: ChannelMeta) => void;

  /** Injectable clock (epoch ms). Defaults to Date.now. */
  now?: () => number;
}

interface SpaceEntry {
  name: string | null;
  channelsUnsub: Unsubscribe;
  /** channelId → { message subscription + channel name } */
  channels: Map<string, { unsub: Unsubscribe; name: string | null }>;
}

export class CollabNotificationEngine {
  private deps: EngineDeps;
  private now: () => number;
  private uid: string | null = null;
  private startMs = 0;
  private spacesUnsub: Unsubscribe | null = null;
  private spaces = new Map<string, SpaceEntry>();
  /** Guards against double-emit of the same message id. */
  private seen = new Set<string>();

  constructor(deps: EngineDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => Date.now());
  }

  isRunning(): boolean {
    return this.uid !== null;
  }

  /** Start listening. Restarting for a different uid tears the old graph down first. */
  start(uid: string): void {
    if (this.uid === uid) return;
    if (this.uid) this.stop();
    this.uid = uid;
    this.startMs = this.now();
    this.spacesUnsub = this.deps.subscribeToAllSpaces(
      uid,
      (spaces) => this.reconcileSpaces(spaces),
    );
  }

  stop(): void {
    if (this.spacesUnsub) this.spacesUnsub();
    this.spacesUnsub = null;
    for (const entry of this.spaces.values()) this.teardownSpace(entry);
    this.spaces.clear();
    this.seen.clear();
    this.uid = null;
  }

  private teardownSpace(entry: SpaceEntry): void {
    for (const ch of entry.channels.values()) ch.unsub();
    entry.channels.clear();
    entry.channelsUnsub();
  }

  private reconcileSpaces(spaces: CollabSpace[]): void {
    const nextIds = new Set(spaces.map((s) => s.id));

    // Removed spaces: tear down.
    for (const [spaceId, entry] of this.spaces) {
      if (!nextIds.has(spaceId)) {
        this.teardownSpace(entry);
        this.spaces.delete(spaceId);
      }
    }

    // Added spaces: subscribe to their channels.
    for (const space of spaces) {
      const existing = this.spaces.get(space.id);
      if (existing) {
        existing.name = space.name ?? existing.name;
        continue;
      }
      const entry: SpaceEntry = {
        name: space.name ?? null,
        channels: new Map(),
        channelsUnsub: () => {},
      };
      this.spaces.set(space.id, entry);
      entry.channelsUnsub = this.deps.subscribeToChannels(space.id, (channels) =>
        this.reconcileChannels(space.id, channels),
      );
    }
  }

  private reconcileChannels(spaceId: string, channels: Channel[]): void {
    const entry = this.spaces.get(spaceId);
    if (!entry) return;
    const nextIds = new Set(channels.map((c) => c.id));

    // Removed channels: tear down message subs.
    for (const [channelId, ch] of entry.channels) {
      if (!nextIds.has(channelId)) {
        ch.unsub();
        entry.channels.delete(channelId);
      }
    }

    // Added channels: subscribe to new messages.
    for (const channel of channels) {
      const existing = entry.channels.get(channel.id);
      if (existing) {
        existing.name = channel.name ?? existing.name;
        continue;
      }
      const record: { unsub: Unsubscribe; name: string | null } = {
        unsub: () => {},
        name: channel.name ?? null,
      };
      entry.channels.set(channel.id, record);
      record.unsub = this.deps.subscribeToMessages(
        spaceId,
        channel.id,
        (messages) => this.handleMessages(spaceId, channel.id, messages),
      );
    }
  }

  private handleMessages(
    spaceId: string,
    channelId: string,
    messages: Message[],
  ): void {
    for (const message of messages) {
      if (this.seen.has(message.id)) continue;
      // Only messages created after we started (no backfill flood).
      // createdAtMs is null while serverTimestamp is pending; treat as "now".
      const createdMs = message.createdAtMs ?? this.now();
      if (createdMs < this.startMs) continue;
      this.seen.add(message.id);

      const entry = this.spaces.get(spaceId);
      const meta: ChannelMeta = {
        spaceId,
        spaceName: entry?.name ?? null,
        channelId,
        channelName: entry?.channels.get(channelId)?.name ?? null,
      };
      this.deps.onNewMessage(message, meta);
    }
  }
}
