import {
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
  type Unsubscribe,
} from 'firebase/database';
import { getFirebaseDatabase } from './config';

interface FocusState {
  spaceId: string | null;
  channelId: string | null;
  section: string;
  visible: boolean;
}

function connectionId(uid: string, scope = 'legacy'): string {
  const key = `maestro.collabPresence.${scope}.${uid}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const generated = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, generated);
    return generated;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * RTDB-backed, connection-scoped presence. Separate connection nodes prevent
 * one tab closing from marking a user offline while another tab remains open.
 */
export class CollabPresence {
  constructor(private readonly scope = 'legacy') {}
  private uid: string | null = null;
  private id: string | null = null;
  private focus: FocusState = { spaceId: null, channelId: null, section: 'messages', visible: false };
  private connected = false;
  private connectionUnsub: Unsubscribe | null = null;
  private publishedSpaceId: string | null = null;

  start(uid: string): void {
    if (this.uid === uid) return;
    this.stop();
    this.uid = uid;
    this.id = connectionId(uid, this.scope);
    this.connectionUnsub = onValue(ref(getFirebaseDatabase(), '.info/connected'), (snapshot) => {
      this.connected = snapshot.val() === true;
      if (this.connected) void this.publish();
    });
  }

  setFocus(spaceId: string | null, channelId: string | null, visible: boolean, section = 'messages'): void {
    this.focus = { spaceId, channelId, section, visible };
    if (this.connected) void this.publish();
  }

  stop(): void {
    this.connectionUnsub?.();
    this.connectionUnsub = null;
    const uid = this.uid;
    const id = this.id;
    const publishedSpaceId = this.publishedSpaceId;
    this.uid = null;
    this.id = null;
    this.connected = false;
    this.publishedSpaceId = null;
    if (!uid || !id) return;
    const database = getFirebaseDatabase();
    void remove(ref(database, `presence/${uid}/connections/${id}`));
    if (publishedSpaceId) void remove(ref(database, `spacePresence/${publishedSpaceId}/${uid}/connections/${id}`));
  }

  private async publish(): Promise<void> {
    const uid = this.uid;
    const id = this.id;
    if (!uid || !id || !this.connected) return;
    const database = getFirebaseDatabase();
    const userRef = ref(database, `presence/${uid}/connections/${id}`);
    await onDisconnect(userRef).remove();
    await set(userRef, { online: true, lastActive: serverTimestamp() });

    const nextSpaceId = this.focus.spaceId;
    if (this.publishedSpaceId && this.publishedSpaceId !== nextSpaceId) {
      await remove(ref(database, `spacePresence/${this.publishedSpaceId}/${uid}/connections/${id}`));
      this.publishedSpaceId = null;
    }
    if (!nextSpaceId) return;

    const spaceRef = ref(database, `spacePresence/${nextSpaceId}/${uid}/connections/${id}`);
    // Register server-side cleanup before declaring this connection active.
    await onDisconnect(spaceRef).remove();
    await set(spaceRef, {
      focus: this.focus.section === 'messages'
        ? this.focus.channelId ?? 'section:messages'
        : `section:${this.focus.section}`,
      visible: this.focus.visible,
      lastActive: serverTimestamp(),
    });
    this.publishedSpaceId = nextSpaceId;
  }
}
