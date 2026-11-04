import { bboxAround } from "../geo.js";
import type { RunQuery } from "../overture/duckdb.js";
import { releasePath } from "../overture/release.js";
import type { GeocodeQuery, GeocodeResult } from "./types.js";

/**
 * Overture stores divisions as points, so the search area is approximated from the kind of
 * division. Countries are skipped: "cafés in Tunisia" is too broad to answer usefully.
 */
const RADIUS_METERS_BY_SUBTYPE: Record<string, number> = {
  dependency: 50_000,
  region: 25_000,
  county: 15_000,
  localadmin: 10_000,
  locality: 10_000,
  borough: 5_000,
  macrohood: 4_000,
  neighborhood: 2_000,
  microhood: 1_000,
};
const DEFAULT_RADIUS_METERS = 5_000;

/**
 * Backup geocoder, used only when Nominatim fails. Slow (5 to 12 seconds, it scans the
 * worldwide division names) but needs no other service. Matches the main name or any translation,
 * case-insensitively. In "Montmartre, Paris", divisions that lie inside "Paris" win; then the most
 * populated match wins.
 */
export async function geocodeWithOverture(
  run: RunQuery,
  release: string,
  query: GeocodeQuery,
): Promise<GeocodeResult | null> {
  const [name = "", ...rest] = query.place.split(",").map((part) => part.trim());
  if (name === "") return null;
  const parent = rest.find((part) => part !== "");
  const country = query.countryCode?.toUpperCase();

  const params: string[] = [name];
  const param = (value: string) => `$${params.push(value)}`;

  const countryFilter = country ? `AND country = ${param(country)}` : "";
  const insideParent = parent
    ? `list_contains(list_transform(flatten(hierarchies), lambda h: lower(h.name)), lower(${param(parent)})) DESC,`
    : "";

  const sql = `
    SELECT names.primary AS name, subtype, bbox.xmin AS lng, bbox.ymin AS lat
    FROM read_parquet('${releasePath(release, "divisions", "division")}')
    WHERE subtype <> 'country'
      ${countryFilter}
      AND (
        lower(names.primary) = lower($1)
        OR list_contains(list_transform(map_values(names.common), lambda n: lower(n)), lower($1))
      )
    ORDER BY ${insideParent} population DESC NULLS LAST
    LIMIT 1`;

  const rows = await run(sql, params);
  const row = rows[0];
  if (!row) return null;

  const center = { lat: Number(row["lat"]), lng: Number(row["lng"]) };
  const radius = RADIUS_METERS_BY_SUBTYPE[String(row["subtype"])] ?? DEFAULT_RADIUS_METERS;
  return {
    name: String(row["name"]),
    center,
    area: bboxAround(center, radius),
    source: "overture",
  };
}