import fetch, { type RequestInit } from 'node-fetch';
import { readFileSync } from 'node:fs';
import { api } from '../api.js';
import { CollabError } from './types.js';

const V2_PREFIX = '/api/collab/v2';

type JsonRecord = Record<string, unknown>;

export function parseJsonObject(value: string, label = 'data'): JsonRecord {
  const source = value.startsWith('@') ? readFileSync(value.slice(1), 'utf8') : value;
  try {
    const parsed: unknown = JSON.parse(source);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as JsonRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CollabError('COLLAB_INPUT_NOT_FOUND', `${label} file was not found.`);
    }
    throw new CollabError('COLLAB_INVALID_JSON', `${label} must be a JSON object or @path to a JSON file.`);
  }
}

export function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

function errorDetails(value: unknown): { code: string; message: string; details?: JsonRecord } {
  const body = value && typeof value === 'object' ? value as JsonRecord : {};
  const nested = body.error && typeof body.error === 'object' ? body.error as JsonRecord : undefined;
  const code = String(nested?.code || body.code || body.error || 'COLLAB_V2_REQUEST_FAILED');
  const message = String(nested?.message || body.message || 'Collab V2 request failed.');
  const details = nested?.details && typeof nested.details === 'object'
    ? nested.details as JsonRecord
    : body.details && typeof body.details === 'object' ? body.details as JsonRecord : undefined;
  return { code, message, details };
}

/** Firebase-authenticated client for the local Collab V2 façade. */
export class CollabV2Client {
  constructor(
    private readonly firebaseToken: string,
    private readonly baseUrl = api.getBaseUrl(),
  ) {}

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl.replace(/\/$/, '')}${V2_PREFIX}${path.startsWith('/') ? path : `/${path}`}`;
    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...(this.firebaseToken ? { 'X-Collab-Firebase-Token': this.firebaseToken } : {}),
          ...options.headers,
        },
      });
    } catch (error) {
      throw new CollabError('COLLAB_V2_UNAVAILABLE', error instanceof Error ? error.message : 'Could not reach the Collab V2 façade.');
    }

    const text = await response.text();
    let body: unknown = {};
    if (text) {
      try { body = JSON.parse(text); }
      catch { body = { message: text }; }
    }
    if (!response.ok) {
      const error = errorDetails(body);
      throw new CollabError(error.code, error.message, { status: response.status, ...(error.details || {}) });
    }
    return body as T;
  }

  get<T>(path: string): Promise<T> { return this.request<T>(path); }
  post<T>(path: string, body: JsonRecord): Promise<T> { return this.request<T>(path, { method: 'POST', body: JSON.stringify(body) }); }
  patch<T>(path: string, body: JsonRecord): Promise<T> { return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }); }
  put<T>(path: string, body: JsonRecord): Promise<T> { return this.request<T>(path, { method: 'PUT', body: JSON.stringify(body) }); }
  delete<T>(path: string, body?: JsonRecord): Promise<T> {
    return this.request<T>(path, { method: 'DELETE', ...(body ? { body: JSON.stringify(body) } : {}) });
  }
}
