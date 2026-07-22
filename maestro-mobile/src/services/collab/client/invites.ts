// src/services/collab/client/invites.ts — private-space invitations, ported from
// maestro-ui CollabSpaceClient.{createInvite,listInvites,revokeInvite,redeemInvite}.
// The invite id is the only bearer secret; redeem is a single transaction so the
// rules' "increment + immutable claim + membership write together" holds.
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';

import { type CollabSpaceInvite, type CreateInviteInput } from '../types';
import {
  generateInviteId,
  isInviteId,
  normalizeInviteId,
} from '../spaceInvite';
import {
  COLLAB,
  type DocData,
  arrayUnion,
  asEnum,
  asNumber,
  asString,
  asStringArray,
  db,
  millis,
  serverTimestamp,
  tsFromMillis,
  withRetry,
} from './firestore';

type User = Pick<FirebaseAuthTypes.User, 'uid' | 'displayName' | 'email' | 'photoURL'>;

function inviteFromData(id: string, d: DocData): CollabSpaceInvite {
  return {
    id,
    spaceId: asString(d.spaceId),
    kind: asEnum(d.kind, ['link', 'code'] as const, 'link'),
    maxUses: asNumber(d.maxUses, 1),
    useCount: asNumber(d.useCount, 0),
    redeemedByUids: asStringArray(d.redeemedByUids),
    expiresAtMs: millis(d.expiresAt),
    revokedAtMs: millis(d.revokedAt),
    createdBy: asString(d.createdBy),
    createdAtMs: millis(d.createdAt),
    updatedAtMs: millis(d.updatedAt),
  };
}

export const InvitesClient = {
  async create(
    user: User,
    spaceId: string,
    input: CreateInviteInput,
  ): Promise<CollabSpaceInvite> {
    if (!Number.isInteger(input.maxUses) || input.maxUses < 1 || input.maxUses > 1000) {
      throw new Error('Invite use limit must be between 1 and 1,000.');
    }
    const inviteId = generateInviteId(input.kind);
    const ref = db().collection(COLLAB).doc(spaceId).collection('invites').doc(inviteId);
    const now = serverTimestamp();
    await withRetry(() =>
      ref.set({
        spaceId,
        kind: input.kind,
        maxUses: input.maxUses,
        useCount: 0,
        redeemedByUids: [],
        expiresAt: tsFromMillis(input.expiresAtMs),
        revokedAt: null,
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const fresh = await withRetry(() => ref.get());
    const data = fresh.data();
    if (!fresh.exists() || !data) throw new Error('Invite was created but could not be read back.');
    return inviteFromData(fresh.id, data);
  },

  async list(spaceId: string): Promise<CollabSpaceInvite[]> {
    const snap = await withRetry(() =>
      db()
        .collection(COLLAB)
        .doc(spaceId)
        .collection('invites')
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get(),
    );
    return snap.docs.map((doc) => inviteFromData(doc.id, doc.data() as DocData));
  },

  async revoke(spaceId: string, inviteId: string): Promise<void> {
    await withRetry(() =>
      db()
        .collection(COLLAB)
        .doc(spaceId)
        .collection('invites')
        .doc(inviteId)
        .update({ revokedAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    );
  },

  /** Redeems one invite in a transaction (link replay / client bypass safe). */
  async redeem(user: User, spaceId: string, rawInviteId: string): Promise<void> {
    const inviteId = normalizeInviteId(rawInviteId);
    if (!isInviteId(inviteId)) throw new Error('Enter a valid invite link or join code.');
    const spaceRef = db().collection(COLLAB).doc(spaceId);
    const inviteRef = spaceRef.collection('invites').doc(inviteId);
    const claimRef = spaceRef.collection('inviteClaims').doc(user.uid);

    await withRetry(() =>
      db().runTransaction(async (tx) => {
        const inviteSnap = await tx.get(inviteRef);
        const data = inviteSnap.data();
        if (!inviteSnap.exists() || !data) {
          throw new Error('This invitation is invalid or has been revoked.');
        }
        const invite = inviteFromData(inviteSnap.id, data);
        const expired = invite.expiresAtMs !== null && invite.expiresAtMs <= Date.now();
        if (invite.revokedAtMs || expired) {
          throw new Error('This invitation has expired or was revoked.');
        }
        if (invite.useCount >= invite.maxUses || invite.redeemedByUids.includes(user.uid)) {
          throw new Error('This invitation has reached its use limit.');
        }
        const now = serverTimestamp();
        tx.update(inviteRef, {
          useCount: invite.useCount + 1,
          redeemedByUids: [...invite.redeemedByUids, user.uid],
          updatedAt: now,
        });
        tx.set(claimRef, { spaceId, inviteId, uid: user.uid, createdAt: now });
        tx.update(spaceRef, {
          memberIds: arrayUnion(user.uid),
          [`members.${user.uid}`]: {
            uid: user.uid,
            displayName: user.displayName,
            email: user.email,
            photoUrl: user.photoURL,
            role: 'member',
            joinedAt: now,
          },
          updatedAt: now,
        });
      }),
    );
  },
};
