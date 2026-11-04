import { afterEach, describe, expect, it } from "vitest";
import {
  getLatestRelease,
  isReleaseId,
  RELEASE_CACHE_MS,
  releasePath,
  resetReleaseCache,
  STAC_CATALOG_URL,
} from "../src/overture/release.js";
import { fakeFetch } from "./helpers.js";

afterEach(() => resetReleaseCache());

describe("getLatestRelease", () => {
  it("reads the 'latest' field of the STAC catalog", async () => {
    const fetchFn = fakeFetch({ type: "Catalog", latest: "2026-10-21.0" });
    expect(await getLatestRelease(fetchFn)).toBe("2026-10-21.0");
    expect(fetchFn.mock.calls[0]?.[0]).toBe(STAC_CATALOG_URL);
  });

  it("asks the catalog only once a day", async () => {
    const fetchFn = fakeFetch({ latest: "2026-10-21.0" });
    await getLatestRelease(fetchFn, 0);
    await getLatestRelease(fetchFn, RELEASE_CACHE_MS - 1);
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await getLatestRelease(fetchFn, RELEASE_CACHE_MS);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("fails on an HTTP error", async () => {
    await expect(getLatestRelease(fakeFetch({}, 503))).rejects.toThrow("HTTP 503");
  });

  it.each([
    ["missing", {}],
    ["not a release id", { latest: "latest" }],
    ["an S3 path trick", { latest: "2026-10-21.0/../../other" }],
  ])("rejects a 'latest' value that is %s", async (_label, body) => {
    await expect(getLatestRelease(fakeFetch(body))).rejects.toThrow("no valid 'latest' release");
  });
});

describe("releasePath", () => {
  it("builds the S3 path of a theme", () => {
    expect(releasePath("2026-10-21.0", "places", "place")).toBe(
      "s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/*",
    );
  });

  it("refuses anything that is not a release id", () => {
    expect(isReleaseId("2026-10-21.1")).toBe(true);
    expect(() => releasePath("x'; DROP TABLE", "places", "place")).toThrow("Invalid Overture release id");
  });
});
