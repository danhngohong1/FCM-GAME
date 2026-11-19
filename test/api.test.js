// test/api.test.js — Kiểm thử tích hợp API với PostgreSQL thật (docs/05 · mục 9.2)
// Chạy trong mạng Docker của bản test (xem README): server phải bật TRUST_PROXY=1.
// Cần biến: BASE_URL, DATABASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD.
// CẢNH BÁO: xoá sạch bảng players và admin_sessions trước khi chạy — không chạy trên dữ liệu thật.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { Pool } = require("pg");
const { seed } = require("./seed.js");

const BASE = process.env.BASE_URL || "http://app:3000";
const ORIGIN = new URL(BASE).origin;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let ipSeq = 0;
const newIp = () => `10.0.${Math.floor(++ipSeq / 250)}.${(ipSeq % 250) + 1}`;

async function req(method, path, { body, json = true, headers = {}, ip, cookie, origin = ORIGIN } = {}) {
  const h = { ...headers };
  if (origin) h.Origin = origin;
  h["X-Forwarded-For"] = ip || newIp();
  if (cookie) h.Cookie = cookie;
  let payload;
  if (body !== undefined) {
    payload = json ? JSON.stringify(body) : body;
    if (!h["Content-Type"]) h["Content-Type"] = json ? "application/json" : "text/plain";
  }
  const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
  // Giữ nguyên BOM (res.text() tự bỏ BOM)
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, headers: res.headers, data, text };
}

async function login(ip = newIp()) {
  const r = await req("POST", "/admin/api/login", {
    ip,
    body: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD },
  });
  assert.equal(r.status, 204, "đăng nhập admin");
  const m = /dapToi\.admin=([^;]+)/.exec(r.headers.get("set-cookie") || "");
  return { cookie: `dapToi.admin=${m[1]}`, token: m[1] };
}

const VALID = { fullName: "Nguyễn Văn An", email: "an.nguyen@gmail.com", phone: "0912345678", consent: true };
const count = async () => (await pool.query("SELECT count(*)::int AS n FROM players")).rows[0].n;

test.before(async () => {
  await pool.query("TRUNCATE players, admin_sessions");
});
test.after(async () => {
  await pool.end();
});

test("IT-01 Đăng ký mới rồi đăng ký lại cùng email", async () => {
  const a = await req("POST", "/api/players", { body: VALID });
  assert.equal(a.status, 201);
  const before = (await pool.query("SELECT * FROM players WHERE id = $1", [a.data.id])).rows[0];
  const b = await req("POST", "/api/players", {
    body: { fullName: "  An   Nguyễn ", email: " AN.Nguyen@Gmail.com ", phone: "+84 987 654 321", consent: true },
  });
  assert.equal(b.status, 200);
  assert.equal(b.data.id, a.data.id);
  const rows = (await pool.query("SELECT * FROM players WHERE email = 'an.nguyen@gmail.com'")).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].full_name, "An Nguyễn");
  assert.equal(rows[0].phone, "0987654321");
  assert.equal(rows[0].created_at.getTime(), before.created_at.getTime());
  assert.ok(rows[0].updated_at > before.updated_at);
});

test("IT-02 Dữ liệu sai, không phải JSON, quá lớn", async () => {
  const n = await count();
  const bad = await req("POST", "/api/players", { body: { fullName: "A", email: "x@y", phone: "0212345678", consent: false } });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.data.fields).sort(), ["consent", "email", "fullName", "phone"]);
  const notJson = await req("POST", "/api/players", { body: "fullName=An", json: false });
  assert.equal(notJson.status, 415);
  const big = await req("POST", "/api/players", { body: { ...VALID, email: "big@example.com", pad: "x".repeat(3000) } });
  assert.equal(big.status, 413);
  assert.equal(await count(), n);
});

