# Page

A local page. It has no API key, no provider, and no model. It calls the NestJS API.

Start the API first, from `examples/nestjs-api` (`npm start`, port 3080). The key lives in that folder's `.env`.

```bash
cd examples/node-basic
npm start
```

Open [http://127.0.0.1:3081](http://127.0.0.1:3081). The page sends the question to `POST http://127.0.0.1:3080/places`. If you allow location, that point is sent too. If you do not, the search still runs.
