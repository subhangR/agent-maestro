import { ConfigError, ForbiddenError, NotFoundError, ValidationError } from '../../domain/common/Errors';
import { CollabCredentials, ICollabV2Repository } from '../../domain/collab/CollabV2';

/** Minimal PostgREST adapter. It only ever forwards a Firebase user token and a
 * publishable key; a Supabase service-role key is intentionally unsupported. */
export class SupabaseCollabV2Repository implements ICollabV2Repository {
  constructor(private readonly url = process.env.MAESTRO_SUPABASE_URL?.trim(), private readonly publishableKey = process.env.MAESTRO_SUPABASE_PUBLISHABLE_KEY?.trim()) {}

  isConfigured(): boolean { return Boolean(this.url && this.publishableKey); }

  async rpc<T>(credentials: CollabCredentials, name: string, args: Record<string, unknown> = {}): Promise<T> {
    return this.request<T>(`/rest/v1/rpc/${encodeURIComponent(name)}`, { method: 'POST', body: args }, credentials);
  }

  async select<T>(credentials: CollabCredentials, table: string, query: Record<string, string>): Promise<T[]> {
    const params = new URLSearchParams(query);
    return this.request<T[]>(`/rest/v1/${encodeURIComponent(table)}?${params.toString()}`, { method: 'GET' }, credentials);
  }

  private async request<T>(path: string, init: { method: string; body?: Record<string, unknown> }, credentials: CollabCredentials): Promise<T> {
    if (!this.url || !this.publishableKey) throw new ConfigError('Collab V2 is not configured. Set MAESTRO_SUPABASE_URL and MAESTRO_SUPABASE_PUBLISHABLE_KEY.');
    if (!credentials.firebaseToken) throw new ForbiddenError('A Firebase ID token is required for Collab V2.');
    let response: Response;
    try {
      response = await fetch(`${this.url.replace(/\/$/, '')}${path}`, {
        method: init.method,
        headers: {
          apikey: this.publishableKey,
          Authorization: `Bearer ${credentials.firebaseToken}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      });
    } catch {
      throw new ConfigError('Collab V2 database is unavailable.');
    }
    if (response.ok) return (await response.json()) as T;
    const payload = await response.json().catch(() => ({})) as { message?: string; details?: unknown; code?: string };
    const message = payload.message || 'Collab V2 request failed.';
    if (response.status === 401 || response.status === 403) throw new ForbiddenError(message);
    if (response.status === 404) throw new NotFoundError('Collab resource');
    throw new ValidationError(message, { upstreamCode: payload.code, details: payload.details });
  }
}
