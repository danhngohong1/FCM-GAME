// server.js — Server cho game "Đập Tôi": file tĩnh + API đăng ký người chơi + trang admin
// Căn cứ: docs/02 (F-12 → F-18), docs/04 (mục 11–19). Chỉ dùng thư viện có sẵn của Node.js và `pg`.
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { SERVER_CONFIG, loadConfig } = require("./server/config.js");
const { createWindowLimiter, createLoginGuard } = require("./server/limits.js");
const { createDb, isUnavailable } = require("./server/db.js");
const { csvHead, playerRow, csvFilename } = require("./server/csv.js");
const { validateRegistration } = require("./app/validate.js");

/* ---------- Cấu hình ---------- */

const loaded = loadConfig(process.env);
if (!loaded.ok) {
  for (const e of loaded.errors) console.error(`[cấu hình] ${e}`);
  console.error("[cấu hình] Server không khởi động. Sửa file .env rồi chạy lại.");
  process.exit(1);
}
const CFG = loaded.config;
const ROOT = __dirname;
const STATIC_DIRS = ["app", "design", "assets"];
const ADMIN_STATIC = new Set(["/admin/admin.css", "/admin/admin.js"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

const MSG = {
  unavailable: "Không kết nối được máy chủ. Vui lòng thử lại.",
  tooMany: "Bạn gửi quá nhiều lần. Vui lòng thử lại sau ít phút.",
  badLogin: "Tên đăng nhập hoặc mật khẩu không đúng.",
  unauthorized: "Phiên đăng nhập đã hết hạn.",
  notFound: "Người chơi không còn tồn tại.",
  forbidden: "Yêu cầu không hợp lệ.",
};

const db = createDb(CFG.databaseUrl);
let dbReady = false;

const registerLimiter = createWindowLimiter({
  max: SERVER_CONFIG.REGISTER_MAX,
  windowMs: SERVER_CONFIG.REGISTER_WINDOW_MIN * 60000,
});
const loginGuard = createLoginGuard({
  maxFails: SERVER_CONFIG.LOGIN_MAX_FAILS,
  windowMs: SERVER_CONFIG.LOGIN_WINDOW_MIN * 60000,
  lockMs: SERVER_CONFIG.LOGIN_LOCK_MIN * 60000,
});

/* ---------- Tiện ích HTTP ---------- */

class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra || {};
  }
}

function clientIp(req) {
  if (CFG.trustProxy) {
    const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (xff.length) return xff[xff.length - 1]; // địa chỉ do proxy của mình (Caddy) thêm vào
  }
  return req.socket.remoteAddress || "unknown";
}

function isHttps(req) {
  return CFG.trustProxy && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function sendJson(res, status, body, headers = {}) {
  const data = body === null ? "" : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(data);
}

function sendText(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

/** POST/DELETE phải có Origin trùng địa chỉ server (docs/04 · mục 17). */
function requireSameOrigin(req) {
  const origin = req.headers.origin;
  const expected = `${isHttps(req) ? "https" : "http"}://${req.headers.host}`;
  if (!origin || origin !== expected) throw new HttpError(403, "forbidden_origin", MSG.forbidden);
}

/** Đọc thân JSON, tối đa BODY_MAX_BYTES. */
function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers["content-type"] || "").toLowerCase();
    if (!type.startsWith("application/json")) {
      req.resume();
      return reject(new HttpError(415, "unsupported_media_type", "Dữ liệu phải ở dạng JSON."));
    }
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > SERVER_CONFIG.BODY_MAX_BYTES) {
      req.resume();
      return reject(new HttpError(413, "payload_too_large", "Dữ liệu gửi lên quá lớn."));
    }
    let size = 0;
    const chunks = [];
    let failed = false;
    req.on("data", (c) => {
      if (failed) return;
      size += c.length;
      if (size > SERVER_CONFIG.BODY_MAX_BYTES) {
        failed = true;
        reject(new HttpError(413, "payload_too_large", "Dữ liệu gửi lên quá lớn."));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (failed) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch {
        reject(new HttpError(400, "invalid_json", "Dữ liệu JSON không đọc được."));
      }
    });
    req.on("error", () => {
      if (!failed) reject(new HttpError(400, "bad_request", "Yêu cầu không hợp lệ."));
    });
  });
}

function sha256(s) {
  return crypto.createHash("sha256").update(String(s), "utf8").digest();
}

/** So sánh thời gian không đổi (docs/04 · mục 17). */
function safeEqual(a, b) {
  return crypto.timingSafeEqual(sha256(a), sha256(b));
}

function requireDb() {
  if (!dbReady) throw new HttpError(503, "db_unavailable", MSG.unavailable);
}

/* ---------- Phiên admin ---------- */

function sessionToken(req) {
  const t = parseCookies(req)[SERVER_CONFIG.SESSION_COOKIE];
  return t && /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : null;
}

