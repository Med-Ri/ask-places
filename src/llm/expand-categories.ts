/**
 * Overture often uses broader ids than the short names people (and LLMs) pick.
 * e.g. most bank branches are "bank_or_credit_union", not "bank".
 */
const EXPAND: Record<string, readonly string[]> = {
  bank: ["bank", "bank_or_credit_union"],
  banque: ["bank", "bank_or_credit_union"],
  atm: ["atm", "bank_or_credit_union"],
  cafe: ["cafe", "coffee_shop"],
  café: ["cafe", "coffee_shop"],
  coffee_shop: ["cafe", "coffee_shop"],
  restaurant: ["restaurant"],
};

/**
 * Extra categories inferred from the question text when the LLM misses a synonym
 * (e.g. French "banc" / "banque" for a bank).
 */
const QUESTION_HINTS: { pattern: RegExp; categories: readonly string[] }[] = [
  // "banc" is often used for bank in Maghreb French; also match banque/bank.
  { pattern: /\b(bancs?|banques?|banks?)\b/i, categories: ["bank", "bank_or_credit_union", "atm"] },
  { pattern: /\b(atms?|distributeurs?(?:\s+automatiques?)?)\b/i, categories: ["atm", "bank_or_credit_union"] },
  { pattern: /\b(caf[eé]s?|coffee\s*shops?)\b/i, categories: ["cafe", "coffee_shop"] },
  { pattern: /\b(pharmacies?)\b/i, categories: ["pharmacy"] },
];

/**
 * Merges LLM categories with question hints and expands short ids to Overture parents.
 * Caps at 8 ids so the DuckDB filter stays selective.
 */
export function expandCategories(llmCategories: string[], question: string): string[] {
  const fromHints = QUESTION_HINTS.filter((h) => h.pattern.test(question)).flatMap((h) => h.categories);
  return unique([...llmCategories, ...fromHints].flatMap((id) => EXPAND[id] ?? [id])).slice(0, 8);
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
