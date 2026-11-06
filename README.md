# askplaces

Ask a question about places in plain language and get structured JSON back.

The package uses **your LLM key** to understand the question and **OpenStreetMap** to find places.
No Google key and no billing account. The radius is straight-line distance. Walk, car, and bike
times and street distances come from Valhalla (OpenStreetMap roads). Rating and opening hours
are always empty.

> **Status:** early development. Not published on npm yet. See [BRIEF.md](BRIEF.md).

## Install

Node.js 22 or newer.

```bash
npm install askplaces
```

Until the package is on npm, install it from this folder (`npm install ./askplaces` in your app).

## LLM key

One key only: the key for the provider that reads the question. Keep it on the server. Do not put it in a browser or a mobile app. A web or mobile client should call your backend. See [examples/nestjs-api](examples/nestjs-api).

`provider: "google"` means Gemini. It is not a Google Maps key.

| `provider` | Key from | Default model |
|---|---|---|
| `openai` | platform.openai.com | `gpt-4.1-mini` |
| `anthropic` | console.anthropic.com | `claude-haiku-4-5` |
| `google` | aistudio.google.com (Gemini) | `gemini-3.8-flash` |
| `xai` | console.x.ai | `grok-4.20-non-reasoning` |
| `deepseek` | platform.deepseek.com | `deepseek-flash` |
| `groq` | console.groq.com (`gsk_…`) | `openai/gpt-oss-20b` |

Pass `model` to override the default. Provider names are lowercase (`"openai"`, not `"OpenAI"`).

```ts
import { askPlaces } from "askplaces";

const result = await askPlaces("أنا مسلم و أريد أن أصلي", {
  provider: "groq",
  apiKey: process.env.GROQ_API_KEY,
  origin: { lat: 36.801054, lng: 10.140123 }, // GPS, required for "near me"
  // radiusMeters: 1500,                      // default 1.5 km, straight-line
});
```

- A question that is not about finding a place (weather, jokes, math, greetings) returns `answer` and does not search.
- Up to 20 places, nearest by straight-line distance. With no radius in the question, the search starts at 1.5 km and widens until there are 20 places, or it reaches 25 km. A radius you set ("within 500 m", or `radiusMeters`) stays fixed.
- The same geocode or place search is reused for 10 minutes.

## Output

```ts
{
  places: Place[],
  answer: string | null
}
```

`answer` is a short friendly reply when the question is not about places, and `null` when it is. `places` is `[]` when nothing is inside the radius.

Each place:

| Field | Meaning |
|---|---|
| `name` | Name from OpenStreetMap |
| `rating` | Always `null` |
| `description` | Short category label, such as "Cafe" |
| `phoneNumber`, `website`, `address` | Filled only when OpenStreetMap has them |
| `location` | `{ lat, lng }` |
| `distanceMeters` | Straight-line meters from the origin |
| `streetDistance` | Road meters: `walking`, `driving`, `cycling` (`null` if that mode failed) |
| `status` | Always `{ state: "unknown", opensAt: null }` |
| `travelTime` | Minutes for `walking`, `driving`, `cycling`. `transit` is always `null` |

## Errors

Check `error.code`. Usage mistakes are `AskPlacesUsageError`. Anything else is `AskPlacesInternalError` with a generic message; the original error is on `error.cause` for your logs. The API key is never included.

| Code | When |
|---|---|
| `INVALID_QUESTION` | Missing, empty, not a string, or longer than 500 characters |
| `INVALID_OPTIONS` | Options are missing, or `model` / `radiusMeters` is invalid |
| `UNSUPPORTED_PROVIDER` | `provider` is not one of the six names |
| `MISSING_API_KEY` | `apiKey` is missing or blank |
| `INVALID_API_KEY` | The provider rejected the key |
| `PROVIDER_QUOTA` | No credits, or billing is required |
| `PROVIDER_BUSY` | The model is overloaded |
| `PROVIDER_TIMEOUT` | The LLM call timed out |
| `INVALID_ORIGIN` | `origin.lat` / `origin.lng` is out of range |
| `INTERNAL_ERROR` | OpenStreetMap or an unexpected failure |

## Examples

- [examples/nestjs-api](examples/nestjs-api) — `POST /places`. The LLM key, provider, and model stay here.
- [examples/node-basic](examples/node-basic) — a local page at http://127.0.0.1:3081 that calls that API. No key in the page.

## Attribution

Place data, geocoding, and routes come from OpenStreetMap. Show this next to the results:

[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)

## Development

```bash
nvm use          # Node 24 (see .nvmrc)
npm install
npm test         # run the tests
npm run typecheck
npm run build    # outputs ESM + CommonJS + type definitions to dist/
npm run try:ask -- --provider groq --origin 36.801054,10.140123 "pharmacy"
```

## License

[MIT](LICENSE)
