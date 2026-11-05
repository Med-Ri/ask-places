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
import { addTravelTimes, travelOrigin } from "../src/routing/travel-times.js";

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
const found = await time("search (cold)", () => searchPlaces(runQuery, search));
await time("search (warm, same query)", () => searchPlaces(runQuery, search));

const origin = travelOrigin(undefined, location.center);
const places = await time("travel times", () => addTravelTimes(found, origin));

const minutes = (value: number | null) => (value === null ? "-" : `${value} min`);
console.log(`\n${places.length} places (travel times from ${location.name}):`);
for (const p of places) {
  const t = p.travelTime;
  console.log(`- ${p.name} | ${p.description ?? "-"} | ${p.phoneNumber ?? "-"} | ${p.address ?? "-"}`);
  console.log(`    walk ${minutes(t.walking)}, car ${minutes(t.driving)}, bike ${minutes(t.cycling)}`);
}
