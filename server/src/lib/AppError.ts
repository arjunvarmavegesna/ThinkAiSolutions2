/**
 * Operational error type. Carries a stable machine-readable `code`, a human `message`,
 * and an HTTP `statusCode`. The error handler turns these into the API error envelope
 * `{ error: { code, message } }`. Use the static helpers for the common cases.
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    // Preserve prototype chain when targeting ES5/CommonJS.
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /** 400 — invalid input. */
  static badRequest(message: string, code = 'bad_request'): AppError {
    return new AppError(code, message, 400);
  }

  /** 401 — missing/invalid credentials. */
  static unauthorized(message = 'Unauthorized', code = 'unauthorized'): AppError {
    return new AppError(code, message, 401);
  }

  /** 403 — authenticated but not allowed. */
  static forbidden(message = 'Forbidden', code = 'forbidden'): AppError {
    return new AppError(code, message, 403);
  }

  /** 404 — resource not found. */
  static notFound(message = 'Not found', code = 'not_found'): AppError {
    return new AppError(code, message, 404);
  }

  /** 409 — state conflict (e.g. service window closed, duplicate). */
  static conflict(message: string, code = 'conflict'): AppError {
    return new AppError(code, message, 409);
  }

  /**
   * 402 — payment required. Used for wallet billing; the canonical code is
   * 'insufficient_funds' when the wallet balance cannot cover a message charge.
   */
  static paymentRequired(message: string, code = 'insufficient_funds'): AppError {
    return new AppError(code, message, 402);
  }
}
