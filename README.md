# askplaces

Ask for places in plain language and get structured JSON back.

`askplaces` runs on your backend. Your LLM key is used only to understand the question. Place data, geocoding, and travel times come from [OpenStreetMap](https://www.openstreetmap.org/copyright). There is no map-vendor key and no billing account for map data.

> Early development. Not published on npm yet. See [BRIEF.md](BRIEF.md).

## Install

Requires Node.js 22 or newer.

```bash
npm install askplaces
```

Until the package is published, install this folder from your app:

```bash
npm install ./askplaces
```

Keep the LLM key on the server. A browser or mobile app should call your backend. See [examples/nestjs-api](examples/nestjs-api).

## How to use

```ts
import { askPlaces } from "askplaces";

const result = await askPlaces("pharmacy", {
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
  origin: { lat, lng }, // the user's current position
  // model: "gpt-4.1-mini",   // optional; a default is used when omitted
  // radiusMeters: 1500,      // optional; straight-line meters
});

if (result.answer) {
  // The question was not about finding a place.
  console.log(result.answer);
} else {
  console.log(result.places);
}
```

`origin` is the point travel is measured from. Pass the user's GPS position for a "near me" question. If the question names a place instead, that place is geocoded and used as the center when `origin` is omitted.

`radiusMeters` overrides a radius written in the question. When neither is set, the search starts at 1.5 km and widens until there are 20 places or the radius reaches 25 km. An explicit radius stays fixed.

Results are ordered nearest first, at most 20. The same geocode or place search is reused for 10 minutes.

A question that is not about finding a place, such as weather, math, or a greeting, does not search. `places` is `[]` and `answer` is a short reply. `places` is also `[]` when nothing is inside the radius. In that case `answer` is `null`.

## LLM providers

One key is required: the key for the provider that reads the question. Names are lowercase.

`provider: "google"` means Gemini. It is not a Google Maps key.

| `provider` | Where to get the key | Default model |
|---|---|---|
| `openai` | platform.openai.com | `gpt-4.1-mini` |
| `anthropic` | console.anthropic.com | `claude-haiku-4-5` |
| `google` | aistudio.google.com | `gemini-3.8-flash` |
| `xai` | console.x.ai | `grok-4.20-non-reasoning` |
| `deepseek` | platform.deepseek.com | `deepseek-flash` |
| `groq` | console.groq.com (`gsk_…`) | `openai/gpt-oss-20b` |

Pass `model` to use a different model id for that provider. Groq is not the same service as xAI.

## Language

The question may be written in any language. The model reads intent, including typos and indirect wording, and turns it into a place search.

When the question is not about places, `answer` is a short fixed reply. That reply is in Arabic if the question uses Arabic script, in French if the question looks French, and in English otherwise. It does not answer the off-topic question.

## Result

```ts
type AskPlacesResult = {
  places: Place[];
  answer: string | null;
};
```

| Field | Meaning |
|---|---|
| `name` | Name from OpenStreetMap |
| `description` | Short category label, such as "Cafe" |
| `phoneNumber`, `website`, `address` | Set only when OpenStreetMap has them, otherwise `null` |
| `location` | `{ lat, lng }` |
| `distanceMeters` | Straight-line meters from the travel origin |
| `streetDistance` | Road meters for `walking`, `driving`, and `cycling`. A mode is `null` when the route could not be calculated |
| `travelTime` | Minutes for those same three modes. `transit` is always `null` |
| `rating` | Always `null`. OpenStreetMap has no rating |
| `status` | Always `{ state: "unknown", opensAt: null }`. Opening hours are not used |

## Errors

Check `error.code`. The API key never appears in a message.

`AskPlacesUsageError` means the call was made incorrectly, or the LLM account rejected it. `AskPlacesInternalError` means the search failed for another reason. Its message is generic. The original error is on `error.cause` for your logs.

| Code | When |
|---|---|
| `INVALID_QUESTION` | Missing, empty, not a string, or longer than 500 characters |
| `INVALID_OPTIONS` | Options are missing, or `model` or `radiusMeters` is invalid |
| `UNSUPPORTED_PROVIDER` | `provider` is not one of the six names above |
| `MISSING_API_KEY` | `apiKey` is missing or blank |
| `INVALID_API_KEY` | The provider rejected the key |
| `PROVIDER_QUOTA` | The account has no credits, or billing is required |
| `PROVIDER_BUSY` | The model is temporarily overloaded |
| `PROVIDER_TIMEOUT` | The LLM call timed out |
| `INVALID_ORIGIN` | `origin.lat` or `origin.lng` is out of range |
| `INTERNAL_ERROR` | OpenStreetMap failed, or something unexpected failed |

`radiusMeters` must be between 50 and 25000. `origin.lat` must be between -90 and 90. `origin.lng` must be between -180 and 180.

## OpenStreetMap

OpenStreetMap supplies the places and the roads. No key is required for that data.

| Step | Service |
|---|---|
| Understand the question | Your LLM provider |
| Place name to coordinates | Nominatim |
| Places inside the radius | Overpass |
| Street distance and walk, car, and bike time | Valhalla |

Show this attribution wherever you display the results:

[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)

## Examples

- [examples/nestjs-api](examples/nestjs-api) holds the LLM key, provider, and model, and exposes `POST /places`.
- [examples/node-basic](examples/node-basic) is a local page that calls that API. It sends the question and the browser's current location. It does not hold a key.

## Development

```bash
nvm use
npm install
npm test
npm run typecheck
npm run build
npm run try:ask -- --provider openai --origin <lat>,<lng> "pharmacy"
```

`npm run build` writes ESM, CommonJS, and type definitions to `dist/`.

## License

[MIT](LICENSE)
