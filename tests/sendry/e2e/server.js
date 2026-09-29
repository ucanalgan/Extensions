// Tiny static server for the e2e test pages. It listens on every interface so the same pages are
// reachable as http://localhost:PORT and http://127.0.0.1:PORT, which the browser treats as two
// different origins; that is how the cross-origin iframe test gets a real cross-origin frame.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "pages");
const port = Number(process.argv[2] || 4319);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

http
  .createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const file = path.join(root, name);
    if (!file.startsWith(root) || !fs.existsSync(file)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  })
  .listen(port);
