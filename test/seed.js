// test/seed.js — Nạp người chơi mẫu (không phải người thật) cho kiểm thử (docs/05 · mục 7.1)
// Dùng: DATABASE_URL=... node test/seed.js [số_lượng=45]
"use strict";

const { Pool } = require("pg");

const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng"];
const DEM = ["Văn", "Thị", "Minh", "Ngọc", "Đức", "Thu", "Gia", "Hải"];
const TEN = ["An", "Bình", "Châu", "Dũng", "Giang", "Hà", "Khang", "Linh", "Mai", "Nam", "Oanh", "Phúc"];
const DAU = ["03", "05", "07", "08", "09"];
const SPECIAL = ["O'Brien, Mary", "Lê-Hoàng Anh", "Nguyen Van Khong Dau"];

function samplePlayers(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const name = i < SPECIAL.length ? SPECIAL[i] : `${HO[i % HO.length]} ${DEM[i % DEM.length]} ${TEN[i % TEN.length]}`;
    const phone = DAU[i % DAU.length] + String(10000000 + i * 7919).slice(-8);
    out.push({ fullName: name, email: `nguoichoi${String(i + 1).padStart(3, "0")}@example.com`, phone });
  }
  return out;
}

/** Thêm n người, cách nhau 1 phút (người cuối mới nhất). Trả về danh sách đã thêm. */
async function seed(pool, n = 45) {
  const players = samplePlayers(n);
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    await pool.query(
      `INSERT INTO players (full_name, email, phone, consent_at, created_at, updated_at)
       VALUES ($1, $2, $3, now(), now() - make_interval(mins => $4), now() - make_interval(mins => $4))
       ON CONFLICT (email) DO NOTHING`,
      [p.fullName, p.email, p.phone, n - i]
    );
  }
  return players;
}

module.exports = { seed, samplePlayers };

if (require.main === module) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const n = Number(process.argv[2]) || 45;
  seed(pool, n)
    .then(() => console.log(`Đã thêm tối đa ${n} người chơi mẫu.`))
    .catch((e) => { console.error(e.message); process.exitCode = 1; })
    .finally(() => pool.end());
}
