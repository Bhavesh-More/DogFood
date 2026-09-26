/**
 * Uniform error model. Every failure leaves the API as
 *   { "error": "<human message>", "code": "<MACHINE_CODE>", "details"?: … }
 * with a matching HTTP status. Internal errors never leak stack traces or SQL.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "BAD_REQUEST", message, details);
export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this resource", code = "FORBIDDEN") =>
  new HttpError(403, code, message);
export const notFound = (what = "Resource") => new HttpError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (message: string, code = "CONFLICT") => new HttpError(409, code, message);
export const unprocessable = (message: string, details?: unknown, code = "VALIDATION_FAILED") =>
  new HttpError(422, code, message, details);
export const tooManyRequests = (retryAfterSeconds: number) =>
  new HttpError(429, "RATE_LIMITED", "Too many requests — slow down and retry later", {
    retryAfterSeconds,
  });
export const deadlinePassed = (deadline: string) =>
  new HttpError(403, "DEADLINE_PASSED", `Submission locked: the hard deadline (${deadline} UTC) has passed`, {
    deadline,
  });
