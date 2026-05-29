import { Timestamp } from 'firebase/firestore';

export type CollabSpaceVisibility = 'public' | 'private';

export interface CollabSpaceMember {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Timestamp;
}

export interface CollabSpace {
  id: string;
  name: string;
  description: string;
  githubUrl: string;
  githubHost: string;
  githubOwner: string;
  githubRepo: string;
  visibility: CollabSpaceVisibility;
  ownerId: string;
  memberIds: string[];
  members: Record<string, CollabSpaceMember>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateCollabSpaceInput {
  name: string;
  description?: string;
  githubUrl: string;
  githubHost: string;
  githubOwner: string;
  githubRepo: string;
  visibility: CollabSpaceVisibility;
}
