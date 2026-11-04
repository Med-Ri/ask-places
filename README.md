# askplaces

Ask a question about places in plain language and get structured JSON back, using your own LLM key.

> **Status:** early development. Not published on npm yet. See [BRIEF.md](BRIEF.md) for the plan.

```ts
import { askPlaces } from "askplaces";

const places = await askPlaces("cafés near Lac 2, Tunis", {
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
});
// -> [{ name, rating, description, phoneNumber, website, address, location, status, travelTime }]
```

- Backend only (Node.js 22+): your LLM key must never be shipped to a browser or mobile app.
- Only your LLM API key is required. Place data comes from [Overture Maps](https://overturemaps.org).

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
