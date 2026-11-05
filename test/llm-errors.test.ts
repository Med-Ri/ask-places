import { APICallError, NoSuchModelError, RetryError } from "ai";
import { describe, expect, it } from "vitest";
import { isInvalidApiKeyError, isProviderQuotaError, unwrapLlmError, usageErrorFromLlm } from "../src/llm/errors.js";

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

  it("returns null for other errors", () => {
    expect(usageErrorFromLlm(new Error("timeout"), "openai")).toBeNull();
  });
});
