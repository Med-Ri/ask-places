import { describe, expect, it } from "vitest";
import {
  AskPlacesError,
  AskPlacesInternalError,
  AskPlacesUsageError,
  INTERNAL_ERROR_MESSAGE,
} from "../src/errors.js";

describe("AskPlacesUsageError", () => {
  it("keeps the code and the specific message", () => {
    const error = new AskPlacesUsageError("MISSING_API_KEY", "askplaces: an API key is required.");
    expect(error).toBeInstanceOf(AskPlacesError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("AskPlacesUsageError");
    expect(error.code).toBe("MISSING_API_KEY");
    expect(error.message).toBe("askplaces: an API key is required.");
  });
});

describe("AskPlacesInternalError", () => {
  it("always shows the generic message and keeps the original error as cause", () => {
    const original = new Error("Overture bucket returned HTTP 503");
    const error = new AskPlacesInternalError(original);
    expect(error).toBeInstanceOf(AskPlacesError);
    expect(error.name).toBe("AskPlacesInternalError");
    expect(error.code).toBe("INTERNAL_ERROR");
    expect(error.message).toBe(INTERNAL_ERROR_MESSAGE);
    expect(error.message).not.toContain("503");
    expect(error.cause).toBe(original);
  });
});
