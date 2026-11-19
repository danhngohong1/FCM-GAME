// server/search.js — Xử lý từ khoá tìm kiếm của trang admin (docs/04 · mục 14.3)
"use strict";

const { RULES } = require("../app/validate.js");

const MIN_PHONE_DIGITS = 3;

/** Thoát ký tự đặc biệt của LIKE để tìm theo nghĩa đen (ESCAPE '\'). */
function escapeLike(s) {
  return s.replace(/[\\%_]/g, "\\$&");
}

/**
 * @returns {{ text: string, likePattern: string|null, digits: string|null }}
 */
function buildSearch(q) {
  const text = Array.from(typeof q === "string" ? q.trim() : "").slice(0, RULES.SEARCH_MAX).join("").trim();
  if (!text) return { text: "", likePattern: null, digits: null };
  const digits = text.replace(/\D/g, "");
  return {
    text,
    likePattern: "%" + escapeLike(text) + "%",
    digits: digits.length >= MIN_PHONE_DIGITS ? digits : null,
  };
}

/** Số trang hợp lệ: không phải số nguyên hoặc < 1 thì 1; vượt quá thì trang cuối. */
function clampPage(raw, total, pageSize) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  let page = /^\d+$/.test(String(raw)) ? Number(raw) : 1;
  if (page < 1) page = 1;
  if (page > pages) page = pages;
  return { page, pages };
}

module.exports = { buildSearch, escapeLike, clampPage };
