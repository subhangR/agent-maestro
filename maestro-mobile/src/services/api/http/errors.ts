// Normalized API error model.
//
// The maestro-server error shapes are inconsistent (verified): entity routes
// return {error:true, code, message}; some return {error:'<string>'} with no
// code; validation returns 400 {error:true, code:'VALIDATION_ERROR', ...};
// some failures are plain text. We normalize ALL of it at the boundary into one
// MaestroApiError so callers switch on status/code/message instead of
// string-matching. Aligns with @/domain's ErrorEnvelope.

/**
 * A normalized HTTP error from the maestro server. `code` is the server's
 * domain code (e.g. 'VALIDATION_ERROR') when present, else null. `body` is the
 * raw parsed JSON (or undefined) for callers that need more detail.
 */
export class MaestroApiError extends Error {
  readonly name = 'MaestroApiError';

  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
    readonly body?: unknown,
  ) {
    super(message);
    // Restore prototype chain (TS down-leveling + extending Error).
    Object.setPrototypeOf(this, MaestroApiError.prototype);
  }

  /** Build from a non-2xx Response, tolerating JSON, string-error, and plain-text bodies. */
  static async fromResponse(res: Response): Promise<MaestroApiError> {
    const text = await res.text().catch(() => '');
    try {
      const j = JSON.parse(text) as Record<string, unknown>;
      const code = typeof j.code === 'string' ? j.code : null;
      const message =
        typeof j.error === 'string'
          ? j.error
          : typeof j.message === 'string'
            ? j.message
            : text || res.statusText;
      return new MaestroApiError(res.status, code, message, j);
    } catch {
      return new MaestroApiError(res.status, null, text || res.statusText);
    }
  }
}

/** Thrown when a request exceeds the client timeout (AbortController fired). */
export class TimeoutError extends Error {
  readonly name = 'TimeoutError';

  constructor(readonly endpoint: string) {
    super(`Request timed out: ${endpoint}`);
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/** Thrown when the request never reached the server (fetch rejected, e.g. radio stall, wrong host). */
export class NetworkError extends Error {
  readonly name = 'NetworkError';

  constructor(
    readonly endpoint: string,
    readonly cause?: unknown,
  ) {
    super(`Network request failed: ${endpoint}`);
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}
