import { listValue } from "@duckdb/node-api";
import { bboxCenter, type BBox } from "../geo.js";
import type { Place } from "../types.js";
import type { Row, RunQuery } from "./duckdb.js";
import { releasePath } from "./release.js";

export const MAX_RESULTS = 20;

/** Overture's own score of how sure it is that a place exists. Below this, many places are stale. */
export const MIN_CONFIDENCE = 0.5;

export type PlaceSearch = {
  release: string;
  area: BBox;
  /**
   * Overture category ids, e.g. ["cafe", "coffee_shop"]. A place matches if any of them appears
   * in its category hierarchy, so broad ids like "food_and_drink" work too. Empty = any category.
   */
  categories: string[];
  limit?: number;
};

/**
 * Finds places inside an area, closest to the area's center first.
 * Values are passed as query parameters, never pasted into the SQL text.
 */
export async function searchPlaces(run: RunQuery, search: PlaceSearch): Promise<Place[]> {
  const limit = Math.min(Math.max(Math.trunc(search.limit ?? MAX_RESULTS), 1), MAX_RESULTS);
  const center = bboxCenter(search.area);
  const filterByCategory = search.categories.length > 0;

  const source = `read_parquet('${releasePath(search.release, "places", "place")}')`;
  const inArea = (table: string) => `${table}bbox.xmin BETWEEN $1 AND $2 AND ${table}bbox.ymin BETWEEN $3 AND $4`;

  // Two stages: pick the nearest ids using only small columns, then read the details of those few
  // places (about 3x faster for a whole city). MATERIALIZED keeps the sort out of the Parquet scan:
  // sorting directly on bbox fields crashes DuckDB 2.0 ("Vector::Reference used on vector of different type").
  const sql = `
    WITH matches AS MATERIALIZED (
      SELECT id, bbox.xmin AS lng, bbox.ymin AS lat
      FROM ${source}
      WHERE ${inArea("")}
        AND confidence >= $5
        AND operating_status IS DISTINCT FROM 'permanently_closed'
        AND names.primary IS NOT NULL
        ${filterByCategory ? "AND list_has_any(taxonomy.hierarchy, $8)" : ""}
    ),
    nearest AS MATERIALIZED (
      SELECT id, lng, lat FROM matches
      ORDER BY (lng - $6) ^ 2 + (lat - $7) ^ 2
      LIMIT ${limit}
    )
    SELECT
      p.names.primary AS name,
      p.taxonomy.primary AS category,
      p.brand.names.primary AS brand,
      p.phones[1] AS phone,
      p.websites[1] AS website,
      p.addresses[1] AS address,
      p.operating_status,
      n.lng,
      n.lat
    FROM ${source} p
    JOIN nearest n ON p.id = n.id
    WHERE ${inArea("p.")}
    ORDER BY (n.lng - $6) ^ 2 + (n.lat - $7) ^ 2`;

  const params = [
    search.area.west,
    search.area.east,
    search.area.south,
    search.area.north,
    MIN_CONFIDENCE,
    center.lng,
    center.lat,
    ...(filterByCategory ? [listValue(search.categories)] : []),
  ];

  const rows = await run(sql, params);
  return rows.map(rowToPlace);
}

/** Turns one Overture row into a Place. Travel times are filled in later (step 4). */
export function rowToPlace(row: Row): Place {
  return {
    name: String(row["name"]),
    rating: null,
    description: describePlace(text(row["category"]), text(row["brand"])),
    phoneNumber: text(row["phone"]),
    website: text(row["website"]),
    address: formatAddress(row["address"]),
    location: { lat: Number(row["lat"]), lng: Number(row["lng"]) },
    status: {
      state: row["operating_status"] === "temporarily_closed" ? "closed" : "unknown",
      opensAt: null,
    },
    travelTime: { walking: null, driving: null, cycling: null, transit: null },
  };
}

/** "coffee_shop" + "Starbucks" -> "Coffee shop (Starbucks)". Only real Overture data, nothing invented. */
export function describePlace(category: string | null, brand: string | null): string | null {
  const label = category ? capitalize(category.replaceAll("_", " ")) : null;
  if (label && brand) return `${label} (${brand})`;
  return label ?? brand;
}

/** "Avenue Habib Bourguiba", "2045", "Tunis", "TN" -> "Avenue Habib Bourguiba, 2045 Tunis, TN". */
export function formatAddress(address: unknown): string | null {
  if (typeof address !== "object" || address === null) return null;
  const a = address as Record<string, unknown>;
  const cityLine = [text(a["postcode"]), text(a["locality"])].filter(Boolean).join(" ");
  const parts = [text(a["freeform"]), cityLine, text(a["country"])].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
