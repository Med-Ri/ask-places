import { describe, expect, it } from "vitest";
import { filterPlacesToIntent } from "../src/llm/match-intent.js";
import type { Place } from "../src/types.js";

const place = (name: string, description: string | null): Place => ({
  name,
  rating: null,
  description,
  phoneNumber: null,
  website: null,
  address: null,
  location: { lat: 36.8, lng: 10.14 },
  distanceMeters: null,
  streetDistance: { walking: null, driving: null, cycling: null },
  status: { state: "unknown", opensAt: null },
  travelTime: { walking: null, driving: null, cycling: null, transit: null },
});

describe("filterPlacesToIntent", () => {
  it("keeps mosques and drops churches for muslim searches", () => {
    const places = [
      place("جامع الباي", "Muslim place of worship"),
      place("Mosquée Bardo", "Muslim place of worship"),
      place("Église Sainte-Monique", "Christian place of worship"),
      place("Some NGO", "Religious organization"),
    ];
    const kept = filterPlacesToIntent(places, ["mosque"]);
    expect(kept.map((p) => p.name)).toEqual(["جامع الباي", "Mosquée Bardo", "Some NGO"]);
  });
});
