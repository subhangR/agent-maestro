import { DocumentData } from 'firebase/firestore';
import { SpaceDoc, SpaceDocKind } from './spaceShareTypes';
import { createSpaceResourceClient } from './spaceResourceClient';
import {
  asString,
  asStringOrNull,
  asStringArray,
  asStringRecord,
  asEnum,
} from './firestoreUtils';

const DOC_KINDS: readonly SpaceDocKind[] = ['markdown', 'diagram'];

function fromData(id: string, d: DocumentData): SpaceDoc {
  return {
    id,
    spaceId: asString(d.spaceId),
    title: asString(d.title),
    kind: asEnum(d.kind, DOC_KINDS, 'markdown'),
    content: asString(d.content),
    sourceDocId: asStringOrNull(d.sourceDocId),
    sourceProjectId: asStringOrNull(d.sourceProjectId),
    sourceUserId: asStringOrNull(d.sourceUserId),
    linkedLocalIdsByUid: asStringRecord(d.linkedLocalIdsByUid),
    pulledByUids: asStringArray(d.pulledByUids),
    createdBy: asString(d.createdBy),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

const client = createSpaceResourceClient<SpaceDoc>({
  label: 'SpaceDocs',
  segment: 'docs',
  fromData,
  fanOut: { uidsField: 'pulledByUids', linkedField: 'linkedLocalIdsByUid' },
});

export const SpaceDocsClient = {
  subscribe: client.subscribe,
  list: client.list,

  /** Creator/owner-only edit surface — provenance and fan-out are immutable. */
  async update(
    spaceId: string,
    docId: string,
    patch: Partial<Pick<SpaceDoc, 'title' | 'content' | 'kind'>>,
  ): Promise<void> {
    await client.update(spaceId, docId, patch);
  },

  delete: client.delete,

  /**
   * Records that `uid` has materialized this shared doc into local doc
   * `localDocId`. Fan-out fields are the only fields non-creator members
   * may write (enforced by rules, pinned to the caller's own uid).
   */
  async recordPull(spaceId: string, docId: string, uid: string, localDocId: string): Promise<void> {
    await client.recordFanOut(spaceId, docId, uid, localDocId);
  },
};
