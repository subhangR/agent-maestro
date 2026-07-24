/**
 * Base application error.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: true,
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
      details: this.details
    };
  }
}

/**
 * Validation error (400).
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

/**
 * Not found error (404).
 */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id '${id}' not found` : `${resource} not found`;
    super(404, 'NOT_FOUND', message);
  }
}

/**
 * Forbidden error (403).
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

/**
 * Unauthorized error (401).
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

/**
 * Payload too large error (413).
 */
export class PayloadTooLargeError extends AppError {
  constructor(message: string, details?: any) {
    super(413, 'PAYLOAD_TOO_LARGE', message, details);
  }
}

/**
 * Business rule violation error (422).
 */
export class BusinessRuleError extends AppError {
  constructor(message: string, details?: any) {
    super(422, 'BUSINESS_RULE_ERROR', message, details);
  }
}

export class VersionConflictError extends AppError {
  constructor(message: string = 'The resource changed since it was loaded.', details?: any) {
    super(409, 'VERSION_CONFLICT', message, details);
  }
}

/**
 * Configuration error (500).
 */
export class ConfigError extends AppError {
  constructor(message: string) {
    super(500, 'CONFIG_ERROR', message);
  }
}

/**
 * Manifest generation error (500).
 */
export class ManifestGenerationError extends AppError {
  constructor(message: string, details?: any) {
    super(500, 'MANIFEST_GENERATION_ERROR', message, details);
  }
}

/**
 * Skill load error (500).
 */
export class SkillLoadError extends AppError {
  constructor(skillName: string, details?: any) {
    super(500, 'SKILL_LOAD_ERROR', `Failed to load skill: ${skillName}`, details);
  }
}
