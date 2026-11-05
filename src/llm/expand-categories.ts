/**
 * Overture often uses broader ids than the short names people (and LLMs) pick.
 * e.g. mosques are "muslim_place_of_worship", not "mosque"; banks are "bank_or_credit_union".
 */
const EXPAND: Record<string, readonly string[]> = {
  bank: ["bank", "bank_or_credit_union"],
  banque: ["bank", "bank_or_credit_union"],
  atm: ["atm", "bank_or_credit_union"],
  cafe: ["cafe", "coffee_shop"],
  café: ["cafe", "coffee_shop"],
  coffee_shop: ["cafe", "coffee_shop"],
  coffee: ["cafe", "coffee_shop"],
  restaurant: ["restaurant"],
  bar: ["bar", "pub"],
  pub: ["bar", "pub"],
  pharmacy: ["pharmacy"],
  pharmacie: ["pharmacy"],
  doctor: ["doctors_office", "clinic", "medical_center"],
  doctors_office: ["doctors_office", "clinic", "medical_center"],
  clinic: ["clinic", "doctors_office", "medical_center"],
  // Overture has no plain "mosque" / "church" leaf that matches; use religion-specific ids.
  mosque: ["muslim_place_of_worship"],
  muslim_place_of_worship: ["muslim_place_of_worship"],
  church: ["christian_place_of_worship", "roman_catholic_place_of_worship"],
  christian_place_of_worship: ["christian_place_of_worship", "roman_catholic_place_of_worship"],
  store: ["shopping", "supermarket", "convenience_store", "department_store"],
  shop: ["shopping", "supermarket", "convenience_store"],
  shopping: ["shopping", "supermarket", "convenience_store", "department_store"],
  supermarket: ["supermarket", "grocery_store", "convenience_store"],
  office: ["office", "professional_service", "coworking_space"],
  professional_service: ["professional_service", "office"],
};

/**
 * Backups when the LLM misses a synonym, typo, or Arabic prayer intent.
 */
const QUESTION_HINTS: { pattern: RegExp; categories: readonly string[] }[] = [
  { pattern: /\b(bancs?|banques?|banks?)\b/i, categories: ["bank", "bank_or_credit_union", "atm"] },
  { pattern: /\b(atms?|distributeurs?(?:\s+automatiques?)?)\b/i, categories: ["atm", "bank_or_credit_union"] },
  { pattern: /\b(caf[eé]s?|coffe+e?\s*shops?|coff+e+)\b/i, categories: ["cafe", "coffee_shop"] },
  { pattern: /\b(bars?|pubs?)\b/i, categories: ["bar", "pub"] },
  { pattern: /\b((?:ph|f)arma(?:cie|sie|cy|cyie)s?|pharmacies?)\b/i, categories: ["pharmacy"] },
  { pattern: /\b(mags?\w*|magasins?|stores?|shops?)\b/i, categories: ["shopping", "supermarket", "convenience_store"] },
  { pattern: /\b(docteurs?|doctors?|m[eé]decins?)\b/i, categories: ["doctors_office", "clinic"] },
  { pattern: /\b(bureaux?|offices?)\b/i, categories: ["office", "professional_service"] },
  {
    // Muslim prayer / mosque (Arabic + Latin). Do NOT map to generic place_of_worship.
    pattern: /مسجد|جامع|مسل[م]|أصل[يى]|اصلي|صل[اا]ة|\b(mosqu\w*|masjid|muslim|pray(?:er|ing)?)\b/i,
    categories: ["muslim_place_of_worship"],
  },
  { pattern: /\b(restaurants?|rest+aurants?)\b/i, categories: ["restaurant"] },
];

/**
 * Merges LLM categories with question hints and expands short ids to Overture parents.
 * Caps at 8 ids so the DuckDB filter stays selective.
 */
export function expandCategories(llmCategories: string[], question: string): string[] {
  const fromHints = QUESTION_HINTS.filter((h) => h.pattern.test(question)).flatMap((h) => h.categories);
  const expanded = unique([...llmCategories, ...fromHints].flatMap((id) => EXPAND[id] ?? [id]));
  return narrowWorship(expanded).slice(0, 8);
}

/**
 * "place_of_worship" matches churches and mosques. When the intent is clearly Muslim
 * (or clearly Christian), keep only the matching religion-specific ids.
 */
function narrowWorship(categories: string[]): string[] {
  const muslim = categories.some((c) => c === "muslim_place_of_worship" || c === "mosque");
  const christian = categories.some(
    (c) => c === "christian_place_of_worship" || c === "roman_catholic_place_of_worship" || c === "church",
  );

  if (muslim && !christian) {
    return unique([
      ...categories.filter((c) => c !== "place_of_worship" && c !== "mosque" && c !== "church"),
      "muslim_place_of_worship",
    ]);
  }
  if (christian && !muslim) {
    return unique([
      ...categories.filter((c) => c !== "place_of_worship" && c !== "mosque" && c !== "church"),
      "christian_place_of_worship",
      "roman_catholic_place_of_worship",
    ]);
  }
  return categories;
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const id = value.trim().toLowerCase();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}
