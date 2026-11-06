# askplaces

Ask a question about places in plain language and get structured JSON back.

The package uses **your LLM key** to understand the question and **OpenStreetMap** to find places.
No Google key and no billing account. The radius is straight-line distance. Walk, car, and bike
times and street distances come from Valhalla (OpenStreetMap roads). Rating and opening hours
are always empty.

> **Status:** early development. Not published on npm yet. See [BRIEF.md](BRIEF.md).

```ts
import { askPlaces } from "askplaces";

const places = await askPlaces("أنا مسلم و أريد أن أصلي", {
  provider: "groq",
  apiKey: process.env.GROQ_API_KEY,
  origin: { lat: 36.801054, lng: 10.140123 }, // GPS, required for "near me"
  // radiusMeters: 1500,                      // default 1.5 km, straight-line
});
```

- Backend only (Node.js 22+). The LLM key must stay on the server.
- Up to 20 places, nearest by straight-line distance. With no radius in the question, the search starts at 1.5 km and widens until there are 20 places, or it reaches 25 km. A radius you set ("within 500 m", or `radiusMeters`) stays fixed. `[]` when nothing is inside that radius.
- `rating` is `null`. `status` is `"unknown"`. `description` is a short category label ("Mosque").
- `distanceMeters` is straight-line. `streetDistance` and `travelTime` are the road route.
- `travelTime.transit` is `null`.
- Show OpenStreetMap attribution with the results.

## Development

```bash
nvm use          # Node 24 (see .nvmrc)
npm install
npm test         # run the tests
npm run typecheck
npm run build    # outputs ESM + CommonJS + type definitions to dist/
```

## License

[MIT](LICENSE)
