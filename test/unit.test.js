// test/unit.test.js — Kiểm thử đơn vị phía server (docs/05 · mục 9.1)
// Chạy: node --test test/unit.test.js
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const V = require("../app/validate.js");
const csv = require("../server/csv.js");
const { buildSearch, clampPage } = require("../server/search.js");
const { createWindowLimiter, createLoginGuard } = require("../server/limits.js");
const { loadConfig } = require("../server/config.js");

test("UT-10 Họ tên: chuẩn hoá & kiểm tra", () => {
  assert.equal(V.validateName("").error, V.MSG.nameEmpty);
  assert.equal(V.validateName("A").error, V.MSG.nameLength);
  const n = V.validateName("  nguyễn   văn An ");
  assert.equal(n.error, null);
  assert.equal(n.value, "nguyễn văn An");
  assert.equal(V.validateName("An123").error, V.MSG.nameFormat);
  assert.equal(V.validateName("O'Brien-Smith").error, null);
  assert.equal(V.validateName("a".repeat(100)).error, null);
  assert.equal(V.validateName("a".repeat(101)).error, V.MSG.nameLength);
  const nfd = "Nguyễn"; // tổ hợp dấu (NFD)
  const r = V.validateName(nfd);
  assert.equal(r.error, null);
  assert.equal(r.value, "Nguyễn");
  assert.equal(V.validateName(123).error, V.MSG.nameEmpty);
  assert.equal(V.validateName("<script>").error, V.MSG.nameFormat);
});

test("UT-11 Email: chuẩn hoá & kiểm tra", () => {
  const e = V.validateEmail(" An@Gmail.COM ");
  assert.equal(e.error, null);
  assert.equal(e.value, "an@gmail.com");
  assert.equal(V.validateEmail("an@gmail").error, V.MSG.emailFormat);
  assert.equal(V.validateEmail("an gmail.com").error, V.MSG.emailFormat);
  assert.equal(V.validateEmail("a@b.c").error, V.MSG.emailFormat);
  assert.equal(V.validateEmail("a".repeat(245) + "@gmail.com").error, V.MSG.emailFormat); // 255 ký tự
  assert.equal(V.validateEmail("").error, V.MSG.emailEmpty);
});

test("UT-12 Số điện thoại: chuẩn hoá & kiểm tra", () => {
  for (const raw of ["0912345678", "+84 912 345 678", "84912345678", "(091) 234-5678"]) {
    const p = V.validatePhone(raw);
    assert.equal(p.error, null, raw);
    assert.equal(p.value, "0912345678", raw);
  }
  assert.equal(V.validatePhone("0212345678").error, V.MSG.phonePrefix);
  assert.equal(V.validatePhone("091234567").error, V.MSG.phoneLength);
  assert.equal(V.validatePhone("09123456789").error, V.MSG.phoneLength);
  assert.equal(V.validatePhone("").error, V.MSG.phoneEmpty);
});

test("UT-13 Đồng ý: chỉ true hợp lệ", () => {
  assert.equal(V.validateConsent(true).error, null);
  for (const v of [false, "true", 1, undefined]) assert.equal(V.validateConsent(v).error, V.MSG.consent);
  const all = V.validateRegistration({});
  assert.equal(all.ok, false);
  assert.deepEqual(Object.keys(all.fields).sort(), ["consent", "email", "fullName", "phone"]);
});

test("UT-17 Tạo CSV", () => {
  const rows = [
    { full_name: "O'Brien, Mary", email: "mary@example.com", phone: "0387654321", created_at: "2026-11-18T14:04:37Z" },
    { full_name: 'Tên "kép"', email: "q@example.com", phone: "0912345678", created_at: "2026-11-18T14:04:37Z" },
    { full_name: "dòng\nmới", email: "n@example.com", phone: "0912345678", created_at: "2026-11-18T14:04:37Z" },
    { full_name: "=1+1", email: "+a@example.com", phone: "0912345678", created_at: "2026-11-18T14:04:37Z" },
    { full_name: "-x", email: "@y.com", phone: "0912345678", created_at: "2026-11-18T14:04:37Z" },
  ];
  const out = csv.buildCsv(rows);
  assert.ok(out.startsWith("﻿Họ và tên,Email,Số điện thoại,Thời điểm đăng ký\r\n"));
  const lines = out.slice(1).split("\r\n");
  assert.equal(lines[1], '"O\'Brien, Mary",mary@example.com,0387 654 321,18/11/2026 21:04:37');
  assert.equal(lines[2], '"Tên ""kép""",q@example.com,0912 345 678,18/11/2026 21:04:37');
  assert.equal(lines[3], '"dòng\nmới",n@example.com,0912 345 678,18/11/2026 21:04:37');
  assert.ok(out.includes("'=1+1,'+a@example.com,"));
  assert.ok(out.includes("'-x,'@y.com,"));
  assert.ok(!/[^\r]\n/.test(out.replace('"dòng\nmới"', "")), "mọi dòng kết thúc bằng CRLF");
  assert.equal(csv.buildCsv([]), "﻿Họ và tên,Email,Số điện thoại,Thời điểm đăng ký\r\n");
  assert.equal(csv.csvFilename(new Date("2026-11-18T17:30:00Z")), "dap-toi-nguoi-choi-20261119-0030.csv");
});

