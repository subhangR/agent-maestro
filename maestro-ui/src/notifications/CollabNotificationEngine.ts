import { Timestamp, Unsubscribe } from 'firebase/firestore';
import type { Channel, Message } from '../firebase/messagingTypes';
import type { CollabSpace } from '../firebase/collabSpaceTypes';

/**
 * CollabNotificationEngine — owns the Firestore subscription lifecycle that
 * feeds Phase 1 notifications, independent of whatever the UI is showing.
 *
 * It listens to EVERY space the user belongs to (not just the open one), and
 * within each space to every channel, surfacing genuinely-new messages via
 * `onNewMessage`. Classification (mention? muted? focused?) and presentation
 * are deliberately NOT here — the wiring hook consumes `onNewMessage` and runs
 * the pure classifier against live store state. That keeps this class a thin,
 * fake-injectable lifecycle manager.
 *
 * Dependencies are injected so the whole thing is unit-testable without
 * Firebase: the tests drive fake subscribe functions and assert teardown.
 */

export interface SpaceMeta {
  spaceId: string;
  spaceName: string | null;
}

export interface ChannelMeta extends SpaceMeta {
  channelId: string;
  channelName: string | null;
}

export interface EngineDeps {
  subscribeToAllSpaces: (
    uid: string,
    cb: (spaces: CollabSpace[]) => void,
    onError?: (err: Error) => void,
  ) => Unsubscribe;
  subscribeToChannels: (
    spaceId: string,
    cb: (channels: Channel[]) => void,
    onError?: (err: Error) => void,
  ) => Unsubscribe;
  subscribeToNewMessages: (
    spaceId: string,
    channelId: string,
    since: Timestamp,
    cb: (message: Message) => void,
    onError?: (err: Error) => void,
  ) => Unsubscribe;
  /** A new message arrived in a watched channel (already de-duplicated). */
  onNewMessage: (message: Message, meta: ChannelMeta) => void;
  /** Injectable clock (ms). Defaults to Date.now. */
  now?: () => number;
}

interface SpaceEntry {
  name: string | null;
  channelsUnsub: Unsubscribe;
  /** channelId → message subscription + channel name. */
  channels: Map<string, { unsub: Unsubscribe; name: string | null }>;
}

export class CollabNotificationEngine {
  private deps: EngineDeps;
  private now: () => number;
  private uid: string | null = null;
  private startMs = 0;
  private since: Timestamp = Timestamp.fromMillis(0);
  private spacesUnsub: Unsubscribe | null = null;
  private spaces = new Map<string, SpaceEntry>();
  /** Guards against any double-emit of the same message id. */
  private seen = new Set<string>();

  constructor(deps: EngineDeps) {
    this.deps = deps;
    this.now = deps.now ?? (() => Date.now());
  }

  isRunning(): boolean {
    return this.uid !== null;
  }

  start(uid: string): void {
    // Restarting for a different user tears the old graph down first.
    if (this.uid === uid) return;
    if (this.uid) this.stop();
    this.uid = uid;
    this.startMs = this.now();
    // Only messages created after we start count — no backfill flood.
    this.since = Timestamp.fromMillis(this.startMs);
    this.spacesUnsub = this.deps.subscribeToAllSpaces(uid, (spaces) => this.reconcileSpaces(spaces));
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

    // Removed spaces (left / deleted): tear down.
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
      // Set the entry first so channel callbacks can find it.
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

    // Removed channels: tear down their message subs.
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
      const record = { unsub: () => {}, name: channel.name ?? null };
      entry.channels.set(channel.id, record);
      record.unsub = this.deps.subscribeToNewMessages(spaceId, channel.id, this.since, (message) =>
        this.handleMessage(spaceId, channel.id, message),
      );
    }
  }

  private handleMessage(spaceId: string, channelId: string, message: Message): void {
    if (this.seen.has(message.id)) return;
    // Belt-and-suspenders: the query already filters by createdAt > since, but
    // guard against a serverTimestamp edge where createdAt briefly reads null.
    const createdMs = message.createdAt?.toMillis?.() ?? this.now();
    if (createdMs < this.startMs) return;
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
