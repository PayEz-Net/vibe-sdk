/**
 * Vibe Error Class
 *
 * Normalized error handling for all Vibe operations.
 */

import type { VibeErrorCode, VibeErrorDetails } from './types';

/**
 * Parse a Retry-After header value to whole seconds. RFC 9110: delta-seconds ("900") or an HTTP-date.
 * Returns undefined when absent or not parseable; a date in the past is 0 (wait no longer).
 */
export function parseRetryAfter(value: string | null | undefined, nowMs: number = Date.now()): number | undefined {
  if (value === null || value === undefined) return undefined;
  const v = value.trim();
  if (v === '') return undefined;
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : undefined;
  }
  // An HTTP-date always carries a day/month NAME. Without this guard V8's lenient Date.parse reads '-5' or '1.5'
  // as a (past) date and answers 0 - 'wait no longer' - for a header that is simply malformed.
  if (!/[A-Za-z]{3}/.test(v)) return undefined;
  const at = Date.parse(v);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - nowMs) / 1000));
}

export class VibeError extends Error {
  readonly code: VibeErrorCode;
  readonly status?: number;
  readonly details?: Record<string, unknown>;
  /**
   * PAY-2140: the Retry-After header of the response, in seconds (delta-seconds or an HTTP date),
   * undefined when absent or unparseable. A 429 AUTH_BLOCKED carries the live block TTL here
   * (PAY-2130); before this field the header was dropped and no consumer could honour it.
   */
  readonly retryAfterSeconds?: number;

  constructor(options: VibeErrorDetails) {
    super(options.message);
    this.name = 'VibeError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.retryAfterSeconds = options.retryAfterSeconds;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, VibeError);
    }
  }

  /**
   * Create a VibeError from an HTTP response
   */
  static async fromResponse(response: Response): Promise<VibeError> {
    let message = `HTTP ${response.status}: ${response.statusText}`;
    let details: Record<string, unknown> | undefined;

    try {
      const body = await response.json();
      if (body.error?.message) {
        message = body.error.message;
      } else if (body.message) {
        message = body.message;
      }
      details = body.error?.details || body.details;
    } catch {
      // Response body wasn't JSON, use status text
    }

    const code = VibeError.statusToCode(response.status);

    return new VibeError({
      code,
      message,
      status: response.status,
      details,
      retryAfterSeconds: parseRetryAfter(response.headers?.get?.('retry-after') ?? null),
    });
  }

  /**
   * Create a VibeError from a caught exception
   */
  static fromError(error: unknown): VibeError {
    if (error instanceof VibeError) {
      return error;
    }

    if (error instanceof Error) {
      // Network errors
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        return new VibeError({
          code: 'NETWORK_ERROR',
          message: 'Network request failed. Please check your connection.',
          details: { originalError: error.message },
        });
      }

      // Timeout errors
      if (error.name === 'AbortError') {
        return new VibeError({
          code: 'NETWORK_ERROR',
          message: 'Request timed out',
          details: { originalError: error.message },
        });
      }

      return new VibeError({
        code: 'UNKNOWN_ERROR',
        message: error.message,
        details: { originalError: error.message },
      });
    }

    return new VibeError({
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      details: { originalError: String(error) },
    });
  }

  /**
   * Map HTTP status code to VibeErrorCode
   */
  private static statusToCode(status: number): VibeErrorCode {
    switch (status) {
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'VALIDATION_ERROR';
      case 429:
        return 'RATE_LIMITED';
      default:
        if (status >= 500) return 'SERVER_ERROR';
        return 'UNKNOWN_ERROR';
    }
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return (
      this.code === 'NETWORK_ERROR' ||
      this.code === 'RATE_LIMITED' ||
      this.code === 'SERVER_ERROR'
    );
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): VibeErrorDetails {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      details: this.details,
      retryAfterSeconds: this.retryAfterSeconds,
    };
  }
}