test("UT-18 Từ khoá tìm kiếm", () => {
  assert.equal(buildSearch("  Nguyễn ").text, "Nguyễn");
  assert.equal(buildSearch("50%").likePattern, "%50\\%%");
  assert.equal(buildSearch("a_b").likePattern, "%a\\_b%");
  assert.equal(buildSearch("0912 345").digits, "0912345");
  assert.equal(buildSearch("12").digits, null);
  assert.equal(Array.from(buildSearch("x".repeat(150)).text).length, 100);
  assert.equal(buildSearch("   ").likePattern, null);
  assert.deepEqual(clampPage("0", 45, 20), { page: 1, pages: 3 });
  assert.deepEqual(clampPage("99", 45, 20), { page: 3, pages: 3 });
  assert.deepEqual(clampPage("x", 45, 20), { page: 1, pages: 3 });
  assert.deepEqual(clampPage("1", 0, 20), { page: 1, pages: 1 });
});

test("UT-19 Khoá đăng nhập với đồng hồ giả", () => {
  let t = 0;
  const g = createLoginGuard({ maxFails: 5, windowMs: 15 * 60000, lockMs: 15 * 60000, now: () => t });
  for (let i = 0; i < 4; i++) { assert.equal(g.check("ip").locked, false); g.fail("ip"); }
  assert.equal(g.check("ip").locked, false);
  g.fail("ip"); // lần sai thứ 5
  assert.equal(g.check("ip").locked, true, "lần 6 bị khoá");
  assert.equal(g.check("khac").locked, false, "IP khác không bị ảnh hưởng");
  t += 15 * 60000 - 1;
  assert.equal(g.check("ip").locked, true);
  t += 1;
  assert.equal(g.check("ip").locked, false, "sau 15 phút mở khoá");
  for (let i = 0; i < 4; i++) g.fail("ip");
  g.success("ip");
  g.fail("ip");
  assert.equal(g.check("ip").locked, false, "đăng nhập đúng xoá bộ đếm");
});

test("UT-20 Giới hạn đăng ký với đồng hồ giả", () => {
  let t = 0;
  const l = createWindowLimiter({ max: 10, windowMs: 10 * 60000, now: () => t });
  for (let i = 0; i < 10; i++) { assert.equal(l.hit("ip").allowed, true); t += 1000; }
  const r = l.hit("ip");
  assert.equal(r.allowed, false);
  assert.ok(r.retryAfterMs > 0);
  t = 10 * 60000;
  assert.equal(l.hit("ip").allowed, true, "hết cửa sổ 10 phút thì cho phép lại");
});

test("UT-21 Đọc cấu hình khi khởi động", () => {
  const base = { ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "abcdefghijkl", DATABASE_URL: "postgres://x" };
  assert.equal(loadConfig(base).ok, true);
  const noUser = loadConfig({ ...base, ADMIN_USERNAME: "" });
  assert.equal(noUser.ok, false);
  assert.match(noUser.errors.join(" "), /ADMIN_USERNAME/);
  const noPass = loadConfig({ ...base, ADMIN_PASSWORD: undefined });
  assert.match(noPass.errors.join(" "), /Thiếu biến môi trường ADMIN_PASSWORD/);
  const short = loadConfig({ ...base, ADMIN_PASSWORD: "abcdefghijk" }); // 11 ký tự
  assert.equal(short.ok, false);
  assert.match(short.errors.join(" "), /quá ngắn/);
  assert.ok(!short.errors.join(" ").includes("abcdefghijk"), "không in mật khẩu");
});
