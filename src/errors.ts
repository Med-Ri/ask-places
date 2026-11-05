/** Mistakes in how the developer calls askplaces. The message explains how to fix it. */
export type UsageErrorCode =
  | "INVALID_QUESTION"
  | "INVALID_OPTIONS"
  | "UNSUPPORTED_PROVIDER"
  | "MISSING_API_KEY"
  | "INVALID_API_KEY"
  | "PROVIDER_QUOTA"
  | "INVALID_ORIGIN";

export type AskPlacesErrorCode = UsageErrorCode | "INTERNAL_ERROR";

/**
 * Base class for every error thrown by askplaces.
 * Check `error.code` rather than `instanceof` when possible: it keeps working even if
 * an app ends up loading both the ESM and the CommonJS build of the package.
 */
export class AskPlacesError extends Error {
  readonly code: AskPlacesErrorCode;

  constructor(code: AskPlacesErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AskPlacesError";
    this.code = code;
  }
}

/** Thrown when the developer uses the package incorrectly (bad input, missing key...). */
export class AskPlacesUsageError extends AskPlacesError {
  declare readonly code: UsageErrorCode;

  constructor(code: UsageErrorCode, message: string) {
    super(code, message);
    this.name = "AskPlacesUsageError";
  }
}

export const INTERNAL_ERROR_MESSAGE = "askplaces: something went wrong while searching for places.";

/**
 * Thrown for problems that are not the developer's fault (a bug in askplaces, a data source
 * being down...). The message is always generic; the original error is kept in `cause` for logs.
 */
export class AskPlacesInternalError extends AskPlacesError {
  declare readonly code: "INTERNAL_ERROR";

  constructor(cause?: unknown) {
    super("INTERNAL_ERROR", INTERNAL_ERROR_MESSAGE, { cause });
    this.name = "AskPlacesInternalError";
  }
}
