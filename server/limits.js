// server/limits.js — Giới hạn số lần đăng ký & khoá đăng nhập admin (docs/04 · mục 17)
// Giữ trong bộ nhớ; nhận hàm now() từ ngoài để kiểm thử bằng đồng hồ giả.
"use strict";

const MAX_KEYS = 10000;

/** Cửa sổ trượt: tối đa `max` lần trong `windowMs` cho mỗi khoá (IP). */
function createWindowLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map();

  function prune(key, t) {
    const list = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }

  function sweep(t) {
    if (hits.size <= MAX_KEYS) return;
    for (const key of hits.keys()) prune(key, t);
  }

  /** Ghi nhận 1 lần; trả về { allowed, retryAfterMs }. */
  function hit(key) {
    const t = now();
    sweep(t);
    const list = prune(key, t);
    if (list.length >= max) {
      return { allowed: false, retryAfterMs: windowMs - (t - list[0]) };
    }
    list.push(t);
    hits.set(key, list);
    return { allowed: true, retryAfterMs: 0 };
  }

  return { hit, _size: () => hits.size };
}

/** Khoá đăng nhập: sai `maxFails` lần trong `windowMs` thì khoá `lockMs`. */
function createLoginGuard({ maxFails, windowMs, lockMs, now = Date.now }) {
  const state = new Map(); // key -> { fails: number[], lockedUntil: number }

  function get(key, t) {
    const s = state.get(key) || { fails: [], lockedUntil: 0 };
    s.fails = s.fails.filter((x) => t - x < windowMs);
    if (s.lockedUntil && s.lockedUntil <= t) s.lockedUntil = 0;
    if (!s.fails.length && !s.lockedUntil) state.delete(key);
    return s;
  }

  function check(key) {
    const t = now();
    if (state.size > MAX_KEYS) for (const k of [...state.keys()]) get(k, t);
    const s = get(key, t);
    if (s.lockedUntil > t) return { locked: true, retryAfterMs: s.lockedUntil - t };
    return { locked: false, retryAfterMs: 0 };
  }

  function fail(key) {
    const t = now();
    const s = get(key, t);
    s.fails.push(t);
    if (s.fails.length >= maxFails) {
      s.lockedUntil = t + lockMs;
      s.fails = [];
    }
    state.set(key, s);
  }

  function success(key) {
    state.delete(key);
  }

  return { check, fail, success };
}

module.exports = { createWindowLimiter, createLoginGuard };
