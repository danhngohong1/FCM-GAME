// server/csv.js — Tạo file CSV danh sách người chơi (docs/04 · mục 15)
"use strict";

const { SERVER_CONFIG } = require("./config.js");

const BOM = "﻿";
const EOL = "\r\n";
const HEADER = ["Họ và tên", "Email", "Số điện thoại", "Thời điểm đăng ký"];

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Đổi sang giờ Việt Nam (UTC+7, không có giờ mùa hè). */
function toVN(date) {
  return new Date(new Date(date).getTime() + SERVER_CONFIG.DISPLAY_TZ_OFFSET_MIN * 60000);
}

/** dd/MM/yyyy HH:mm:ss theo giờ Việt Nam */
function formatDateTimeVN(date) {
  const d = toVN(date);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** 0912345678 -> "0912 345 678" để Excel giữ số 0 ở đầu (GĐ-7) */
function formatPhone(phone) {
  const p = String(phone || "").trim();
  return /^\d{10}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p;
}

/** Một ô CSV: chống chèn công thức + bao ngoặc kép khi cần (RFC 4180). */
function csvCell(value) {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function csvRow(cells) {
  return cells.map(csvCell).join(",") + EOL;
}

function playerRow(p) {
  return csvRow([p.full_name, p.email, formatPhone(p.phone), formatDateTimeVN(p.created_at)]);
}

/** Phần đầu file: BOM + dòng tiêu đề */
function csvHead() {
  return BOM + csvRow(HEADER);
}

/** dap-toi-nguoi-choi-YYYYMMDD-HHmm.csv theo giờ Việt Nam */
function csvFilename(now = new Date()) {
  const d = toVN(now);
  return `dap-toi-nguoi-choi-${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}.csv`;
}

/** Ghép cả file từ một mảng dòng (dùng cho kiểm thử). */
function buildCsv(rows) {
  return csvHead() + rows.map(playerRow).join("");
}

module.exports = {
  BOM, EOL, HEADER,
  formatDateTimeVN, formatPhone, csvCell, csvRow, playerRow, csvHead, csvFilename, buildCsv,
};
