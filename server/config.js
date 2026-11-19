// server/config.js — Thông số phía server (docs/04 · mục 18) và đọc biến môi trường
"use strict";

const SERVER_CONFIG = Object.freeze({
  BODY_MAX_BYTES: 2048,
  REGISTER_MAX: 10,
  REGISTER_WINDOW_MIN: 10,
  PAGE_SIZE: 20,
  SESSION_HOURS: 8,
  LOGIN_MAX_FAILS: 5,
  LOGIN_WINDOW_MIN: 15,
  LOGIN_LOCK_MIN: 15,
  ADMIN_PASSWORD_MIN: 12,
  DISPLAY_TZ: "Asia/Ho_Chi_Minh",
  DISPLAY_TZ_OFFSET_MIN: 7 * 60, // Việt Nam UTC+7, không có giờ mùa hè
  CSV_BATCH: 500,
  DB_CONNECT_TIMEOUT_MS: 3000,
  SESSION_COOKIE: "dapToi.admin",
});

/**
 * Đọc cấu hình từ biến môi trường. Không bao giờ đưa giá trị mật khẩu vào thông báo lỗi.
 * @returns {{ ok: boolean, errors: string[], config: object }}
 */
function loadConfig(env) {
  const errors = [];
  const username = typeof env.ADMIN_USERNAME === "string" ? env.ADMIN_USERNAME.trim() : "";
  const password = typeof env.ADMIN_PASSWORD === "string" ? env.ADMIN_PASSWORD : "";
  const databaseUrl = typeof env.DATABASE_URL === "string" ? env.DATABASE_URL.trim() : "";

  if (!username) errors.push("Thiếu biến môi trường ADMIN_USERNAME.");
  if (!password) errors.push("Thiếu biến môi trường ADMIN_PASSWORD.");
  else if (password.length < SERVER_CONFIG.ADMIN_PASSWORD_MIN) {
    errors.push(`ADMIN_PASSWORD quá ngắn: cần ít nhất ${SERVER_CONFIG.ADMIN_PASSWORD_MIN} ký tự.`);
  }
  if (!databaseUrl) errors.push("Thiếu biến môi trường DATABASE_URL.");

  return {
    ok: errors.length === 0,
    errors,
    config: {
      port: Number(env.PORT) || 3000,
      host: env.HOST || "0.0.0.0",
      adminUsername: username,
      adminPassword: password,
      databaseUrl,
      trustProxy: env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true",
    },
  };
}

module.exports = { SERVER_CONFIG, loadConfig };
