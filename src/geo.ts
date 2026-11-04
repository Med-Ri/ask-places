import type { LatLng } from "./types.js";

/** A map rectangle in degrees: west/east are longitudes, south/north are latitudes. */
export type BBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const METERS_PER_DEGREE_LAT = 111_320;

/** Square area of about `radiusMeters` around a point (good enough for search areas, not for routing). */
export function bboxAround(center: LatLng, radiusMeters: number): BBox {
  const dLat = radiusMeters / METERS_PER_DEGREE_LAT;
  const cosLat = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01);
  const dLng = radiusMeters / (METERS_PER_DEGREE_LAT * cosLat);
  return {
    west: Math.max(center.lng - dLng, -180),
    south: Math.max(center.lat - dLat, -90),
    east: Math.min(center.lng + dLng, 180),
    north: Math.min(center.lat + dLat, 90),
  };
}

/** Grows `bbox` so it covers at least `radiusMeters` around `center` (a landmark's own box is tiny). */
export function expandToAtLeast(bbox: BBox, center: LatLng, radiusMeters: number): BBox {
  const minimum = bboxAround(center, radiusMeters);
  return {
    west: Math.min(bbox.west, minimum.west),
    south: Math.min(bbox.south, minimum.south),
    east: Math.max(bbox.east, minimum.east),
    north: Math.max(bbox.north, minimum.north),
  };
}

/** Shrinks `bbox` so it stays within `radiusMeters` of `center` (a country's box is far too big to scan). */
export function shrinkToAtMost(bbox: BBox, center: LatLng, radiusMeters: number): BBox {
  const maximum = bboxAround(center, radiusMeters);
  return {
    west: Math.max(bbox.west, maximum.west),
    south: Math.max(bbox.south, maximum.south),
    east: Math.min(bbox.east, maximum.east),
    north: Math.min(bbox.north, maximum.north),
  };
}

export function bboxCenter(bbox: BBox): LatLng {
  return { lat: (bbox.south + bbox.north) / 2, lng: (bbox.west + bbox.east) / 2 };
}
