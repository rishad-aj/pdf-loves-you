/* PDF Loves You — dependency-free static file server.
   Run `node server.js` (or double-click start.bat) and open the printed URL.
   Everything is served from this folder; no uploads or APIs are involved. */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".zip": "application/zip",
  ".wasm": "application/wasm"
};

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ "X-Content-Type-Options": "nosniff" }, headers || {}));
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, "Method not allowed", { "Content-Type": "text/plain; charset=utf-8", Allow: "GET, HEAD" });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch (e) {
    send(res, 400, "Bad request", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  let filePath = path.normalize(path.join(root, pathname === "/" ? "index.html" : pathname));
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (filePath !== root && !filePath.startsWith(rootWithSep)) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err) {
      send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      fs.stat(filePath, (err2, stat2) => {
        if (err2 || !stat2.isFile()) {
          send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
          return;
        }
        serveFile(filePath, stat2, req, res);
      });
      return;
    }
    serveFile(filePath, stat, req, res);
  });
});

function serveFile(filePath, stat, req, res) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const isAsset = /[\\/](vendor|assets|css|js)[\\/]/.test(filePath);
  const headers = {
    "Content-Type": type,
    "Content-Length": stat.size,
    "Cache-Control": isAsset ? "public, max-age=86400" : "no-cache"
  };
  if (req.method === "HEAD") {
    res.writeHead(200, headers);
    res.end();
    return;
  }
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) send(res, 500, "Could not read the file", { "Content-Type": "text/plain; charset=utf-8" });
    else res.destroy();
  });
  res.writeHead(200, headers);
  stream.pipe(res);
}

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error("Port " + port + " is already in use. Set PORT to a different number, e.g. PORT=5174 node server.js");
  } else {
    console.error(err);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log("PDF Loves You is running at http://" + host + ":" + port);
  console.log("Press Ctrl+C to stop. You can also open index.html directly from disk.");
});
