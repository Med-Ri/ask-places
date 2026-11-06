import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const port = 3081;
const files = {
  "/": { path: "./public/index.html", type: "text/html; charset=utf-8" },
  "/index.html": { path: "./public/index.html", type: "text/html; charset=utf-8" },
  "/styles.css": { path: "./public/styles.css", type: "text/css; charset=utf-8" },
  "/app.js": { path: "./public/app.js", type: "text/javascript; charset=utf-8" },
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const file = request.method === "GET" ? files[url.pathname] : undefined;
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const body = await readFile(new URL(file.path, import.meta.url));
  response.writeHead(200, { "content-type": file.type });
  response.end(body);
});

server.listen(port, () => {
  console.log(`Open http://127.0.0.1:${port}`);
});
