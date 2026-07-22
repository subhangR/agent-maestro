import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useCollabInviteDeepLink } from '../hooks/useCollabInviteDeepLink';

const originalUrl = window.location.href;

afterEach(() => {
  window.history.replaceState({}, '', originalUrl);
});

describe('useCollabInviteDeepLink', () => {
  it('opens Collab automatically for a valid SPA invite route exactly once', () => {
    window.history.replaceState({}, '', '/space/space_1/join/' + 'A'.repeat(43));
    const open = vi.fn();
    const { rerender } = renderHook(() => useCollabInviteDeepLink(open));
    rerender();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('leaves the current panel alone for ordinary browser routes', () => {
    window.history.replaceState({}, '', '/projects');
    const open = vi.fn();
    renderHook(() => useCollabInviteDeepLink(open));
    expect(open).not.toHaveBeenCalled();
  });
});
