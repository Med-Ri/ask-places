export const STAC_CATALOG_URL = "https://stac.overturemaps.org/catalog.json";

/** Overture publishes about once a month; checking once a day is enough. */
export const RELEASE_CACHE_MS = 24 * 60 * 60 * 1000;

/** Release ids look like "2026-10-21.0". The id ends up in an S3 path, so anything else is rejected. */
export function isReleaseId(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}\.\d+$/.test(value);
}

export function releasePath(release: string, theme: string, type: string): string {
  if (!isReleaseId(release)) throw new Error(`Invalid Overture release id: ${release}`);
  return `s3://overturemaps-us-west-2/release/${release}/theme=${theme}/type=${type}/*`;
}

let cached: { release: string; fetchedAt: number } | undefined;

/**
 * Returns the id of the latest Overture release, read from the official STAC catalog.
 * Old releases are removed from the bucket after a few months, so the id cannot be hard-coded.
 */
export async function getLatestRelease(fetchFn: typeof fetch = fetch, now = Date.now()): Promise<string> {
  if (cached && now - cached.fetchedAt < RELEASE_CACHE_MS) return cached.release;

  const response = await fetchFn(STAC_CATALOG_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Overture STAC catalog returned HTTP ${response.status}`);

  const catalog: unknown = await response.json();
  const release = (catalog as { latest?: unknown } | null)?.latest;
  if (!isReleaseId(release)) {
    throw new Error("Overture STAC catalog has no valid 'latest' release");
  }

  cached = { release, fetchedAt: now };
  return release;
}

/** Test helper: forget the cached release. */
export function resetReleaseCache(): void {
  cached = undefined;
}
