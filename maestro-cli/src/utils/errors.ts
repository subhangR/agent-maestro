import {
  CONNECTION_REFUSED_MESSAGE,
  CONNECTION_REFUSED_SUGGESTION,
  NETWORK_ERROR_MESSAGE,
  NETWORK_ERROR_SUGGESTION,
  NOT_FOUND_SUGGESTION,
  PERMISSION_DENIED_SUGGESTION,
  INVALID_REQUEST_SUGGESTION,
  SERVER_ERROR_SUGGESTION,
  SPAWN_FAILED_SUGGESTION,
} from '../prompts/index.js';

export interface CLIError {
  success: false;
  error: string;
  message: string;
  details?: Record<string, any>;
  suggestion?: string;
}

/**
 * Exit code mapping:
 *   0 = Success
 *   1 = General / validation error
 *   2 = Resource not found
 *   3 = Network / connection error
 *   4 = Permission denied
 *   5 = Claude spawn failed
 */

export function createError(
  code: string,
  message: string,
  details?: Record<string, any>,
  suggestion?: string
): CLIError {
  return {
    success: false,
    error: code,
    message,
    details,
    suggestion
  };
}

export function handleError(err: unknown, json: boolean): never {
  const e = err as Record<string, unknown>;
  let cliError: CLIError;
  let exitCode = 1; // default: general error

  if (e.response) {
    // HTTP error from server
    const response = e.response as Record<string, unknown>;
    const status = response.status as number;
    const data = (response.data as Record<string, unknown>) || {};

    switch (status) {
      case 404:
        cliError = createError(
          'resource_not_found',
          (data.message as string) || 'Resource not found',
          { status, url: (e.config as Record<string, unknown>)?.url },
          NOT_FOUND_SUGGESTION
        );
        exitCode = 2;
        break;

      case 403:
        cliError = createError(
          'permission_denied',
          (data.message as string) || 'Permission denied',
          { status },
          PERMISSION_DENIED_SUGGESTION
        );
        exitCode = 4;
        break;

      case 400:
        cliError = createError(
          'invalid_request',
          (data.message as string) || 'Invalid request',
          { status, errors: data.errors },
          INVALID_REQUEST_SUGGESTION
        );
        exitCode = 1;
        break;

      case 500:
        cliError = createError(
          'server_error',
          (data.message as string) || 'Internal server error',
          { status },
          SERVER_ERROR_SUGGESTION
        );
        exitCode = 1;
        break;

      default:
        cliError = createError(
          'http_error',
          (data.message as string) || `HTTP ${status} error`,
          { status }
        );
    }
  } else if (e.code === 'ECONNREFUSED') {
    // Connection refused
    const cfg = e.config as Record<string, unknown> | undefined;
    cliError = createError(
      'connection_refused',
      CONNECTION_REFUSED_MESSAGE,
      {
        server: (cfg?.baseURL as string) || 'http://localhost:4567',
        errno: e.code
      },
      CONNECTION_REFUSED_SUGGESTION
    );
    exitCode = 3;
  } else if (e.code === 'ETIMEDOUT' || e.code === 'ENOTFOUND') {
    // Network timeout or DNS failure
    const cfg = e.config as Record<string, unknown> | undefined;
    cliError = createError(
      'network_error',
      NETWORK_ERROR_MESSAGE,
      { errno: e.code, server: cfg?.baseURL },
      NETWORK_ERROR_SUGGESTION
    );
    exitCode = 3;
  } else if (e.error === 'resource_not_found') {
    cliError = createError(
      'resource_not_found',
      (e.message as string) || 'Resource not found',
      e.details as Record<string, unknown>,
      (e.suggestion as string) || NOT_FOUND_SUGGESTION
    );
    exitCode = 2;
  } else if (e.error === 'permission_denied') {
    cliError = createError(
      'permission_denied',
      (e.message as string) || 'Permission denied',
      e.details as Record<string, unknown>,
      e.suggestion as string | undefined
    );
    exitCode = 4;
  } else if (e.error === 'spawn_failed') {
    cliError = createError(
      'spawn_failed',
      (e.message as string) || 'Claude spawn failed',
      e.details as Record<string, unknown>,
      (e.suggestion as string) || SPAWN_FAILED_SUGGESTION
    );
    exitCode = 5;
  } else if (e.success === false) {
    // Already formatted as CLIError
    cliError = e as unknown as CLIError;
  } else if (e.message && /not found/i.test(e.message as string)) {
    // Detect "not found" patterns from storage/other errors
    cliError = createError(
      'resource_not_found',
      e.message as string,
      {},
      NOT_FOUND_SUGGESTION
    );
    exitCode = 2;
  } else {
    // Unknown error
    cliError = createError(
      'unknown_error',
      (e.message as string) || 'An unexpected error occurred',
      { originalError: String(err) }
    );
  }

  if (json) {
    console.log(JSON.stringify(cliError, null, 2));
  } else {
    console.error(`\nError: ${cliError.message}`);
    if (cliError.details) {
      console.error(`   Details: ${JSON.stringify(cliError.details, null, 2)}`);
    }
    if (cliError.suggestion) {
      console.error(`   ${cliError.suggestion}`);
    }
    console.error('');
  }

  process.exit(exitCode);
}

export function throwValidationError(code: string, message: string, suggestion?: string): never {
  throw createError(code, message, {}, suggestion);
}
