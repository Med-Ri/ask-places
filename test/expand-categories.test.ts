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

  it("maps farmasie/magasin typos and synonyms", () => {
    expect(expandCategories([], "farmasie near me")).toContain("pharmacy");
    expect(expandCategories([], "magsain")).toEqual(
      expect.arrayContaining(["shopping", "supermarket", "convenience_store"]),
    );
  });

  it("maps Muslim prayer intent to mosques only, not churches", () => {
    const cats = expandCategories(["place_of_worship", "mosque"], "أنا مسلم و أريد أن أصلي أين يمكنني الذهاب");
    expect(cats).toContain("muslim_place_of_worship");
    expect(cats).not.toContain("place_of_worship");
    expect(cats).not.toContain("christian_place_of_worship");
  });

  it("keeps unrelated categories unchanged", () => {
    expect(expandCategories(["pharmacy"], "looking for something")).toEqual(["pharmacy"]);
  });
});
