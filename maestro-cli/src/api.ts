import fetch, { type RequestInit } from 'node-fetch';
import { config } from './config.js';

export class APIClient {
  constructor(private baseUrl: string = config.apiUrl) {}

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    // Ensure baseUrl doesn't have trailing slash and endpoint starts with /
    const base = this.baseUrl.replace(/\/$/, '');
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const url = `${base}${path}`;

    const maxRetries = config.retries;
    const retryDelay = config.retryDelay;
    // Hook commands set MAESTRO_API_TIMEOUT for fast-fail; default is 30s.
    const REQUEST_TIMEOUT_MS = parseInt(process.env.MAESTRO_API_TIMEOUT || '30000', 10);
    const MAX_TOTAL_MS = 120_000;
    const totalStart = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      // Check total retry timeout
      if (Date.now() - totalStart > MAX_TOTAL_MS) {
        throw new Error(`Request to ${endpoint} exceeded total timeout of ${MAX_TOTAL_MS}ms`);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const sessionId = process.env.MAESTRO_SESSION_ID;
        const response = await fetch(url, {
          ...options,
          signal: controller.signal as any,
          headers: {
            'Content-Type': 'application/json',
            ...(sessionId ? { 'X-Session-Id': sessionId } : {}),
            ...options?.headers,
          },
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          // Read response body as text first (to avoid consuming body multiple times)
          const errorText = await response.text();

          // Try to parse as JSON
          let errorData: Record<string, string> = {};
          try {
            errorData = JSON.parse(errorText);
          } catch (_e) {
            errorData = { message: errorText || `HTTP ${response.status}` };
          }

          const error = new Error(errorData.message || errorData.error || `HTTP ${response.status}`) as Error & {
            response: { status: number; data: Record<string, string>; config: { url: string } };
          };
          error.response = {
            status: response.status,
            data: errorData,
            config: { url }
          };

          // Don't retry on 4xx errors (client errors)
          if (response.status >= 400 && response.status < 500) {
            throw error;
          }

          // Retry on 5xx errors
          lastError = error;
          if (attempt < maxRetries) {
            const delay = retryDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw error;
        }

        if (response.status === 204) {
          return {} as T;
        }

        return await response.json() as T;
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        const err = error as Error & { code?: string; name?: string; response?: unknown };
        lastError = err;

        // Handle abort (timeout)
        if (err.name === 'AbortError') {
          lastError = new Error(`Request to ${endpoint} timed out after ${REQUEST_TIMEOUT_MS}ms`);
          if (attempt < maxRetries) {
            const delay = retryDelay * Math.pow(2, attempt);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw lastError;
        }

        // Retry on network errors
        if (attempt < maxRetries && (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || !err.response)) {
          const delay = retryDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Don't retry on other errors
        throw error;
      }
    }

    // All retries exhausted
    throw lastError;
  }

  get<T>(endpoint: string) {
    return this.request<T>(endpoint);
  }

  post<T>(endpoint: string, body: Record<string, unknown>) {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  patch<T>(endpoint: string, body: Record<string, unknown>) {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  put<T>(endpoint: string, body: Record<string, unknown>) {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  delete<T>(endpoint: string) {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }
}

export const api = new APIClient();
