import fetch from 'node-fetch';
import { randomBytes } from 'crypto';
import { CollabError, CollabIdentity, CollabProfile } from './types.js';

type FireValue = Record<string, unknown>;
type FireDocument = { name: string; fields?: Record<string, FireValue> };

export function encode(value: unknown): FireValue {
  if (value === null) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object' && value) return { mapValue: { fields: Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)])) } };
  throw new CollabError('INVALID_COLLAb_VALUE', 'Cannot encode an undefined Collab field.');
}

export function decode(value: FireValue | undefined): unknown {
  if (!value) return undefined;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return ((value.arrayValue as { values?: FireValue[] }).values || []).map(decode);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(((value.mapValue as { fields?: Record<string, FireValue> }).fields || {})).map(([k, v]) => [k, decode(v)]));
  return undefined;
}

function docData(document: FireDocument): Record<string, unknown> {
  const fields = document.fields || {};
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

function docId(name: string): string { return name.split('/').pop() || ''; }

function fieldsForPaths(values: Record<string, unknown>): Record<string, FireValue> {
  const root: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const segments = path.split('.');
    let target = root;
    for (const segment of segments.slice(0, -1)) {
      const existing = target[segment];
      target[segment] = existing && typeof existing === 'object' ? existing : {};
      target = target[segment] as Record<string, unknown>;
    }
    target[segments[segments.length - 1]] = value;
  }
  return Object.fromEntries(Object.entries(root).map(([key, value]) => [key, encode(value)]));
}

