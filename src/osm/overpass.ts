import { distanceMeters } from "../geo.js";
import { MAX_RESULTS } from "../limits.js";
import type { LatLng, Place } from "../types.js";
import { USER_AGENT } from "../user-agent.js";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

type OsmFilter = { key: string; value?: string; religion?: string };

/** Place kinds from the LLM, mapped to OpenStreetMap tags. */
const OSM_FILTERS: Record<string, OsmFilter[]> = {
  restaurant: [{ key: "amenity", value: "restaurant" }],
  cafe: [{ key: "amenity", value: "cafe" }],
  coffee_shop: [{ key: "amenity", value: "cafe" }],
  bakery: [{ key: "shop", value: "bakery" }],
  bar: [{ key: "amenity", value: "bar" }, { key: "amenity", value: "pub" }],
  pharmacy: [{ key: "amenity", value: "pharmacy" }],
  hospital: [{ key: "amenity", value: "hospital" }],
  doctor: [{ key: "amenity", value: "doctors" }],
  dentist: [{ key: "amenity", value: "dentist" }],
  bank: [{ key: "amenity", value: "bank" }],
  atm: [{ key: "amenity", value: "atm" }],
  supermarket: [{ key: "shop", value: "supermarket" }],
  convenience_store: [{ key: "shop", value: "convenience" }],
  store: [{ key: "shop" }],
  shopping_mall: [{ key: "shop", value: "mall" }],
  clothing_store: [{ key: "shop", value: "clothes" }],
  mosque: [{ key: "amenity", value: "place_of_worship", religion: "muslim" }],
  church: [{ key: "amenity", value: "place_of_worship", religion: "christian" }],
  school: [{ key: "amenity", value: "school" }],
  university: [{ key: "amenity", value: "university" }],
  library: [{ key: "amenity", value: "library" }],
  museum: [{ key: "tourism", value: "museum" }],
  park: [{ key: "leisure", value: "park" }],
  hotel: [{ key: "tourism", value: "hotel" }],
  gym: [{ key: "leisure", value: "fitness_centre" }],
  gas_station: [{ key: "amenity", value: "fuel" }],
  parking: [{ key: "amenity", value: "parking" }],
  beauty_salon: [{ key: "shop", value: "beauty" }],
  hair_care: [{ key: "shop", value: "hairdresser" }],
};

export type OsmPlaceSearch = {
  center: LatLng;
  radiusMeters: number;
  includedTypes: string[];
  textQuery: string;
  limit: number;
};

type OsmElement = {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

export type OverpassDeps = {
  fetch?: typeof fetch;
};

/**
 * Finds named places inside a straight-line radius using the public Overpass API.
 * Rating and opening hours are left empty: OpenStreetMap does not provide a rating,
 * and hours are often missing, so v1 does not use them.
 */
export async function searchOsmPlaces(search: OsmPlaceSearch, deps: OverpassDeps = {}): Promise<Place[]> {
  const fetchFn = deps.fetch ?? fetch;
  const limit = Math.min(Math.max(Math.trunc(search.limit), 1), MAX_RESULTS);
  const radius = Math.min(Math.max(Math.round(search.radiusMeters), 1), 25_000);
  const query = buildQuery(search, radius);
  if (!query) return [];

  const response = await fetchFn(OVERPASS_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Overpass returned HTTP ${response.status}`);
  const json = (await response.json()) as { elements?: OsmElement[] };
  const elements = Array.isArray(json.elements) ? json.elements : [];

  const places = elements.flatMap((element) => {
    const place = toPlace(element);
    return place && distanceMeters(search.center, place.location) <= radius ? [place] : [];
  });

  const seen = new Set<string>();
  return places
    .sort((a, b) => distanceMeters(search.center, a.location) - distanceMeters(search.center, b.location))
    .filter((place) => {
      const key = `${place.name}|${place.location.lat.toFixed(5)}|${place.location.lng.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function buildQuery(search: OsmPlaceSearch, radius: number): string | null {
  const around = `(around:${radius},${search.center.lat},${search.center.lng})`;
  const filters = search.includedTypes.flatMap((type) => OSM_FILTERS[type] ?? []);
  const clauses = filters.map((filter) => clause(filter, around));
  if (clauses.length === 0 && search.textQuery.trim()) {
    const name = search.textQuery.replace(/[\\"{}]/g, "").slice(0, 80);
    if (name) clauses.push(`nwr["name"~"${name}",i]${around};`);
  }
  if (clauses.length === 0) return null;
  return `[out:json][timeout:25];(\n${clauses.join("\n")}\n);out center tags;`;
}

function clause(filter: OsmFilter, around: string): string {
  const value = filter.value ? `="${filter.value}"` : "";
  const religion = filter.religion ? `["religion"="${filter.religion}"]` : "";
  return `nwr["${filter.key}"${value}]${religion}${around};`;
}

export function toPlace(element: OsmElement): Place | null {
  const tags = element.tags ?? {};
  const name = tags["name"]?.trim();
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (!name || typeof lat !== "number" || typeof lng !== "number") return null;

  return {
    name,
    rating: null,
    description: describe(tags),
    phoneNumber: text(tags["phone"] ?? tags["contact:phone"]),
    website: text(tags["website"] ?? tags["contact:website"]),
    address: formatAddress(tags),
    location: { lat, lng },
    distanceMeters: null,
    streetDistance: { walking: null, driving: null, cycling: null },
    status: { state: "unknown", opensAt: null },
    travelTime: { walking: null, driving: null, cycling: null, transit: null },
  };
}

function describe(tags: Record<string, string>): string | null {
  if (tags["amenity"] === "place_of_worship" && tags["religion"] === "muslim") return "Mosque";
  if (tags["amenity"] === "place_of_worship" && tags["religion"] === "christian") return "Church";
  const raw = tags["amenity"] ?? tags["shop"] ?? tags["tourism"] ?? tags["leisure"];
  if (!raw) return null;
  const label = raw.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatAddress(tags: Record<string, string>): string | null {
  const street = [text(tags["addr:housenumber"]), text(tags["addr:street"])].filter(Boolean).join(" ");
  const parts = [street, text(tags["addr:city"])].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
