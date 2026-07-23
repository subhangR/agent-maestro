// src/services/collab/client/shared.ts — read side of share/pull. Lists the
// entities shared into a space (tasks / members / spells / docs / files) and
// fetches one for preview + pull. Collection names + field shapes match the CLI
// (maestro-cli collectionFor: task→tasks, member→teamMembers, spell→spells,
// doc→docs, file→files) so mobile reads exactly what desktop/CLI shared.
//
// The WRITE side (share a local entity out, pull a remote entity into the
// connected maestro-server) goes through the server REST API in the store layer —
// see src/state/collab (share/pull actions) — because the phone's "local" is the
// connected server, not a Firestore write.
import {
  type SharedEntityKind,
  type SharedEntitySummary,
} from '../types';
import {
  COLLAB,
  type DocData,
  type QuerySnapshot,
  asString,
  asStringOrNull,
  db,
  logSubError,
  millis,
} from './firestore';

const COLLECTION_FOR: Record<SharedEntityKind, string> = {
  task: 'tasks',
  member: 'teamMembers',
  spell: 'spells',
  doc: 'docs',
  file: 'files',
};

function titleFor(kind: SharedEntityKind, d: DocData): string {
  switch (kind) {
    case 'task':
    case 'doc':
      return asString(d.title, 'Untitled');
    default:
      return asString(d.name, 'Untitled');
  }
}

function subtitleFor(kind: SharedEntityKind, d: DocData): string | null {
  switch (kind) {
    case 'task':
      return asStringOrNull(d.status);
    case 'member':
      return asStringOrNull(d.role) ?? asStringOrNull(d.model);
    case 'spell':
      return asStringOrNull(d.description);
    case 'doc':
      return asStringOrNull(d.kind);
    case 'file':
      return asStringOrNull(d.mimeType);
    default:
      return null;
  }
}

function summaryFromData(kind: SharedEntityKind, id: string, d: DocData): SharedEntitySummary {
  return {
    id,
    kind,
    title: titleFor(kind, d),
    subtitle: subtitleFor(kind, d),
    sourceUserId: asString(d.sourceUserId ?? d.createdBy),
    createdAtMs: millis(d.createdAt),
    data: d as Record<string, unknown>,
  };
}

function summariesFromQuery(kind: SharedEntityKind, snap: QuerySnapshot): SharedEntitySummary[] {
  return snap.docs.map((doc) => summaryFromData(kind, doc.id, doc.data() as DocData));
}

export const SharedClient = {
  collectionFor(kind: SharedEntityKind): string {
    return COLLECTION_FOR[kind];
  },

  subscribe(
    spaceId: string,
    kind: SharedEntityKind,
    cb: (items: SharedEntitySummary[]) => void,
    onError?: (err: Error) => void,
  ): () => void {
    return db()
      .collection(COLLAB)
      .doc(spaceId)
      .collection(COLLECTION_FOR[kind])
      .orderBy('createdAt', 'desc')
      .limit(200)
      .onSnapshot(
        (snap) => cb(snap ? summariesFromQuery(kind, snap) : []),
        (err) => {
          logSubError(`shared-${kind}`, err);
          onError?.(err);
        },
      );
  },

  async get(
    spaceId: string,
    kind: SharedEntityKind,
    id: string,
  ): Promise<SharedEntitySummary | null> {
    const snap = await db()
      .collection(COLLAB)
      .doc(spaceId)
      .collection(COLLECTION_FOR[kind])
      .doc(id)
      .get();
    const data = snap.data();
    if (!snap.exists() || !data) return null;
    return summaryFromData(kind, snap.id, data as DocData);
  },
};