export class CollabFirestore {
  private readonly root: string;
  constructor(private readonly profile: CollabProfile, private readonly token: string, readonly identity: CollabIdentity) {
    this.root = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(profile.firebase.projectId)}/databases/(default)/documents`;
  }

  private async request<T>(path: string, init?: Parameters<typeof fetch>[1]): Promise<T> {
    const response = await fetch(`${this.root}${path}`, { ...init, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) } });
    if (!response.ok) {
      if (response.status === 401) throw new CollabError('COLLAB_AUTH_REQUIRED', 'Collab login expired. Run `maestro collab auth login`.');
      if (response.status === 403) throw new CollabError('COLLAB_PERMISSION_DENIED', 'Firebase denied this Collab operation.');
      if (response.status === 404) throw new CollabError('COLLAB_NOT_FOUND', 'Collab resource was not found.');
      throw new CollabError('COLLAB_FIRESTORE_ERROR', 'Firebase rejected the Collab operation.');
    }
    return response.json() as Promise<T>;
  }

  async get(path: string): Promise<{ id: string; data: Record<string, unknown> } | null> {
    try { const document = await this.request<FireDocument>(`/${path}`); return { id: docId(document.name), data: docData(document) }; }
    catch (error) { if (error instanceof CollabError && error.code === 'COLLAB_NOT_FOUND') return null; throw error; }
  }

  async list(parent: string, collectionId: string, options: { limit?: number; orderBy?: string; descending?: boolean; equals?: [string, unknown]; arrayContains?: [string, string]; filters?: Array<{ field: string; op: 'EQUAL' | 'ARRAY_CONTAINS'; value: unknown }> } = {}): Promise<Array<{ id: string; data: Record<string, unknown> }>> {
    const filters = options.filters || (options.equals ? [{ field: options.equals[0], op: 'EQUAL' as const, value: options.equals[1] }] : options.arrayContains ? [{ field: options.arrayContains[0], op: 'ARRAY_CONTAINS' as const, value: options.arrayContains[1] }] : []);
    const clauses = filters.map((filter) => ({ fieldFilter: { field: { fieldPath: filter.field }, op: filter.op, value: encode(filter.value) } }));
    const where = clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : { compositeFilter: { op: 'AND', filters: clauses } };
    const structuredQuery: Record<string, unknown> = { from: [{ collectionId }], limit: options.limit || 50 };
    if (where) structuredQuery.where = where;
    if (options.orderBy) structuredQuery.orderBy = [{ field: { fieldPath: options.orderBy }, direction: options.descending ? 'DESCENDING' : 'ASCENDING' }];
    const rows = await this.request<Array<{ document?: FireDocument }>>(`/${parent}:runQuery`, { method: 'POST', body: JSON.stringify({ structuredQuery }) });
    return rows.filter((row) => row.document).map((row) => ({ id: docId(row.document!.name), data: docData(row.document!) }));
  }

  async create(parent: string, collectionId: string, values: Record<string, unknown>, id = randomBytes(16).toString('base64url')): Promise<string> {
    const collectionPath = parent ? `/${parent}/${collectionId}` : `/${collectionId}`;
    await this.request(`${collectionPath}?documentId=${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify({ fields: Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encode(value)])) }) });
    return id;
  }

  async patch(path: string, values: Record<string, unknown>): Promise<void> {
    const keys = Object.keys(values).filter((key) => values[key] !== undefined);
    const query = keys.map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&');
    await this.request(`/${path}?${query}`, { method: 'PATCH', body: JSON.stringify({ name: `${this.root.slice(this.root.indexOf('/v1/') + 4)}/${path}`, fields: fieldsForPaths(Object.fromEntries(keys.map((key) => [key, values[key]]))) }) });
  }

  async delete(path: string): Promise<void> { await this.request(`/${path}`, { method: 'DELETE' }); }

  async createInvite(spaceId: string, kind: 'link' | 'code', inviteId: string, managementId: string, maxUses: number, expiresAt: Date): Promise<void> {
    // managementId is safe metadata visible only to invite managers. It is not
    // a document path or authorization input, so leaking it cannot redeem an
    // invitation; the opaque document id remains the sole bearer capability.
    await this.create(`collabSpaces/${spaceId}`, 'invites', { spaceId, kind, managementId, maxUses, useCount: 0, redeemedByUids: [], expiresAt, revokedAt: null, createdBy: this.identity.uid, createdAt: new Date(), updatedAt: new Date() }, inviteId);
  }

  async addMember(spaceId: string): Promise<void> {
    const rootName = `projects/${this.profile.firebase.projectId}/databases/(default)/documents/collabSpaces/${spaceId}`;
    const member = { uid: this.identity.uid, displayName: this.identity.displayName, email: this.identity.email, photoUrl: null, role: 'member', joinedAt: new Date() };
    await this.request(':commit', { method: 'POST', body: JSON.stringify({ writes: [{
      update: { name: rootName, fields: { members: encode({ [this.identity.uid]: member }) } },
      updateMask: { fieldPaths: [`members.${this.identity.uid}`] },
      updateTransforms: [{ fieldPath: 'memberIds', appendMissingElements: { values: [encode(this.identity.uid)] } }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    }] }) });
  }

  async removeMember(spaceId: string, uid: string): Promise<void> {
    const rootName = `projects/${this.profile.firebase.projectId}/databases/(default)/documents/collabSpaces/${spaceId}`;
    await this.request(':commit', { method: 'POST', body: JSON.stringify({ writes: [{
      // An update mask with no value for this field deletes exactly that map key.
      update: { name: rootName, fields: {} }, updateMask: { fieldPaths: [`members.${uid}`] },
      updateTransforms: [{ fieldPath: 'memberIds', removeAllFromArray: { values: [encode(uid)] } }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    }] }) });
  }

  async recordFanOut(spaceId: string, collection: string, id: string, uidsField: string, linkedField?: string, localId?: string): Promise<void> {
    const name = `projects/${this.profile.firebase.projectId}/databases/(default)/documents/collabSpaces/${spaceId}/${collection}/${id}`;
    const fields = linkedField && localId ? { [linkedField]: encode({ [this.identity.uid]: localId }) } : {};
    await this.request(':commit', { method: 'POST', body: JSON.stringify({ writes: [{
      update: { name, fields }, ...(linkedField && localId ? { updateMask: { fieldPaths: [`${linkedField}.${this.identity.uid}`] } } : {}),
      updateTransforms: [{ fieldPath: uidsField, appendMissingElements: { values: [encode(this.identity.uid)] } }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
    }] }) });
  }

  async redeemInvite(spaceId: string, inviteId: string): Promise<'joined' | 'already_member'> {
    // A current member can read the root; use that only for idempotency. A
    // recipient cannot read a private root before the atomic transaction.
    try {
      const space = await this.get(`collabSpaces/${spaceId}`);
      if (space && Array.isArray(space.data.memberIds) && space.data.memberIds.includes(this.identity.uid)) return 'already_member';
    } catch (error) { if (!(error instanceof CollabError && error.code === 'COLLAB_PERMISSION_DENIED')) throw error; }
    try {
      const begun = await this.request<{ transaction: string }>(':beginTransaction', { method: 'POST', body: '{}' });
      const invitePath = `projects/${this.profile.firebase.projectId}/databases/(default)/documents/collabSpaces/${spaceId}/invites/${inviteId}`;
      const read = await this.request<Array<{ found?: FireDocument }>>(':batchGet', { method: 'POST', body: JSON.stringify({ documents: [invitePath], transaction: begun.transaction }) });
      const inviteDoc = read[0]?.found;
      if (!inviteDoc) throw new Error('not accepted');
      const invite = docData(inviteDoc);
      const uses = Number(invite.useCount);
      const redeemed = Array.isArray(invite.redeemedByUids) ? invite.redeemedByUids.filter((value): value is string => typeof value === 'string') : [];
      if (invite.spaceId !== spaceId || invite.revokedAt || !(invite.expiresAt && Date.parse(String(invite.expiresAt)) > Date.now()) || !Number.isInteger(uses) || uses >= Number(invite.maxUses) || redeemed.includes(this.identity.uid)) throw new Error('not accepted');
      const rootName = `projects/${this.profile.firebase.projectId}/databases/(default)/documents/collabSpaces/${spaceId}`;
      const inviteName = `${rootName}/invites/${inviteId}`;
      const claimName = `${rootName}/inviteClaims/${this.identity.uid}`;
      const member = { uid: this.identity.uid, displayName: this.identity.displayName, email: this.identity.email, photoUrl: null, role: 'member', joinedAt: new Date() };
      await this.request(':commit', { method: 'POST', body: JSON.stringify({ transaction: begun.transaction, writes: [
        { update: { name: inviteName, fields: Object.fromEntries(Object.entries({ ...invite, useCount: uses + 1, redeemedByUids: [...redeemed, this.identity.uid], updatedAt: new Date() }).map(([key, value]) => [key, encode(value)])) } },
        { update: { name: claimName, fields: Object.fromEntries(Object.entries({ spaceId, inviteId, uid: this.identity.uid, createdAt: new Date() }).map(([key, value]) => [key, encode(value)])) }, currentDocument: { exists: false } },
        { update: { name: rootName, fields: { members: encode({ [this.identity.uid]: member }) } }, updateMask: { fieldPaths: [`members.${this.identity.uid}`] }, updateTransforms: [{ fieldPath: 'memberIds', appendMissingElements: { values: [encode(this.identity.uid)] } }, { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }] },
      ] }) });
      return 'joined';
    } catch { throw new CollabError('INVITE_NOT_ACCEPTED', 'Invitation was not accepted.'); }
  }
}
