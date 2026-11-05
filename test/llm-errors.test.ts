import { APICallError, NoSuchModelError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import {
  isInvalidApiKeyError,
  isProviderBusyError,
  isProviderQuotaError,
  isUnknownModelError,
  unwrapLlmError,
  usageErrorFromLlm,
} from "../src/llm/errors.js";

function apiError(statusCode: number, message: string, responseBody = "") {
  return new APICallError({ message, url: "https://x", requestBodyValues: {}, statusCode, responseBody });
}

describe("unwrapLlmError", () => {
  it("returns the last error inside a RetryError", () => {
    const last = apiError(401, "Unauthorized");
    const wrapped = new RetryError({ message: "Failed after 2 attempts", reason: "maxRetriesExceeded", errors: [last] });
    expect(unwrapLlmError(wrapped)).toBe(last);
  });
});

describe("isInvalidApiKeyError", () => {
  it.each([401, 403])("detects HTTP %s, including inside RetryError", (statusCode) => {
    const last = apiError(statusCode, "no");
    expect(isInvalidApiKeyError(last)).toBe(true);
    expect(isInvalidApiKeyError(new RetryError({ message: "retry", reason: "maxRetriesExceeded", errors: [last] }))).toBe(true);
  });

  it("ignores other statuses and ordinary errors", () => {
    expect(isInvalidApiKeyError(apiError(500, "no"))).toBe(false);
    expect(isInvalidApiKeyError(new Error("boom"))).toBe(false);
  });
});

describe("isProviderQuotaError", () => {
  it("detects OpenAI 'no credits' wrapped in RetryError", () => {
    const last = apiError(429, "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.");
    const wrapped = new RetryError({
      message: "Failed after 2 attempts. Last error: AI_APICallError: You have no credits remaining.",
      reason: "maxRetriesExceeded",
      errors: [last],
    });
    expect(isProviderQuotaError(wrapped)).toBe(true);
  });

  it("detects HTTP 402", () => {
    expect(isProviderQuotaError(apiError(402, "Payment required"))).toBe(true);
  });

  it("ignores plain 429 without a billing hint", () => {
    expect(isProviderQuotaError(apiError(429, "Too many requests, try again later"))).toBe(false);
  });
});

describe("usageErrorFromLlm", () => {
  it("maps a rejected API key to INVALID_API_KEY without leaking the key", () => {
    const error = usageErrorFromLlm(apiError(401, "Unauthorized sk-secret"), "openai");
    expect(error?.code).toBe("INVALID_API_KEY");
    expect(error?.message).toContain('"openai"');
    expect(error?.message).toContain("401");
    expect(error?.message).not.toContain("sk-secret");
  });

  it("maps no-credits RetryError to PROVIDER_QUOTA with a clear message", () => {
    const last = apiError(429, "You have no credits remaining.");
    const wrapped = new RetryError({ message: "Failed after 2 attempts", reason: "maxRetriesExceeded", errors: [last] });
    const error = usageErrorFromLlm(wrapped, "openai");
    expect(error?.code).toBe("PROVIDER_QUOTA");
    expect(error?.message).toContain('"openai"');
    expect(error?.message).toContain("credits");
    expect(error?.name).toBe("AskPlacesUsageError");
  });

  it("maps an unknown model to INVALID_OPTIONS", () => {
    const error = usageErrorFromLlm(new NoSuchModelError({ modelId: "nope", modelType: "languageModel" }), "anthropic");
    expect(error?.code).toBe("INVALID_OPTIONS");
    expect(error?.message).toContain('"anthropic"');
  });

  it("maps Google high-demand RetryError to PROVIDER_BUSY", () => {
    const last = apiError(503, "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.");
    const wrapped = new RetryError({ message: "Failed after 2 attempts", reason: "maxRetriesExceeded", errors: [last] });
    expect(isProviderBusyError(wrapped)).toBe(true);
    const error = usageErrorFromLlm(wrapped, "google");
    expect(error?.code).toBe("PROVIDER_BUSY");
    expect(error?.message).toContain("overloaded");
    expect(error?.message).toContain('"google"');
  });

  it("maps a retired Google model 404 to INVALID_OPTIONS", () => {
    const gone = apiError(
      404,
      "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash",
    );
    expect(isUnknownModelError(gone)).toBe(true);
    const error = usageErrorFromLlm(gone, "google");
    expect(error?.code).toBe("INVALID_OPTIONS");
    expect(error?.message).toContain("no longer available");
  });

  it("maps AbortSignal TimeoutError to PROVIDER_TIMEOUT", () => {
    const timeout = new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const error = usageErrorFromLlm(timeout, "google");
    expect(error?.code).toBe("PROVIDER_TIMEOUT");
    expect(error?.message).toContain('"google"');
    expect(error?.message).toContain("timed out");
  });

  it("returns null for other errors", () => {
    expect(usageErrorFromLlm(new Error("socket hung"), "openai")).toBeNull();
    expect(isUnknownModelError(apiError(404, "bucket missing"))).toBe(false);
  });
});
