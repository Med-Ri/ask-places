/**
 * Manual check against the real services (not part of the package or of `npm test`).
 *
 *   npm run try:search -- "Lac 2, Tunis" cafe coffee_shop
 *   npm run try:search -- "Montmartre, Paris" restaurant
 */
import { geocode } from "../src/geocode/geocode.js";
import { runQuery } from "../src/overture/duckdb.js";
import { searchPlaces } from "../src/overture/places.js";
import { getLatestRelease } from "../src/overture/release.js";

const [place, ...categories] = process.argv.slice(2);
if (!place) {
  console.error('Usage: npm run try:search -- "<place>" [category...]');
  process.exit(1);
}

const time = async <T>(label: string, task: () => Promise<T>): Promise<T> => {
  const start = performance.now();
  const result = await task();
  console.log(`${label}: ${Math.round(performance.now() - start)} ms`);
  return result;
};

const release = await time("latest release", () => getLatestRelease());
console.log(`  ${release}`);

const location = await time("geocode", () => geocode({ place }));
if (!location) {
  console.log("  place not found -> []");
  process.exit(0);
}
console.log(`  ${location.name} (${location.source})`, location.center);

const search = { release, area: location.area, categories };
const places = await time("search (cold)", () => searchPlaces(runQuery, search));
await time("search (warm, same query)", () => searchPlaces(runQuery, search));

console.log(`\n${places.length} places:`);
for (const p of places) {
  console.log(`- ${p.name} | ${p.description ?? "-"} | ${p.phoneNumber ?? "-"} | ${p.website ?? "-"} | ${p.address ?? "-"}`);
}
