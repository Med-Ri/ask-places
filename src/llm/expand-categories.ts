/**
 * Maps short or legacy ids onto Google Places types, and catches Latin/Arabic hints
 * when the LLM misses them.
 */
const EXPAND: Record<string, readonly string[]> = {
  bank: ["bank", "atm"],
  atm: ["atm", "bank"],
  cafe: ["cafe", "coffee_shop"],
  coffee_shop: ["cafe", "coffee_shop"],
  coffee: ["cafe", "coffee_shop"],
  restaurant: ["restaurant"],
  bar: ["bar"],
  pharmacy: ["pharmacy"],
  doctor: ["doctor"],
  doctors_office: ["doctor"],
  clinic: ["doctor", "hospital"],
  mosque: ["mosque"],
  muslim_place_of_worship: ["mosque"],
  church: ["church"],
  store: ["store", "supermarket", "convenience_store"],
  shopping: ["store", "supermarket", "convenience_store"],
  supermarket: ["supermarket", "grocery_store"],
};

const QUESTION_HINTS: { pattern: RegExp; categories: readonly string[] }[] = [
  { pattern: /\b(bancs?|banques?|banks?)\b/i, categories: ["bank", "atm"] },
  { pattern: /\b(atms?)\b/i, categories: ["atm"] },
  { pattern: /\b(caf[eé]s?|coff+e+)\b/i, categories: ["cafe", "coffee_shop"] },
  { pattern: /\b(bars?|pubs?)\b/i, categories: ["bar"] },
  { pattern: /\b((?:ph|f)arma(?:cie|sie|cy)s?)\b/i, categories: ["pharmacy"] },
  { pattern: /\b(mags?\w*|magasins?|stores?|shops?)\b/i, categories: ["store", "supermarket"] },
  { pattern: /\b(docteurs?|doctors?|m[eé]decins?)\b/i, categories: ["doctor"] },
  { pattern: /مسجد|جامع|مسل[م]|أصل[يى]|اصلي|صل[اا]ة|\b(mosqu\w*|masjid|muslim|pray(?:er|ing)?)\b/i, categories: ["mosque"] },
  { pattern: /\b(restaurants?|rest+aurants?)\b/i, categories: ["restaurant"] },
];

/** Merges LLM types with question hints and expands them to Google place types. */
export function expandCategories(llmCategories: string[], question: string): string[] {
  const fromHints = QUESTION_HINTS.filter((h) => h.pattern.test(question)).flatMap((h) => h.categories);
  const expanded = unique([...llmCategories, ...fromHints].flatMap((id) => EXPAND[id] ?? [id]));
  return narrowWorship(expanded, question).slice(0, 5);
}

function narrowWorship(categories: string[], question: string): string[] {
  const muslim =
    categories.includes("mosque") ||
    /مسجد|جامع|مسل[م]|أصل[يى]|اصلي|\b(mosqu\w*|masjid|muslim)\b/i.test(question);
  const christian = categories.includes("church") && !muslim;
  if (muslim) return unique([...categories.filter((c) => c !== "church" && c !== "place_of_worship"), "mosque"]);
  if (christian) return categories.filter((c) => c !== "mosque" && c !== "place_of_worship");
  return categories.filter((c) => c !== "place_of_worship");
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
