import { useEffect, useRef } from 'react';
import { openCollabForInviteDeepLink } from '../firebase/spaceInvite';

/** Opens the Collab panel when SPA hosting resolves an invite route to App. */
export function useCollabInviteDeepLink(openCollab: () => void): void {
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || typeof window === 'undefined') return;
    handled.current = true;
    openCollabForInviteDeepLink(window.location.href, openCollab);
  }, [openCollab]);
}
