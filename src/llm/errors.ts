import { APICallError, NoSuchModelError, RetryError } from "ai";
import { AskPlacesUsageError } from "../errors.js";

/** Follow RetryError to the last real provider error (AI SDK wraps failures after retries). */
export function unwrapLlmError(error: unknown): unknown {
  let current = error;
  for (let i = 0; i < 5 && RetryError.isInstance(current); i++) {
    current = current.lastError;
  }
  return current;
}

/** 401 / 403 from the LLM provider almost always mean a bad or missing API key. */
export function isInvalidApiKeyError(error: unknown): boolean {
  const inner = unwrapLlmError(error);
  return APICallError.isInstance(inner) && (inner.statusCode === 401 || inner.statusCode === 403);
}

const QUOTA_HINT = /credit|billing|quota|insufficient|payment|balance|plan|exceeded|rate.?limit/i;

/** No credits, billing required, or hard rate limit — the developer's provider account must be fixed. */
export function isProviderQuotaError(error: unknown): boolean {
  const inner = unwrapLlmError(error);
  if (!APICallError.isInstance(inner)) return false;
  if (inner.statusCode === 402) return true;
  const text = `${inner.message}\n${typeof inner.responseBody === "string" ? inner.responseBody : ""}`;
  return (inner.statusCode === 429 || inner.statusCode === 403) && QUOTA_HINT.test(text);
}

/**
 * Turns known developer mistakes from the LLM provider into AskPlacesUsageError.
 * Returns null when the error should stay an internal error.
 * The API key is never included in the message.
 */
export function usageErrorFromLlm(error: unknown, provider: string): AskPlacesUsageError | null {
  const inner = unwrapLlmError(error);

  if (isInvalidApiKeyError(error) && !isProviderQuotaError(error)) {
    const status = APICallError.isInstance(inner) ? inner.statusCode : "?";
    return new AskPlacesUsageError(
      "INVALID_API_KEY",
      `askplaces: the API key for "${provider}" was rejected by the provider (HTTP ${status}). Check options.apiKey.`,
    );
  }

  if (isProviderQuotaError(error)) {
    return new AskPlacesUsageError(
      "PROVIDER_QUOTA",
      `askplaces: the "${provider}" account has no credits left, hit a rate limit, or needs billing enabled. Add credits in the provider's dashboard, or switch provider / model.`,
    );
  }

  if (NoSuchModelError.isInstance(inner) || NoSuchModelError.isInstance(error)) {
    return new AskPlacesUsageError(
      "INVALID_OPTIONS",
      `askplaces: the model for "${provider}" was not found. Pass a valid options.model, or omit it to use the default.`,
    );
  }

  return null;
}
