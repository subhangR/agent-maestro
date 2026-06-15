// Maestro server connection configuration
// Single source of truth for API and WebSocket URLs.
//
// Runtime env values are normalized here because malformed values can surface as
// opaque browser errors such as "The string did not match the expected pattern."

import { IS_TAURI } from '../platform/detect';

const DEFAULT_SERVER_URL = "http://localhost:4567";
const DEFAULT_API_BASE_URL = `${DEFAULT_SERVER_URL}/api`;
const DEFAULT_WS_URL = "ws://localhost:4567";

function stripWrappingQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
  ];

  for (const [start, end] of pairs) {
    if (trimmed.startsWith(start) && trimmed.endsWith(end) && trimmed.length >= 2) {
      return trimmed.slice(1, -1).trim();
    }
  }

  return trimmed;
}

function normalizeCandidate(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = stripWrappingQuotes(raw);
  return cleaned || null;
}

function parseAbsoluteUrl(raw: string | null | undefined): URL | null {
  const candidate = normalizeCandidate(raw);
  if (!candidate) return null;

  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function buildUrl(origin: string, pathname: string, search = ""): string {
  const normalizedPath = normalizePathname(pathname);
  return `${origin}${normalizedPath === "/" ? "" : normalizedPath}${search}`;
}

export function deriveWsUrl(apiUrl: string): string {
  const parsed = parseAbsoluteUrl(apiUrl);
  if (!parsed) {
    return DEFAULT_WS_URL;
  }

  const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${parsed.host}`;
}

export function deriveServerUrl(apiUrl: string): string {
  const parsed = parseAbsoluteUrl(apiUrl);
  if (!parsed) {
    return DEFAULT_SERVER_URL;
  }

  return `${parsed.protocol}//${parsed.host}`;
}

export function normalizeApiBaseUrl(raw: string | null | undefined): string {
  const parsed = parseAbsoluteUrl(raw);
  if (!parsed) {
    return DEFAULT_API_BASE_URL;
  }

  const origin = `${parsed.protocol}//${parsed.host}`;
  const pathname = normalizePathname(parsed.pathname);

  if (pathname === "/") {
    return `${origin}/api`;
  }

  return buildUrl(origin, pathname);
}

export function normalizeWsUrl(
  rawWsUrl: string | null | undefined,
  apiBaseUrl: string,
): string {
  const parsed = parseAbsoluteUrl(rawWsUrl);
  if (!parsed) {
    return deriveWsUrl(apiBaseUrl);
  }

  if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
    return buildUrl(`${parsed.protocol}//${parsed.host}`, parsed.pathname, parsed.search);
  }

  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    const protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return buildUrl(`${protocol}//${parsed.host}`, parsed.pathname, parsed.search);
  }

  return deriveWsUrl(apiBaseUrl);
}

const rawApiBaseUrl = normalizeCandidate(import.meta.env.VITE_API_URL);
const rawWsUrl = normalizeCandidate(import.meta.env.VITE_WS_URL);
const rawPtyWsUrl = normalizeCandidate(import.meta.env.VITE_PTY_WS_URL);

// In web (non-Tauri) mode, default to same-origin so a statically-served bundle
// talks to the origin that served it rather than hardcoded localhost:4567.
const isWebMode = !IS_TAURI && typeof window !== 'undefined';

const API_BASE_URL = rawApiBaseUrl
  ? normalizeApiBaseUrl(rawApiBaseUrl)
  : isWebMode
    ? `${window.location.origin}/api`
    : DEFAULT_API_BASE_URL;

const WS_URL = rawWsUrl
  ? normalizeWsUrl(rawWsUrl, API_BASE_URL)
  : isWebMode
    ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
    : deriveWsUrl(API_BASE_URL);

// Base server URL without /api path (e.g. "http://localhost:2357")
// Used for MAESTRO_API_URL env var passed to CLI workers
const SERVER_URL = deriveServerUrl(API_BASE_URL);

// PTY WebSocket endpoint — ws://host/pty — sessionId is appended as ?id=<id> by the transport.
// Overridable via VITE_PTY_WS_URL; otherwise derived from WS_URL with /pty suffix.
const PTY_WS_URL = rawPtyWsUrl
  ? normalizeWsUrl(rawPtyWsUrl, API_BASE_URL)
  : `${WS_URL}/pty`;

if (rawApiBaseUrl && API_BASE_URL !== rawApiBaseUrl) {
  console.warn(`[serverConfig] Invalid VITE_API_URL "${rawApiBaseUrl}", falling back to ${API_BASE_URL}`);
}

if (rawWsUrl && WS_URL !== rawWsUrl) {
  console.warn(`[serverConfig] Invalid VITE_WS_URL "${rawWsUrl}", falling back to ${WS_URL}`);
}

export { API_BASE_URL, WS_URL, SERVER_URL, DEFAULT_API_BASE_URL, DEFAULT_WS_URL, DEFAULT_SERVER_URL, PTY_WS_URL };
