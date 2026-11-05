import { describe, expect, it } from "vitest";
import { expandCategories } from "../src/llm/expand-categories.js";

describe("expandCategories", () => {
  it("expands bank to bank_or_credit_union", () => {
    expect(expandCategories(["bank"], "banks near me")).toEqual(
      expect.arrayContaining(["bank", "bank_or_credit_union"]),
    );
  });

  it("adds bank categories when the question says banc/banque", () => {
    expect(expandCategories([], "banc near me")).toEqual(
      expect.arrayContaining(["bank", "bank_or_credit_union", "atm"]),
    );
    expect(expandCategories(["cafe"], "banque à proximité")).toEqual(
      expect.arrayContaining(["cafe", "coffee_shop", "bank", "bank_or_credit_union"]),
    );
  });

  it("keeps unrelated categories unchanged", () => {
    expect(expandCategories(["pharmacy"], "pharmacies near me")).toEqual(["pharmacy"]);
  });
});
