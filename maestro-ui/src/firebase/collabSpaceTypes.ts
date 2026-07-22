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

/**
 * A private-space bearer invitation. The document id is the secret; do not
 * add a second plaintext token field to this record.
 */
export type CollabSpaceInviteKind = 'link' | 'code';

export interface CollabSpaceInvite {
  id: string;
  spaceId: string;
  kind: CollabSpaceInviteKind;
  maxUses: number;
  useCount: number;
  redeemedByUids: string[];
  expiresAt: Timestamp | null;
  revokedAt: Timestamp | null;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CreateCollabSpaceInviteInput {
  kind: CollabSpaceInviteKind;
  /** One hour through thirty days; the client enforces this before writing. */
  expiresAt: Timestamp;
  /** Between one and one thousand redemptions. */
  maxUses: number;
}
