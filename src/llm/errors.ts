import { APICallError, NoSuchModelError, RetryError } from "ai";
import { AskPlacesUsageError } from "../errors.js";
import { isTimeoutError, LLM_TIMEOUT_MS } from "./timeout.js";

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
const BUSY_HINT = /high demand|overloaded|unavailable|try again later|temporarily|capacity|resource.?exhausted|spike/i;
const MODEL_GONE_HINT = /model|no longer available|not found|not supported|unknown model/i;

function errorText(error: unknown): string {
  if (!APICallError.isInstance(error)) return "";
  return `${error.message}\n${typeof error.responseBody === "string" ? error.responseBody : ""}`;
}

/** No credits, billing required, or hard rate limit — the developer's provider account must be fixed. */
export function isProviderQuotaError(error: unknown): boolean {
  const inner = unwrapLlmError(error);
  if (!APICallError.isInstance(inner)) return false;
  if (inner.statusCode === 402) return true;
  // Plain 429 without a billing hint is treated as temporary busy below.
  return (inner.statusCode === 429 || inner.statusCode === 403) && QUOTA_HINT.test(errorText(inner));
}

/** Provider is temporarily overloaded (e.g. Google "high demand"). Retrying later usually works. */
export function isProviderBusyError(error: unknown): boolean {
  const inner = unwrapLlmError(error);
  if (!APICallError.isInstance(inner)) return false;
  if (inner.statusCode === 503 || inner.statusCode === 529) return true;
  if (inner.statusCode === 429 && !QUOTA_HINT.test(errorText(inner))) return true;
  return BUSY_HINT.test(errorText(inner));
}

/** Provider says the model id is unknown or retired (e.g. Google 404 for gemini-2.5-flash). */
export function isUnknownModelError(error: unknown): boolean {
  if (NoSuchModelError.isInstance(error) || NoSuchModelError.isInstance(unwrapLlmError(error))) return true;
  const inner = unwrapLlmError(error);
  return APICallError.isInstance(inner) && inner.statusCode === 404 && MODEL_GONE_HINT.test(errorText(inner));
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

  if (isProviderBusyError(error)) {
    return new AskPlacesUsageError(
      "PROVIDER_BUSY",
      `askplaces: the "${provider}" model is temporarily overloaded (high demand). Wait a moment and try again, or pass options.model / another provider.`,
    );
  }

  if (isUnknownModelError(error)) {
    return new AskPlacesUsageError(
      "INVALID_OPTIONS",
      `askplaces: the model for "${provider}" was not found or is no longer available. Pass a valid options.model, or omit it to use the default.`,
    );
  }

  if (isTimeoutError(inner) || isTimeoutError(error)) {
    return new AskPlacesUsageError(
      "PROVIDER_TIMEOUT",
      `askplaces: the "${provider}" LLM call timed out after ${LLM_TIMEOUT_MS / 1000}s. Try again, use a faster model, or check your network.`,
    );
  }

  return null;
}
