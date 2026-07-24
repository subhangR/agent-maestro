import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret, defineString } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { createClient } from '@supabase/supabase-js';

const REGION = 'asia-southeast1';
const SIGNED_URL_LIFETIME_MS = 10 * 60 * 1000;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_FILENAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._()\-]{0,180}$/u;

/**
 * This key is deliberately only bound to trusted Cloud Functions. It must
 * never be added to Vite/Tauri configuration, Firebase client config, or a
 * checked-in env file.
 */
const SUPABASE_SERVICE_ROLE_KEY = defineSecret('SUPABASE_SERVICE_ROLE_KEY');
const SUPABASE_URL = defineString('SUPABASE_URL');
const COLLAB_STORAGE_BUCKET = defineString('COLLAB_STORAGE_BUCKET', { default: '' });

export interface CreateUploadRequest {
  spaceId: string;
  filename: string;
  contentType: string;
}

export interface CreateDownloadRequest {
  spaceId: string;
  objectPath: string;
}

interface CallableAuth {
  uid: string;
  token: Record<string, unknown>;
}

function invalidArgument(message: string): never {
  throw new HttpsError('invalid-argument', message);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalidArgument('Request data must be an object.');
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') invalidArgument(`${field} must be a string.`);
  const trimmed = value.trim();
  if (!trimmed) invalidArgument(`${field} is required.`);
  return trimmed;
}

export function validateSpaceId(value: unknown): string {
  const spaceId = requireString(value, 'spaceId');
  if (!UUID_PATTERN.test(spaceId)) invalidArgument('spaceId must be a UUID.');
  return spaceId.toLowerCase();
}

export function validateFilename(value: unknown): string {
  const filename = requireString(value, 'filename');
  if (!SAFE_FILENAME_PATTERN.test(filename) || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    invalidArgument('filename contains unsupported characters.');
  }
  return filename;
}

export function validateContentType(value: unknown): string {
  const contentType = requireString(value, 'contentType').toLowerCase();
  if (contentType.length > 200 || !/^[a-z0-9][a-z0-9!#$&^_.+\-]*\/[a-z0-9][a-z0-9!#$&^_.+\-]*$/i.test(contentType)) {
    invalidArgument('contentType must be a valid MIME type.');
  }
  return contentType;
}

export function buildObjectPath(spaceId: string, filename: string, id = randomUUID()): string {
  return `spaces/${spaceId}/${id}-${filename}`;
}

export function validateObjectPath(spaceId: string, value: unknown): string {
  const objectPath = requireString(value, 'objectPath');
  const prefix = `spaces/${spaceId}/`;
  if (!objectPath.startsWith(prefix) || objectPath.length === prefix.length || objectPath.includes('..') || objectPath.includes('\\')) {
    invalidArgument('objectPath must identify an object in the requested space.');
  }
  return objectPath;
}

function requireAuthenticatedHuman(auth: CallableAuth | null): string {
  if (!auth) throw new HttpsError('unauthenticated', 'Firebase authentication is required.');
  const firebase = auth.token.firebase;
  const provider = firebase && typeof firebase === 'object'
    ? (firebase as Record<string, unknown>).sign_in_provider
    : undefined;
  if (provider === 'anonymous') {
    throw new HttpsError('permission-denied', 'Anonymous identities cannot access Collab files.');
  }
  return auth.uid;
}

function collabBucket() {
  const bucketName = COLLAB_STORAGE_BUCKET.value();
  return bucketName ? getStorage().bucket(bucketName) : getStorage().bucket();
}

/**
 * Deliberately uses the Supabase service key server-side rather than a caller
 * JWT: Firebase Storage Rules cannot consult Postgres. The query is narrowly
 * scoped to the caller UID and requested space, and the secret is only bound
 * to these callable Functions.
 */
async function assertSpaceMember(spaceId: string, firebaseUid: string): Promise<void> {
  const supabase = createClient(SUPABASE_URL.value(), SUPABASE_SERVICE_ROLE_KEY.value(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('members')
    .select('entity_id')
    .eq('space_id', spaceId)
    .eq('firebase_uid', firebaseUid)
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('Collab storage membership lookup failed.', { spaceId, firebaseUid, error: error.message });
    throw new HttpsError('internal', 'Could not authorize file access.');
  }
  if (!data) {
    throw new HttpsError('permission-denied', 'You are not a member of this Collab space.');
  }
}

/**
 * Creates a signed POST policy for a new, random object below
 * `spaces/{spaceId}/`. POST policy conditions enforce the exact content type
 * and 25 MiB cap at Cloud Storage, rather than trusting client-provided size.
 */
export const createCollabFileUpload = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    secrets: [SUPABASE_SERVICE_ROLE_KEY],
  },
  async (request) => {
    const auth = request.auth ? { uid: request.auth.uid, token: request.auth.token } : null;
    const firebaseUid = requireAuthenticatedHuman(auth);
    const data = requireRecord(request.data);
    const spaceId = validateSpaceId(data.spaceId);
    const filename = validateFilename(data.filename);
    const contentType = validateContentType(data.contentType);
    await assertSpaceMember(spaceId, firebaseUid);

    const objectPath = buildObjectPath(spaceId, filename);
    const expiresAt = new Date(Date.now() + SIGNED_URL_LIFETIME_MS);
    const [upload] = await collabBucket().file(objectPath).generateSignedPostPolicyV4({
      expires: expiresAt,
      fields: { 'Content-Type': contentType },
      conditions: [
        ['content-length-range', 0, MAX_UPLOAD_BYTES],
        ['eq', '$Content-Type', contentType],
      ],
    });

    logger.info('Issued Collab file upload policy.', { spaceId, firebaseUid, objectPath });
    return {
      objectPath,
      upload: { method: 'POST' as const, url: upload.url, fields: upload.fields },
      expiresAt: expiresAt.toISOString(),
      maxBytes: MAX_UPLOAD_BYTES,
    };
  },
);

/** Creates a short-lived signed GET URL after checking live Postgres membership. */
export const createCollabFileDownload = onCall(
  {
    region: REGION,
    timeoutSeconds: 60,
    secrets: [SUPABASE_SERVICE_ROLE_KEY],
  },
  async (request) => {
    const auth = request.auth ? { uid: request.auth.uid, token: request.auth.token } : null;
    const firebaseUid = requireAuthenticatedHuman(auth);
    const data = requireRecord(request.data);
    const spaceId = validateSpaceId(data.spaceId);
    const objectPath = validateObjectPath(spaceId, data.objectPath);
    await assertSpaceMember(spaceId, firebaseUid);

    const expiresAt = new Date(Date.now() + SIGNED_URL_LIFETIME_MS);
    const [url] = await collabBucket().file(objectPath).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    });

    logger.info('Issued Collab file download URL.', { spaceId, firebaseUid, objectPath });
    return { objectPath, url, expiresAt: expiresAt.toISOString() };
  },
);
