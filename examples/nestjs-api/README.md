# NestJS example

An HTTP endpoint a web or mobile app can call. The LLM key stays on the server. The page sends the question. The user's location is included only when they allow it.

```bash
cd examples/nestjs-api
npm install
cp .env.example .env   # then put your key in .env
npm start
```

The server reads `.env` in this folder. `GROQ_API_KEY` is enough when `LLM_PROVIDER=groq`. `LLM_MODEL` is optional. `ORIGIN` is `lat,lng` for "near me". The port is `PORT` (3080).

The page in `examples/node-basic` calls this API. It does not receive the key, the provider, or the model.

```http
POST /places
Content-Type: application/json

{
  "question": "pharmacy",
  "origin": { "lat": 36.801054, "lng": 10.140123 }
}
```

The response is `{ places, answer, attribution }`. Show `attribution` (`© OpenStreetMap contributors`) next to the places.

A bad question is HTTP 400 with `{ code, message }`. A search failure is HTTP 500 with a generic message. The key is never returned.
