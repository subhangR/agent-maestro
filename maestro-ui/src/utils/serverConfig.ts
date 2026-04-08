// Maestro server connection configuration
// Single source of truth for API and WebSocket URLs.
//
// If VITE_WS_URL is not set, it is derived from VITE_API_URL (or its default)
// so the two can never accidentally point at different ports.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4567/api';

function deriveWsUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}`;
  } catch {
    return 'ws://localhost:4567';
  }
}

function deriveServerUrl(apiUrl: string): string {
  try {
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'http://localhost:4567';
  }
}

const WS_URL = import.meta.env.VITE_WS_URL || deriveWsUrl(API_BASE_URL);

// Base server URL without /api path (e.g. "http://localhost:2357")
// Used for MAESTRO_API_URL env var passed to CLI workers
const SERVER_URL = deriveServerUrl(API_BASE_URL);

export { API_BASE_URL, WS_URL, SERVER_URL };
