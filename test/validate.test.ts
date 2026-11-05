import { describe, expect, it } from "vitest";
import { AskPlacesUsageError } from "../src/errors.js";
import { MAX_QUESTION_LENGTH, validateInput } from "../src/validate.js";

const validOptions = { provider: "openai", apiKey: "sk-test-123" };

/** Runs validateInput and returns the thrown error (fails the test if nothing is thrown). */
function errorFrom(question: unknown, options: unknown): AskPlacesUsageError {
  try {
    validateInput(question, options);
  } catch (error) {
    expect(error).toBeInstanceOf(AskPlacesUsageError);
    return error as AskPlacesUsageError;
  }
  throw new Error("expected validateInput to throw");
}

describe("validateInput: valid input", () => {
  it("returns the normalized question and the options", () => {
    expect(validateInput("  cafés   near Lac 2 ", validOptions)).toEqual({
      question: "cafés near Lac 2",
      options: { provider: "openai", apiKey: "sk-test-123" },
    });
  });

  it("keeps a valid origin", () => {
    const result = validateInput("cafés", { ...validOptions, origin: { lat: 36.84, lng: 10.27 } });
    expect(result.options.origin).toEqual({ lat: 36.84, lng: 10.27 });
  });

  it("keeps a valid radiusMeters", () => {
    const result = validateInput("cafés", { ...validOptions, radiusMeters: 500 });
    expect(result.options.radiusMeters).toBe(500);
  });

  it.each([49, 25_001, "500", NaN])("rejects invalid radiusMeters %j", (radiusMeters) => {
    expect(errorFrom("cafés", { ...validOptions, radiusMeters }).code).toBe("INVALID_OPTIONS");
  });

  it("accepts origin values on the limits", () => {
    expect(() => validateInput("cafés", { ...validOptions, origin: { lat: -90, lng: 180 } })).not.toThrow();
  });

  it("trims spaces around the API key", () => {
    expect(validateInput("cafés", { ...validOptions, apiKey: "  sk-test-123 \n" }).options.apiKey).toBe("sk-test-123");
  });

  it("drops unknown options instead of passing them along", () => {
    const result = validateInput("cafés", { ...validOptions, debug: true });
    expect(result.options).toEqual({ provider: "openai", apiKey: "sk-test-123" });
  });

  it("keeps an optional model and trims it", () => {
    expect(validateInput("cafés", { ...validOptions, model: "  gpt-4o-mini  " }).options.model).toBe("gpt-4o-mini");
  });

  it.each([
    ["empty", ""],
    ["whitespace only", "   "],
    ["not a string", 42],
  ])("rejects a model that is %s", (_label, model) => {
    expect(errorFrom("cafés", { ...validOptions, model }).code).toBe("INVALID_OPTIONS");
  });
});

describe("validateInput: question", () => {
  it.each([
    ["a number", 42],
    ["undefined", undefined],
    ["null", null],
    ["an object", { q: "cafés" }],
  ])("rejects %s", (_label, question) => {
    expect(errorFrom(question, validOptions).code).toBe("INVALID_QUESTION");
  });

  it("rejects an empty or whitespace-only question", () => {
    expect(errorFrom("   \n\t ", validOptions).message).toBe("askplaces: the question is empty.");
  });

  it(`accepts exactly ${MAX_QUESTION_LENGTH} characters and rejects one more`, () => {
    expect(() => validateInput("a".repeat(MAX_QUESTION_LENGTH), validOptions)).not.toThrow();
    expect(errorFrom("a".repeat(MAX_QUESTION_LENGTH + 1), validOptions).code).toBe("INVALID_QUESTION");
  });
});

describe("validateInput: options", () => {
  it.each([
    ["missing", undefined],
    ["null", null],
    ["a string", "openai"],
    ["an array", ["openai"]],
  ])("rejects options that are %s", (_label, options) => {
    expect(errorFrom("cafés", options).code).toBe("INVALID_OPTIONS");
  });

  it.each(["openai", "anthropic", "google", "xai", "deepseek", "groq"])("accepts the %s provider", (provider) => {
    expect(validateInput("cafés", { provider, apiKey: "key-123" }).options.provider).toBe(provider);
  });

  it("rejects an unknown provider and lists the supported ones", () => {
    const error = errorFrom("cafés", { ...validOptions, provider: "mistral" });
    expect(error.code).toBe("UNSUPPORTED_PROVIDER");
    expect(error.message).toContain('"mistral"');
    expect(error.message).toContain('"openai", "anthropic", "google", "xai", "deepseek", "groq"');
  });

  it("is case-sensitive about provider names", () => {
    expect(errorFrom("cafés", { ...validOptions, provider: "OpenAI" }).code).toBe("UNSUPPORTED_PROVIDER");
  });

  it("rejects a missing provider", () => {
    expect(errorFrom("cafés", { apiKey: "sk-test-123" }).code).toBe("UNSUPPORTED_PROVIDER");
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace only", "   "],
    ["not a string", 12345],
  ])("rejects an API key that is %s", (_label, apiKey) => {
    expect(errorFrom("cafés", { provider: "openai", apiKey }).code).toBe("MISSING_API_KEY");
  });
});

describe("validateInput: origin", () => {
  it.each([
    ["a string", "36.84,10.27"],
    ["an array", [36.84, 10.27]],
    ["null", null],
    ["latitude too high", { lat: 91, lng: 10 }],
    ["longitude too low", { lat: 36, lng: -181 }],
    ["latitude as a string", { lat: "36.84", lng: 10.27 }],
    ["NaN", { lat: Number.NaN, lng: 10.27 }],
    ["Infinity", { lat: 36.84, lng: Number.POSITIVE_INFINITY }],
    ["missing lng", { lat: 36.84 }],
  ])("rejects an origin that is %s", (_label, origin) => {
    expect(errorFrom("cafés", { ...validOptions, origin }).code).toBe("INVALID_ORIGIN");
  });
});

describe("validateInput: security", () => {
  it("never includes the API key in an error message", () => {
    const secret = "sk-very-secret-key-should-not-leak";
    const messages = [
      errorFrom("", { provider: "openai", apiKey: secret }).message,
      errorFrom("cafés", { provider: "nope", apiKey: secret }).message,
      errorFrom("cafés", { provider: "openai", apiKey: secret, origin: { lat: 999, lng: 0 } }).message,
    ];
    for (const message of messages) expect(message).not.toContain(secret);
  });

  it("truncates long values shown in error messages", () => {
    const error = errorFrom("cafés", { ...validOptions, provider: "x".repeat(200) });
    expect(error.message).toContain(`"${"x".repeat(30)}…"`);
    expect(error.message).not.toContain("x".repeat(31));
  });
});
