import { describe, expect, it } from "vitest";
import { isDatabaseBroken } from "../src/overture/duckdb.js";

describe("isDatabaseBroken", () => {
  it.each([
    "INTERNAL Error: Vector::Reference used on vector of different type",
    "FATAL Error: Failed: database has been invalidated because of a previous fatal error.",
  ])("detects %s", (message) => {
    expect(isDatabaseBroken(new Error(message))).toBe(true);
  });

  it.each([new Error("HTTP Error: 503"), new Error("Binder Error: column not found"), "INTERNAL Error", undefined])(
    "ignores ordinary errors: %s",
    (error) => {
      expect(isDatabaseBroken(error)).toBe(false);
    },
  );
});
