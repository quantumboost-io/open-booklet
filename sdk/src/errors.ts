/**
 * Base error class for all OpenBooklet API errors.
 */
export class OpenBookletError extends Error {
  /** HTTP status code from the API response. */
  public readonly status: number;
  /** Machine-readable error code. */
  public readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "OpenBookletError";
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a requested resource (skill, policy, etc.) is not found.
 */
export class NotFoundError extends OpenBookletError {
  constructor(message: string, code = "NOT_FOUND") {
    super(message, 404, code);
    this.name = "NotFoundError";
  }
}

/**
 * Thrown when the API key is missing, invalid, or lacks required permissions.
 */
export class AuthenticationError extends OpenBookletError {
  constructor(message: string, code = "AUTHENTICATION_FAILED") {
    super(message, 401, code);
    this.name = "AuthenticationError";
  }
}

/**
 * Thrown when the API rate limit has been exceeded.
 */
export class RateLimitError extends OpenBookletError {
  /** Number of seconds to wait before retrying. */
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number, code = "RATE_LIMITED") {
    super(message, 429, code);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when request data fails validation.
 */
export class ValidationError extends OpenBookletError {
  constructor(message: string, code = "VALIDATION_ERROR") {
    super(message, 422, code);
    this.name = "ValidationError";
  }
}
