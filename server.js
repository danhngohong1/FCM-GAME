// server.js — server tĩnh nhỏ cho game "Đập Tôi" (chỉ dùng thư viện có sẵn của Node.js)
// Phục vụ app/, design/, assets/; "/" chuyển sang /app/ để đường dẫn ../design và ../assets trong game đúng.
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = __dirname;
const ALLOWED_DIRS = ["app", "design", "assets"];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  res.on("finish", () => {
    console.log(`${req.method} ${req.url} ${res.statusCode}`);
  });

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad Request");
  }

  if (pathname === "/" || pathname === "/app") {
    res.writeHead(302, { Location: "/app/" });
    return res.end();
  }
  if (pathname === "/healthz") return send(res, 200, "ok");
  if (pathname.endsWith("/")) pathname += "index.html";

  // Chỉ cho phép đọc trong các thư mục được liệt kê, chặn "../"
  const filePath = path.resolve(ROOT, "." + pathname);
  const allowed = ALLOWED_DIRS.some((dir) => filePath.startsWith(path.join(ROOT, dir) + path.sep));
  if (!allowed) return send(res, 404, "Not Found");

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Not Found");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Đập Tôi đang chạy tại http://localhost:${PORT}/`);
});

// Dừng nhanh khi Docker gửi tín hiệu
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`Nhận ${signal}, đang dừng server…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
