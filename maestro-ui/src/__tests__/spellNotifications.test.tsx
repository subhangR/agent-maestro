import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

// First JSX render can take seconds when the machine is under load (parallel
// suites); don't let scheduling noise fail a pure render assertion.
vi.setConfig({ testTimeout: 20000 });

// The toast host only needs session names from useMaestroStore — stub the hook
// so the test doesn't drag in the WS/tauri machinery.
vi.mock('../stores/useMaestroStore', () => ({
  useMaestroStore: (selector: (s: any) => any) =>
    selector({ sessions: { s1: { id: 's1', name: 'Refactor bot' } } }),
}));

import { useSpellNotificationsStore } from '../stores/useSpellNotificationsStore';
import { SpellNotificationToasts } from '../components/spells/SpellNotificationToasts';

const initial = useSpellNotificationsStore.getState();

beforeEach(() => {
  useSpellNotificationsStore.setState(initial, true);
  useSpellNotificationsStore.setState({ history: [], toasts: [] });
});

describe('useSpellNotificationsStore (C3)', () => {
  it('notify() adds a toast and a persistent history entry, defaulting to info', () => {
    const id = useSpellNotificationsStore.getState().notify({
      sessionId: 's1', spellId: 'sp1', ruleId: 'r1', message: 'Tests passed',
    });
    const s = useSpellNotificationsStore.getState();
    expect(s.toasts).toHaveLength(1);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({
      id, sessionId: 's1', spellId: 'sp1', ruleId: 'r1',
      message: 'Tests passed', level: 'info', read: false,
    });
  });

  it('dismissToast removes the toast but keeps history', () => {
    const id = useSpellNotificationsStore.getState().notify({ message: 'hi' });
    useSpellNotificationsStore.getState().dismissToast(id);
    expect(useSpellNotificationsStore.getState().toasts).toHaveLength(0);
    expect(useSpellNotificationsStore.getState().history).toHaveLength(1);
  });

  it('caps visible toasts at 4 (oldest dropped) and history at 100', () => {
    for (let i = 0; i < 110; i++) {
      useSpellNotificationsStore.getState().notify({ message: `m${i}` });
    }
    const s = useSpellNotificationsStore.getState();
    expect(s.toasts).toHaveLength(4);
    expect(s.toasts[3].message).toBe('m109');
    expect(s.history).toHaveLength(100);
    expect(s.history[0].message).toBe('m109'); // newest first
  });

  it('markAllRead flips unread entries', () => {
    useSpellNotificationsStore.getState().notify({ message: 'a' });
    useSpellNotificationsStore.getState().notify({ message: 'b' });
    useSpellNotificationsStore.getState().markAllRead();
    expect(useSpellNotificationsStore.getState().history.every((h) => h.read)).toBe(true);
  });
});

describe('SpellNotificationToasts host', () => {
  it('renders nothing when there are no toasts', () => {
    const { container } = render(<SpellNotificationToasts />);
    expect(container.innerHTML).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('renders the notify:progress message with level styling and session name', () => {
    render(<SpellNotificationToasts />);
    act(() => {
      useSpellNotificationsStore.getState().notify({
        sessionId: 's1', spellId: 'sp1', message: 'Build finished', level: 'success',
      });
    });
    const toast = screen.getByRole('status');
    expect(toast.className).toContain('spell-notify-toast--success');
    expect(screen.getByText('Build finished')).toBeTruthy();
    expect(screen.getByText('Refactor bot')).toBeTruthy();
  });

  it('the × button dismisses the toast', () => {
    render(<SpellNotificationToasts />);
    act(() => {
      useSpellNotificationsStore.getState().notify({ message: 'bye' });
    });
    fireEvent.click(screen.getByLabelText('Dismiss notification'));
    expect(screen.queryByText('bye')).toBeNull();
    expect(useSpellNotificationsStore.getState().history).toHaveLength(1);
  });

  it('auto-dismisses after the timeout', () => {
    vi.useFakeTimers();
    try {
      render(<SpellNotificationToasts />);
      act(() => {
        useSpellNotificationsStore.getState().notify({ message: 'transient' });
      });
      expect(useSpellNotificationsStore.getState().toasts).toHaveLength(1);
      act(() => { vi.advanceTimersByTime(6500); });
      expect(useSpellNotificationsStore.getState().toasts).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
