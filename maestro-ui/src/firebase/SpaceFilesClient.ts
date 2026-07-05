import { DocumentData, doc, getDoc } from 'firebase/firestore';
import { getDb } from './firestore';
import { SpaceFile } from './spaceShareTypes';
import { createSpaceResourceClient } from './spaceResourceClient';
import {
  asString,
  asStringOrNull,
  asStringArray,
  asNumber,
  withRetry,
} from './firestoreUtils';

/**
 * Shared-files client for a Collab Space.
 *
 * File content lives INLINE in the Firestore doc as base64 (`data`) because
 * the project's Firebase Storage bucket is not provisioned (needs Blaze) —
 * see `spaceShareTypes.ts` for the size caps that keep docs under 1MiB.
 * Uploads go through `SpaceShareClient.shareFile`; this client covers the
 * read/update/delete/download-tracking side.
 */

function fromData(id: string, d: DocumentData): SpaceFile {
  return {
    id,
    spaceId: asString(d.spaceId),
    name: asString(d.name, 'untitled'),
    mimeType: asString(d.mimeType, 'application/octet-stream'),
    size: asNumber(d.size),
    data: asString(d.data),
    caption: asStringOrNull(d.caption),
    sourceUserId: asStringOrNull(d.sourceUserId),
    downloadedByUids: asStringArray(d.downloadedByUids),
    createdBy: asString(d.createdBy),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

const client = createSpaceResourceClient<SpaceFile>({
  label: 'SpaceFiles',
  segment: 'files',
  fromData,
  fanOut: { uidsField: 'downloadedByUids' },
});

export const SpaceFilesClient = {
  subscribe: client.subscribe,
  list: client.list,

  /**
   * Fetches a single shared file (including its inline payload). Returns
   * `null` when the doc no longer exists — message attachments use this to
   * degrade gracefully after the underlying file was deleted.
   */
  async get(spaceId: string, fileId: string): Promise<SpaceFile | null> {
    const snap = await withRetry(() =>
      getDoc(doc(getDb(), 'collabSpaces', spaceId, 'files', fileId)),
    );
    if (!snap.exists()) return null;
    return fromData(snap.id, snap.data());
  },

  /** Only display metadata is editable — never the immutable payload. */
  async update(
    spaceId: string,
    fileId: string,
    patch: Partial<Pick<SpaceFile, 'name' | 'caption'>>,
  ): Promise<void> {
    await client.update(spaceId, fileId, patch);
  },

  delete: client.delete,

  /**
   * Records that `uid` downloaded this file (arrayUnion — idempotent).
   * Download counts are derived from `downloadedByUids.length` on read.
   */
  async recordDownload(spaceId: string, fileId: string, uid: string): Promise<void> {
    await client.recordFanOut(spaceId, fileId, uid);
  },
};

/**
 * Decodes a shared file's inline base64 payload into a Blob typed with its
 * mime type (ready for object URLs / anchor downloads). Throws on a corrupt
 * payload — callers surface that as a user-facing error.
 */
export function spaceFileToBlob(file: SpaceFile): Blob {
  const binary = atob(file.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: file.mimeType || 'application/octet-stream' });
}

/**
 * Encodes a picked browser `File` to a bare base64 string (data-URL prefix
 * stripped) for inline Firestore storage via `SpaceShareClient.shareFile`.
 */
export function encodeFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read the file.'));
    reader.onabort = () => reject(new Error('File read was aborted.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Unexpected file reader result.'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}
