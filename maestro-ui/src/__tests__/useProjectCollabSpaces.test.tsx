import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CollabSpace } from '../firebase/collabSpaceTypes';
import { useProjectCollabSpaces } from '../hooks/useProjectCollabSpaces';
import { useCollabSpaceStore } from '../stores/useCollabSpaceStore';
import { useFirebaseAuthStore } from '../stores/useFirebaseAuthStore';
import { useJoinedSpacesStore } from '../stores/useJoinedSpacesStore';
import { useProjectStore } from '../stores/useProjectStore';

const USER_ID = 'user-1';
const defaultHydrateRemote = useCollabSpaceStore.getState().hydrateRemoteFromProject;

function collabSpace(id: string, githubUrl: string): CollabSpace {
  const timestamp = { toMillis: () => 1 } as any;
  return {
    id,
    name: id,
    description: '',
    githubUrl,
    githubHost: 'github.com',
    githubOwner: 'owner',
    githubRepo: id,
    visibility: 'private',
    ownerId: USER_ID,
    memberIds: [USER_ID],
    members: {
      [USER_ID]: {
        uid: USER_ID,
        displayName: 'User',
        email: 'user@example.com',
        photoUrl: null,
        role: 'owner',
        joinedAt: timestamp,
      },
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('useProjectCollabSpaces', () => {
  beforeEach(() => {
    useFirebaseAuthStore.setState({ user: { uid: USER_ID } as any });
    useProjectStore.setState({
      activeProjectId: 'alpha',
      projects: [
        {
          id: 'alpha',
          name: 'Alpha',
          workingDir: '/work/alpha',
          createdAt: 1,
          updatedAt: 1,
          environmentId: null,
          githubUrl: 'https://github.com/owner/alpha',
        },
        {
          id: 'beta',
          name: 'Beta',
          workingDir: '/work/beta',
          createdAt: 1,
          updatedAt: 1,
          environmentId: null,
          githubUrl: 'https://github.com/owner/beta',
        },
      ],
    });
    useJoinedSpacesStore.setState({
      spaces: [
        collabSpace('alpha-space', 'github.com/owner/alpha'),
        collabSpace('beta-space', 'github.com/owner/beta'),
      ],
      loading: false,
      error: null,
      uid: USER_ID,
      unsub: null,
    });
    useCollabSpaceStore.setState({
      detectedRemoteByProject: {},
      detectionLoading: {},
      hydrateRemoteFromProject: defaultHydrateRemote,
    });
  });

  it('shows only the active local project\'s repository spaces', async () => {
    const { result } = renderHook(() => useProjectCollabSpaces());

    await waitFor(() => {
      expect(result.current.spaces.map((space) => space.id)).toEqual(['alpha-space']);
    });

    act(() => {
      useProjectStore.setState({ activeProjectId: 'beta' });
    });

    await waitFor(() => {
      expect(result.current.spaces.map((space) => space.id)).toEqual(['beta-space']);
    });
  });
});