async function hasSession(req) {
  const t = sessionToken(req);
  if (!t || !dbReady) return false;
  return db.isSessionValid(sha256(t).toString("hex"));
}

async function requireSession(req) {
  requireDb();
  if (!(await hasSession(req))) throw new HttpError(401, "unauthorized", MSG.unauthorized);
}

function sessionCookie(req, token, maxAgeSec) {
  const parts = [
    `${SERVER_CONFIG.SESSION_COOKIE}=${token}`,
    "Path=/admin",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${maxAgeSec}`,
  ];
  if (isHttps(req)) parts.push("Secure");
  return parts.join("; ");
}

/* ---------- Xử lý API ---------- */

async function apiRegister(req, res) {
  requireSameOrigin(req);
  const limit = registerLimiter.hit(clientIp(req));
  if (!limit.allowed) {
    throw new HttpError(429, "too_many_requests", MSG.tooMany, {
      headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
    });
  }
  const body = await readJson(req);
  const check = validateRegistration(body);
  if (!check.ok) throw new HttpError(400, "invalid_fields", "Dữ liệu chưa hợp lệ.", { fields: check.fields });
  requireDb();
  const p = await db.upsertPlayer(check.value);
  sendJson(res, p.inserted ? 201 : 200, { id: p.id, fullName: p.fullName });
}

async function apiGetPlayer(req, res, id) {
  if (!UUID_RE.test(id)) throw new HttpError(404, "not_found", MSG.notFound);
  requireDb();
  const p = await db.getPlayer(id);
  if (!p) throw new HttpError(404, "not_found", MSG.notFound);
  sendJson(res, 200, p);
}

async function apiLogin(req, res) {
  requireSameOrigin(req);
  const ip = clientIp(req);
  const lock = loginGuard.check(ip);
  if (lock.locked) {
    const minutes = Math.ceil(lock.retryAfterMs / 60000);
    throw new HttpError(429, "login_locked", `Đăng nhập sai quá nhiều lần. Thử lại sau ${minutes} phút.`, {
      retryAfterMinutes: minutes,
      headers: { "Retry-After": String(Math.ceil(lock.retryAfterMs / 1000)) },
    });
  }
  const body = await readJson(req);
  const username = body && typeof body.username === "string" ? body.username : "";
  const password = body && typeof body.password === "string" ? body.password : "";
  const userOk = safeEqual(username, CFG.adminUsername);
  const passOk = safeEqual(password, CFG.adminPassword);
  if (!(userOk && passOk)) {
    loginGuard.fail(ip);
    throw new HttpError(401, "bad_credentials", MSG.badLogin);
  }
  requireDb();
  loginGuard.success(ip);
  const token = crypto.randomBytes(32).toString("base64url");
  await db.createSession(sha256(token).toString("hex"));
  res.writeHead(204, {
    "Set-Cookie": sessionCookie(req, token, SERVER_CONFIG.SESSION_HOURS * 3600),
    "Cache-Control": "no-store",
  });
  res.end();
}

async function apiLogout(req, res) {
  requireSameOrigin(req);
  await requireSession(req);
  await db.deleteSession(sha256(sessionToken(req)).toString("hex"));
  res.writeHead(204, { "Set-Cookie": sessionCookie(req, "", 0), "Cache-Control": "no-store" });
  res.end();
}

async function apiListPlayers(req, res, url) {
  await requireSession(req);
  const data = await db.listPlayers({ q: url.searchParams.get("q") || "", page: url.searchParams.get("page") || "1" });
  sendJson(res, 200, data);
}

async function apiDeletePlayer(req, res, id) {
  requireSameOrigin(req);
  await requireSession(req);
  if (!UUID_RE.test(id) || !(await db.deletePlayer(id))) throw new HttpError(404, "not_found", MSG.notFound);
  res.writeHead(204, { "Cache-Control": "no-store" });
  res.end();
}

async function apiExportCsv(req, res, url) {
  await requireSession(req);
  const q = url.searchParams.get("q") || "";
  const name = csvFilename();
  // Chỉ gửi header khi đã đọc được lô đầu tiên, để lỗi database vẫn trả được 503
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    });
    res.write(csvHead());
  };
  try {
    await db.eachPlayerBatch(q, async (rows) => {
      start();
      const ok = res.write(rows.map(playerRow).join(""));
      if (!ok) await new Promise((r) => res.once("drain", r));
    });
  } catch (err) {
    if (!started) throw err;
    res.destroy();
    return;
  }
  start();
  res.end();
}

/* ---------- File tĩnh ---------- */

/** Ảnh ít đổi: cho trình duyệt dùng lại 7 ngày; file khác: luôn hỏi lại nhưng nhận 304 nếu không đổi. */
function cacheControlFor(filePath) {
  return filePath.startsWith(path.join(ROOT, "assets") + path.sep) ? "public, max-age=604800" : "no-cache";
}

function serveFile(req, res, filePath, extraHeaders = {}) {
  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) return sendText(res, 404, "Not Found");
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      "Cache-Control": cacheControlFor(filePath),
      ETag: etag,
      "Last-Modified": stat.mtime.toUTCString(),
      ...extraHeaders,
    };
    const noStore = /no-store/.test(headers["Cache-Control"]);
    if (!noStore && req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    if (noStore) delete headers.ETag;
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      ...headers,
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveStatic(req, res, pathname) {
  if (pathname.endsWith("/")) pathname += "index.html";
  const filePath = path.resolve(ROOT, "." + pathname);
  const allowed = STATIC_DIRS.some((dir) => filePath.startsWith(path.join(ROOT, dir) + path.sep));
  if (!allowed || pathname.endsWith("/test.html")) return sendText(res, 404, "Not Found");
  serveFile(req, res, filePath);
}

/* ---------- Định tuyến ---------- */

async function route(req, res, url) {
  const { pathname } = url;
  const m = req.method;

  if (pathname === "/healthz") return sendText(res, 200, "ok");
  if (pathname === "/" || pathname === "/app") return redirect(res, "/app/");

  // API cho game
  if (pathname === "/api/players" && m === "POST") return apiRegister(req, res);
  const playerMatch = pathname.match(/^\/api\/players\/([^/]+)$/);
  if (playerMatch && m === "GET") return apiGetPlayer(req, res, playerMatch[1]);

  // Trang & API admin
  if (pathname === "/admin") return redirect(res, "/admin/");
  if (pathname === "/admin/" && (m === "GET" || m === "HEAD")) {
    if (!(await hasSession(req).catch(() => false))) return redirect(res, "/admin/login");
    return serveFile(req, res, path.join(ROOT, "admin", "index.html"), { "Cache-Control": "no-store" });
  }
  if (pathname === "/admin/login" && (m === "GET" || m === "HEAD")) {
    if (await hasSession(req).catch(() => false)) return redirect(res, "/admin/");
    return serveFile(req, res, path.join(ROOT, "admin", "login.html"), { "Cache-Control": "no-store" });
  }
  if (ADMIN_STATIC.has(pathname) && (m === "GET" || m === "HEAD")) {
    return serveFile(req, res, path.join(ROOT, pathname));
  }
  if (pathname === "/admin/api/login" && m === "POST") return apiLogin(req, res);
  if (pathname === "/admin/api/logout" && m === "POST") return apiLogout(req, res);
  if (pathname === "/admin/api/players" && m === "GET") return apiListPlayers(req, res, url);
  if (pathname === "/admin/api/players.csv" && m === "GET") return apiExportCsv(req, res, url);
  const adminPlayer = pathname.match(/^\/admin\/api\/players\/([^/]+)$/);
  if (adminPlayer && m === "DELETE") return apiDeletePlayer(req, res, adminPlayer[1]);
  if (pathname.startsWith("/api/") || pathname.startsWith("/admin/")) {
    throw new HttpError(404, "not_found", "Không tìm thấy.");
  }

  if (m !== "GET" && m !== "HEAD") return sendText(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
  return serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  const started = process.hrtime.bigint();
  let pathname = "/";
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");

  // Log không chứa query (từ khoá tìm kiếm), thân yêu cầu hay cookie
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(`${req.method} ${pathname} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });

  let url;
  try {
    url = new URL(req.url, "http://localhost");
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendText(res, 400, "Bad Request");
  }

  Promise.resolve()
    .then(() => route(req, res, url))
    .catch((err) => {
      if (res.headersSent) return res.destroy();
      if (err instanceof HttpError) {
        const { headers, ...extra } = err.extra;
        return sendJson(res, err.status, { error: err.code, message: err.message, ...extra }, headers || {});
      }
      if (isUnavailable(err)) {
        return sendJson(res, 503, { error: "db_unavailable", message: MSG.unavailable });
      }
      console.error(`[lỗi] ${req.method} ${pathname}: ${err && err.code ? err.code + " " : ""}${err && err.message}`);
      return sendJson(res, 500, { error: "internal", message: "Có lỗi xảy ra. Vui lòng thử lại." });
    });
});

/* ---------- Khởi động ---------- */

async function initDbWithRetry() {
  for (let attempt = 1; ; attempt++) {
    try {
      await db.init();
      dbReady = true;
      console.log("Database sẵn sàng.");
      return;
    } catch (err) {
      console.error(`[database] Chưa kết nối được (lần ${attempt}): ${err.code || err.message}. Thử lại sau 2 giây…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

server.listen(CFG.port, CFG.host, () => {
  console.log(`Đập Tôi đang chạy tại http://localhost:${CFG.port}/`);
});
initDbWithRetry();

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    console.log(`Nhận ${signal}, đang dừng server…`);
    server.close(() => db.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
