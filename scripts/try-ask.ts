/**
 * End-to-end check against the LLM and OpenStreetMap. Needs an LLM key only.
 *
 *   GROQ_API_KEY=gsk_… npm run try:ask -- --provider groq --origin 36.801054,10.140123 "mosquée"
 */
import { askPlaces } from "../src/ask-places.js";
import { DEFAULT_MODELS } from "../src/llm/models.js";
import type { LatLng, Provider } from "../src/types.js";

const args = process.argv.slice(2);
let provider: Provider = "openai";
let model: string | undefined;
let origin: LatLng | undefined;
let radiusMeters: number | undefined;
const questionParts: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--provider" && args[i + 1]) {
    provider = args[++i] as Provider;
  } else if (args[i] === "--model" && args[i + 1]) {
    model = args[++i];
  } else if (args[i] === "--origin" && args[i + 1]) {
    origin = parseOrigin(args[++i]!);
  } else if (args[i] === "--radius" && args[i + 1]) {
    radiusMeters = parseRadius(args[++i]!);
  } else if (args[i]) {
    questionParts.push(args[i]!);
  }
}
const question = questionParts.join(" ").trim();
if (!question) {
  console.error(
    'Usage: npm run try:ask -- [--provider groq] [--origin 36.80,10.14] [--radius 1500] "mosquée"',
  );
  process.exit(1);
}

const envKey: Record<Provider, string | undefined> = {
  openai: process.env["OPENAI_API_KEY"],
  anthropic: process.env["ANTHROPIC_API_KEY"],
  google: process.env["GOOGLE_GENERATIVE_AI_API_KEY"] ?? process.env["GOOGLE_API_KEY"],
  xai: process.env["XAI_API_KEY"],
  deepseek: process.env["DEEPSEEK_API_KEY"],
  groq: process.env["GROQ_API_KEY"],
};
const apiKey = envKey[provider];
if (!apiKey) {
  console.error(`Missing API key for "${provider}". Set the matching environment variable.`);
  process.exit(1);
}

const chosenModel = model ?? DEFAULT_MODELS[provider];
console.log(
  `provider=${provider} model=${chosenModel}` +
    `${origin ? ` origin=${origin.lat},${origin.lng}` : ""}` +
    `${radiusMeters !== undefined ? ` radius=${radiusMeters}m` : ""}`,
);

const start = performance.now();
try {
  const places = await askPlaces(question, {
    provider,
    apiKey,
    ...(model ? { model } : {}),
    ...(origin ? { origin } : {}),
    ...(radiusMeters !== undefined ? { radiusMeters } : {}),
  });
  console.log(`\n${places.length} places in ${Math.round(performance.now() - start)} ms\n`);
  for (const p of places) {
    const t = p.travelTime;
    const s = p.streetDistance;
    const mins = (v: number | null) => (v === null ? "-" : `${v} min`);
    const meters = (v: number | null) => (v === null ? "-" : `${v} m`);
    console.log(`- ${p.name} | ${p.description ?? "-"} | ${p.phoneNumber ?? "-"}`);
    console.log(`    ${p.address ?? "(no address)"}`);
    console.log(
      `    ${p.location.lat.toFixed(6)}, ${p.location.lng.toFixed(6)} | ${p.distanceMeters ?? "-"} m straight-line`,
    );
    console.log(
      `    walk ${mins(t.walking)} (${meters(s.walking)}), car ${mins(t.driving)} (${meters(s.driving)}), bike ${mins(t.cycling)} (${meters(s.cycling)})`,
    );
  }
} catch (error) {
  const err = error as { name?: string; code?: string; message?: string; cause?: unknown };
  console.error(`\n${err.name ?? "Error"} (${err.code ?? "?"}): ${err.message}`);
  if (err.cause instanceof Error) console.error(`cause: ${err.cause.name}: ${err.cause.message}`);
  process.exit(1);
}

function parseOrigin(value: string): LatLng {
  const [latRaw, lngRaw] = value.split(",");
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    console.error(`Invalid --origin "${value}". Expected lat,lng e.g. 36.801054,10.140123`);
    process.exit(1);
  }
  return { lat, lng };
}

function parseRadius(value: string): number {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters < 50 || meters > 25_000) {
    console.error(`Invalid --radius "${value}". Expected meters between 50 and 25000`);
    process.exit(1);
  }
  return Math.round(meters);
}
