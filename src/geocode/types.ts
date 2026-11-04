import type { BBox } from "../geo.js";
import type { LatLng } from "../types.js";

export type GeocodeResult = {
  /** Name as found by the geocoder, e.g. "Montmartre". */
  name: string;
  center: LatLng;
  /** Area to search for places in. */
  area: BBox;
  source: "nominatim" | "overture";
};

export type GeocodeQuery = {
  /** Place name taken from the question, e.g. "Lac 2, Tunis". */
  place: string;
  /** ISO 3166-1 alpha-2 code when known, e.g. "TN". Makes results much more reliable. */
  countryCode?: string;
};
