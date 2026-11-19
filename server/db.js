// server/db.js — Truy cập PostgreSQL (docs/04 · mục 14). Mọi câu lệnh dùng tham số $1, $2…
"use strict";

const { Pool } = require("pg");
const { SERVER_CONFIG } = require("./config.js");
const { buildSearch, clampPage } = require("./search.js");

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   VARCHAR(100) NOT NULL,
  email       VARCHAR(254) NOT NULL UNIQUE,
  phone       CHAR(10)     NOT NULL CHECK (phone ~ '^0[35789][0-9]{8}$'),
  consent_at  TIMESTAMPTZ  NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_created_at_idx ON players (created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash  CHAR(64)    PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
`;

/** Lỗi do không kết nối được database -> trả 503 thay vì 500. */
function isUnavailable(err) {
  if (!err) return false;
  const code = String(err.code || "");
  return (
    ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "57P01", "57P02", "57P03"].includes(code) ||
    code.startsWith("08") ||
    /timeout|terminated|Connection/i.test(String(err.message || ""))
  );
}

/** Điều kiện tìm kiếm; trả về chuỗi WHERE và thêm tham số vào params. */
function searchWhere(q, params) {
  const s = buildSearch(q);
  if (!s.likePattern) return "";
  params.push(s.likePattern);
  const i = params.length;
  let w = `unaccent(lower(full_name)) LIKE unaccent(lower($${i})) ESCAPE '\\' OR email LIKE lower($${i}) ESCAPE '\\'`;
  if (s.digits) {
    params.push("%" + s.digits + "%");
    w += ` OR phone LIKE $${params.length}`;
  }
  return `WHERE (${w})`;
}

function createDb(databaseUrl) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: SERVER_CONFIG.DB_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: 30000,
  });
  // Lỗi của kết nối rảnh (ví dụ database khởi động lại) không được làm sập server
  pool.on("error", () => {});

  return {
    pool,

    async init() {
      await pool.query(SCHEMA);
    },

    /** Tạo mới hoặc cập nhật theo email (GĐ-1). */
    async upsertPlayer({ fullName, email, phone }) {
      const { rows } = await pool.query(
        `INSERT INTO players (full_name, email, phone, consent_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (email) DO UPDATE
           SET full_name = EXCLUDED.full_name,
               phone = EXCLUDED.phone,
               consent_at = now(),
               updated_at = now()
         RETURNING id, full_name, (xmax = 0) AS inserted`,
        [fullName, email, phone]
      );
      return { id: rows[0].id, fullName: rows[0].full_name, inserted: rows[0].inserted };
    },

    async getPlayer(id) {
      const { rows } = await pool.query("SELECT id, full_name FROM players WHERE id = $1", [id]);
      return rows[0] ? { id: rows[0].id, fullName: rows[0].full_name } : null;
    },

    async listPlayers({ q, page }) {
      const params = [];
      const where = searchWhere(q, params);
      const { rows: c } = await pool.query(`SELECT count(*)::int AS n FROM players ${where}`, params);
      const total = c[0].n;
      const pageSize = SERVER_CONFIG.PAGE_SIZE;
      const p = clampPage(page, total, pageSize);
      const listParams = params.concat([pageSize, (p.page - 1) * pageSize]);
      const { rows } = await pool.query(
        `SELECT id, full_name, email, phone, created_at FROM players ${where}
         ORDER BY created_at DESC, id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        listParams
      );
      return {
        total,
        page: p.page,
        pageSize,
        pages: p.pages,
        items: rows.map((r) => ({
          id: r.id,
          fullName: r.full_name,
          email: r.email,
          phone: r.phone.trim(),
          createdAt: new Date(r.created_at).toISOString(),
        })),
      };
    },

    async deletePlayer(id) {
      const { rowCount } = await pool.query("DELETE FROM players WHERE id = $1", [id]);
      return rowCount > 0;
    },

    /** Đọc theo từng lô (keyset) để xuất CSV mà không giữ hết trong bộ nhớ. */
    async eachPlayerBatch(q, onBatch) {
      const base = [];
      const where = searchWhere(q, base);
      let last = null;
      for (;;) {
        const params = base.slice();
        let cond = where;
        if (last) {
          params.push(last.created_at, last.id);
          const k = `(created_at, id) < ($${params.length - 1}, $${params.length})`;
          cond = where ? `${where} AND ${k}` : `WHERE ${k}`;
        }
        params.push(SERVER_CONFIG.CSV_BATCH);
        const { rows } = await pool.query(
          `SELECT id, full_name, email, phone, created_at FROM players ${cond}
           ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
          params
        );
        if (!rows.length) return;
        await onBatch(rows);
        if (rows.length < SERVER_CONFIG.CSV_BATCH) return;
        last = rows[rows.length - 1];
      }
    },

    async createSession(tokenHash) {
      await pool.query("DELETE FROM admin_sessions WHERE expires_at <= now()");
      await pool.query(
        `INSERT INTO admin_sessions (token_hash, expires_at)
         VALUES ($1, now() + make_interval(hours => $2))`,
        [tokenHash, SERVER_CONFIG.SESSION_HOURS]
      );
    },

    async isSessionValid(tokenHash) {
      const { rows } = await pool.query(
        "SELECT 1 FROM admin_sessions WHERE token_hash = $1 AND expires_at > now()",
        [tokenHash]
      );
      return rows.length > 0;
    },

    async deleteSession(tokenHash) {
      await pool.query("DELETE FROM admin_sessions WHERE token_hash = $1", [tokenHash]);
    },

    async end() {
      await pool.end();
    },
  };
}

module.exports = { createDb, isUnavailable, SCHEMA };
