/**
 * End-to-end check against real services. Needs a real LLM key in the environment.
 *
 *   OPENAI_API_KEY=sk-… npm run try:ask -- "cafés near Lac 2, Tunis"
 *   ANTHROPIC_API_KEY=… npm run try:ask -- --provider anthropic "pharmacies in Sfax"
 */
import { askPlaces } from "../src/ask-places.js";
import { DEFAULT_MODELS } from "../src/llm/models.js";
import type { Provider } from "../src/types.js";

const args = process.argv.slice(2);
let provider: Provider = "openai";
const questionParts: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--provider" && args[i + 1]) {
    provider = args[++i] as Provider;
  } else if (args[i]) {
    questionParts.push(args[i]!);
  }
}
const question = questionParts.join(" ").trim();
if (!question) {
  console.error('Usage: npm run try:ask -- [--provider openai] "cafés near Lac 2, Tunis"');
  process.exit(1);
}

const envKey: Record<Provider, string | undefined> = {
  openai: process.env["OPENAI_API_KEY"],
  anthropic: process.env["ANTHROPIC_API_KEY"],
  google: process.env["GOOGLE_GENERATIVE_AI_API_KEY"] ?? process.env["GOOGLE_API_KEY"],
  xai: process.env["XAI_API_KEY"],
  deepseek: process.env["DEEPSEEK_API_KEY"],
};
const apiKey = envKey[provider];
if (!apiKey) {
  console.error(`Missing API key for "${provider}". Set the matching environment variable.`);
  process.exit(1);
}

console.log(`provider=${provider} model=${DEFAULT_MODELS[provider]}`);
const start = performance.now();
const places = await askPlaces(question, { provider, apiKey });
console.log(`${places.length} places in ${Math.round(performance.now() - start)} ms\n`);
for (const p of places) {
  const t = p.travelTime;
  const mins = (v: number | null) => (v === null ? "-" : `${v} min`);
  console.log(`- ${p.name} | ${p.description ?? "-"} | ${p.phoneNumber ?? "-"}`);
  console.log(
    `    walk ${mins(t.walking)}, car ${mins(t.driving)}, bike ${mins(t.cycling)}, transit ${t.transit ? `${t.transit.minutes} min (est.)` : "-"}`,
  );
}
