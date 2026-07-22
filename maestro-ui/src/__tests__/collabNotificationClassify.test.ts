import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  classifyIncomingMessage,
  isMentioned,
  previewOf,
  type ClassifyContext,
} from '../notifications/collabNotificationTypes';
import type { Message, MessageMention } from '../firebase/messagingTypes';

function msg(over: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    spaceId: 'space1',
    channelId: 'chan1',
    authorUid: 'other',
    authorDisplayName: 'Other',
    authorPhotoUrl: null,
    content: 'hello',
    createdAt: Timestamp.fromMillis(1000),
    editedAt: null,
    deletedAt: null,
    threadId: null,
    replyCount: 0,
    mentions: [],
    attachments: [],
    clientMsgId: null,
    ...over,
  };
}

function ctx(over: Partial<ClassifyContext> = {}): ClassifyContext {
  return {
    myUid: 'me',
    level: 'all',
    desktopEnabled: false,
    mutedSpaceIds: new Set(),
    mutedChannelIds: new Set(),
    focusedChannelId: null,
    windowVisible: true,
    ...over,
  };
}

const mentionMe: MessageMention = { id: 'me', displayName: 'Me', kind: 'member' };

describe('isMentioned', () => {
  it('detects a member mention of me', () => {
    expect(isMentioned(msg({ mentions: [mentionMe] }), 'me')).toBe(true);
  });
  it('ignores agent mentions with my id', () => {
    expect(isMentioned(msg({ mentions: [{ id: 'me', displayName: 'Me', kind: 'agent' }] }), 'me')).toBe(false);
  });
  it('is false with no mentions', () => {
    expect(isMentioned(msg(), 'me')).toBe(false);
  });
});

describe('classifyIncomingMessage', () => {
  it('is silent for my own message', () => {
    expect(classifyIncomingMessage(msg({ authorUid: 'me' }), ctx())).toEqual({
      isMention: false, track: false, toast: false, desktop: false,
    });
  });

  it('is silent for a deleted message', () => {
    expect(classifyIncomingMessage(msg({ deletedAt: Timestamp.fromMillis(1) }), ctx()).toast).toBe(false);
  });

  it('is fully silent in a muted space', () => {
    const r = classifyIncomingMessage(msg(), ctx({ mutedSpaceIds: new Set(['space1']) }));
    expect(r).toEqual({ isMention: false, track: false, toast: false, desktop: false });
  });

  it('is fully silent in a muted channel', () => {
    const r = classifyIncomingMessage(msg(), ctx({ mutedChannelIds: new Set(['chan1']) }));
    expect(r.track).toBe(false);
    expect(r.toast).toBe(false);
  });

  it("level 'all' toasts and tracks a non-mention", () => {
    const r = classifyIncomingMessage(msg(), ctx({ level: 'all' }));
    expect(r).toMatchObject({ isMention: false, track: true, toast: true });
  });

  it("level 'mentions' tracks but does not toast a non-mention", () => {
    const r = classifyIncomingMessage(msg(), ctx({ level: 'mentions' }));
    expect(r.track).toBe(true);
    expect(r.toast).toBe(false);
  });

  it("level 'mentions' toasts a mention", () => {
    const r = classifyIncomingMessage(msg({ mentions: [mentionMe] }), ctx({ level: 'mentions' }));
    expect(r).toMatchObject({ isMention: true, track: true, toast: true });
  });

  it('suppresses everything for the focused channel (visible)', () => {
    const r = classifyIncomingMessage(
      msg({ mentions: [mentionMe] }),
      ctx({ focusedChannelId: 'chan1', windowVisible: true }),
    );
    expect(r).toEqual({ isMention: true, track: false, toast: false, desktop: false });
  });

  it('does NOT suppress the focused channel when the window is hidden', () => {
    const r = classifyIncomingMessage(
      msg(),
      ctx({ focusedChannelId: 'chan1', windowVisible: false, level: 'all' }),
    );
    expect(r.toast).toBe(true);
  });

  it('fires desktop only when a toast is due, enabled, and the tab is hidden', () => {
    expect(classifyIncomingMessage(msg(), ctx({ desktopEnabled: true, windowVisible: false })).desktop).toBe(true);
    expect(classifyIncomingMessage(msg(), ctx({ desktopEnabled: true, windowVisible: true })).desktop).toBe(false);
    expect(classifyIncomingMessage(msg(), ctx({ desktopEnabled: false, windowVisible: false })).desktop).toBe(false);
  });
});

describe('previewOf', () => {
  it('collapses whitespace and trims', () => {
    expect(previewOf({ content: '  hi   there ', attachments: [] })).toBe('hi there');
  });
  it('truncates long content', () => {
    const long = 'x'.repeat(300);
    const p = previewOf({ content: long, attachments: [] });
    expect(p.length).toBeLessThanOrEqual(140);
    expect(p.endsWith('…')).toBe(true);
  });
  it('describes attachment-only messages', () => {
    expect(previewOf({ content: '', attachments: [{ fileId: 'f', name: 'a', mimeType: 'x', size: 1 }] })).toBe('📎 Attachment');
    expect(previewOf({ content: '', attachments: [
      { fileId: 'f', name: 'a', mimeType: 'x', size: 1 },
      { fileId: 'g', name: 'b', mimeType: 'x', size: 1 },
    ] })).toBe('📎 2 attachments');
  });
  it('falls back for a truly empty message', () => {
    expect(previewOf({ content: '', attachments: [] })).toBe('New message');
  });
});