test("IT-03 Đọc người chơi theo mã", async () => {
  const a = await req("POST", "/api/players", { body: { ...VALID, email: "it03@example.com" } });
  const ok = await req("GET", `/api/players/${a.data.id}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(Object.keys(ok.data).sort(), ["fullName", "id"]);
  assert.equal((await req("GET", `/api/players/${crypto.randomUUID()}`)).status, 404);
  assert.equal((await req("GET", "/api/players/abc")).status, 404);
});

test("IT-04 API admin khi không có / sai / hết hạn phiên", async () => {
  const id = crypto.randomUUID();
  const calls = (cookie) => [
    req("GET", "/admin/api/players", { cookie }),
    req("GET", "/admin/api/players.csv", { cookie }),
    req("DELETE", `/admin/api/players/${id}`, { cookie }),
    req("POST", "/admin/api/logout", { cookie }),
  ];
  for (const r of await Promise.all(calls(undefined))) assert.equal(r.status, 401);
  for (const r of await Promise.all(calls("dapToi.admin=" + "x".repeat(43)))) assert.equal(r.status, 401);
  const s = await login();
  await pool.query("UPDATE admin_sessions SET expires_at = now() - interval '1 second'");
  for (const r of await Promise.all(calls(s.cookie))) assert.equal(r.status, 401);
  const page = await req("GET", "/admin/", { cookie: s.cookie });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get("location"), "/admin/login");
});

test("IT-05 Phiên đăng nhập lưu dạng băm, đăng xuất thì xoá", async () => {
  const s = await login();
  const hash = crypto.createHash("sha256").update(s.token).digest("hex");
  const rows = (await pool.query(
    "SELECT token_hash, extract(epoch FROM expires_at - created_at) AS sec FROM admin_sessions WHERE token_hash = $1",
    [hash]
  )).rows;
  assert.equal(rows.length, 1);
  assert.equal(Math.round(Number(rows[0].sec)), 8 * 3600);
  const none = await pool.query("SELECT 1 FROM admin_sessions WHERE token_hash = $1", [s.token]);
  assert.equal(none.rows.length, 0, "không lưu mã gốc");
  assert.equal((await req("POST", "/admin/api/logout", { cookie: s.cookie })).status, 204);
  assert.equal((await pool.query("SELECT 1 FROM admin_sessions WHERE token_hash = $1", [hash])).rows.length, 0);
  assert.equal((await req("GET", "/admin/api/players", { cookie: s.cookie })).status, 401);
});

test("IT-06 Phân trang & tìm kiếm", async () => {
  await pool.query("TRUNCATE players");
  await seed(pool, 45);
  const s = await login();
  const list = (qs) => req("GET", `/admin/api/players?${qs}`, { cookie: s.cookie });
  const p1 = await list("page=1");
  assert.equal(p1.data.total, 45);
  assert.equal(p1.data.pages, 3);
  assert.equal(p1.data.items.length, 20);
  assert.equal(p1.data.items[0].email, "nguoichoi045@example.com", "mới nhất ở đầu");
  assert.equal((await list("page=3")).data.items.length, 5);
  assert.equal((await list("page=0")).data.page, 1);
  assert.equal((await list("page=99")).data.page, 3);
  assert.equal((await list("page=x")).data.page, 1);

  const plain = await list("q=nguyen");
  const upper = await list("q=" + encodeURIComponent("NGUYỄN"));
  assert.ok(plain.data.total > 0);
  assert.equal(plain.data.total, upper.data.total);
  assert.ok(plain.data.items.some((p) => p.fullName.startsWith("Nguyễn")), "tìm không dấu ra có dấu");

  const target = p1.data.items[0];
  const spaced = `${target.phone.slice(0, 4)} ${target.phone.slice(4, 7)}`;
  const byPhone = await list("q=" + encodeURIComponent(spaced));
  assert.ok(byPhone.data.items.some((p) => p.id === target.id));
  assert.equal((await list("q=%25")).data.total, 0, "% tìm theo nghĩa đen");
  assert.equal((await list("q=_")).data.total, 0, "_ tìm theo nghĩa đen");
});

test("IT-07 Xoá hai lần", async () => {
  const s = await login();
  const a = await req("POST", "/api/players", { body: { ...VALID, email: "it07@example.com" } });
  assert.equal((await req("DELETE", `/admin/api/players/${a.data.id}`, { cookie: s.cookie })).status, 204);
  assert.equal((await req("DELETE", `/admin/api/players/${a.data.id}`, { cookie: s.cookie })).status, 404);
  assert.equal((await req("GET", `/api/players/${a.data.id}`)).status, 404);
});

test("IT-08 Xuất CSV", async () => {
  const s = await login();
  const all = await req("GET", "/admin/api/players.csv", { cookie: s.cookie });
  assert.equal(all.status, 200);
  assert.equal(all.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(all.headers.get("content-disposition"), /^attachment; filename="dap-toi-nguoi-choi-\d{8}-\d{4}\.csv"$/);
  assert.ok(all.text.startsWith("﻿Họ và tên,Email,Số điện thoại,Thời điểm đăng ký\r\n"));
  const total = (await req("GET", "/admin/api/players", { cookie: s.cookie })).data.total;
  const lines = all.text.slice(1).split("\r\n").filter(Boolean);
  // một dòng có dấu phẩy trong ngoặc kép, vẫn 1 dòng vì không có xuống dòng
  assert.equal(lines.length - 1, total);
  assert.ok(all.text.includes('"O\'Brien, Mary"'));
  assert.ok(/,0\d{3} \d{3} \d{3},\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}\r\n/.test(all.text));

  const q = "example";
  const filtered = await req("GET", `/admin/api/players.csv?q=${q}`, { cookie: s.cookie });
  const qTotal = (await req("GET", `/admin/api/players?q=${q}`, { cookie: s.cookie })).data.total;
  assert.ok(qTotal > 20, "nhiều hơn 1 trang");
  assert.equal(filtered.text.slice(1).split("\r\n").filter(Boolean).length - 1, qTotal);

  const none = await req("GET", "/admin/api/players.csv?q=zzzz", { cookie: s.cookie });
  assert.equal(none.text, "﻿Họ và tên,Email,Số điện thoại,Thời điểm đăng ký\r\n");
});

test("IT-09 Chặn Origin lạ hoặc thiếu", async () => {
  const s = await login();
  const n = await count();
  for (const origin of ["https://evil.example", null]) {
    assert.equal((await req("POST", "/api/players", { origin, body: { ...VALID, email: "evil@example.com" } })).status, 403);
    const any = (await pool.query("SELECT id FROM players LIMIT 1")).rows[0].id;
    assert.equal((await req("DELETE", `/admin/api/players/${any}`, { origin, cookie: s.cookie })).status, 403);
    assert.equal((await req("POST", "/admin/api/login", { origin, body: {} })).status, 403);
  }
  assert.equal(await count(), n);
});

test("IT-10 Chuỗi tấn công SQL", async () => {
  const s = await login();
  const n = await count();
  const evil = await req("POST", "/api/players", {
    body: { fullName: "'; DROP TABLE players; --", email: "x'@example.com", phone: "' OR '1'='1", consent: true },
  });
  assert.equal(evil.status, 400);
  for (const q of ["' OR '1'='1", "'; DROP TABLE players; --"]) {
    const r = await req("GET", `/admin/api/players?q=${encodeURIComponent(q)}`, { cookie: s.cookie });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 0);
    const c = await req("GET", `/admin/api/players.csv?q=${encodeURIComponent(q)}`, { cookie: s.cookie });
    assert.equal(c.status, 200);
  }
  assert.equal(await count(), n, "bảng còn nguyên");
});

test("Giới hạn đăng ký (TC-47) & khoá đăng nhập (TC-58) qua API", async () => {
  const ip = newIp();
  for (let i = 0; i < 10; i++) {
    const r = await req("POST", "/api/players", { ip, body: { ...VALID, email: `rl${i}@example.com` } });
    assert.ok([200, 201].includes(r.status));
  }
  const blocked = await req("POST", "/api/players", { ip, body: { ...VALID, email: "rl10@example.com" } });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);

  const ip2 = newIp();
  for (let i = 0; i < 5; i++) {
    assert.equal((await req("POST", "/admin/api/login", { ip: ip2, body: { username: "admin", password: "sai-mat-khau-" + i } })).status, 401);
  }
  const locked = await req("POST", "/admin/api/login", {
    ip: ip2,
    body: { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD },
  });
  assert.equal(locked.status, 429);
  assert.equal(locked.data.retryAfterMinutes, 15);
});
