# FCM-GAME

Mini game **Đập Tôi** (lưới 3×3, 30 giây) kèm đăng ký người chơi (PostgreSQL) và trang quản trị. Tài liệu thiết kế ở thư mục `docs/`.

## Cách chạy bằng Docker

Cần cài [Docker Desktop](https://www.docker.com/products/docker-desktop/) (có sẵn Docker Compose).

1. Mở terminal tại thư mục gốc của dự án.
2. Tạo file `.env` từ mẫu rồi điền mật khẩu (chỉ dùng chữ cái và chữ số; mật khẩu admin tối thiểu 12 ký tự):

   ```bash
   cp .env.example .env
   ```

   File `.env` chứa mật khẩu thật, **không commit** (đã có trong `.gitignore`).

3. Build và khởi động:

   ```bash
   docker compose up -d --build
   ```

4. Mở trình duyệt:
   - Game: **http://localhost:3000** (tự chuyển tới `/app/`). Lần đầu phải đăng ký họ tên, email, số điện thoại.
   - Trang quản trị: **http://localhost:3000/admin/** — đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env`.

Các lệnh thường dùng:

| Việc cần làm | Lệnh |
|---|---|
| Xem log | `docker compose logs -f app` |
| Xem trạng thái | `docker compose ps` |
| Dừng container (giữ dữ liệu) | `docker compose down` |
| Dừng và **xoá cả dữ liệu người chơi** | `docker compose down -v` |
| Build lại sau khi sửa code | `docker compose up -d --build` |

Ghi chú:

- Compose có 2 dịch vụ: `app` (server Node.js `server.js`, chỉ dùng thêm thư viện `pg`) và `db` (PostgreSQL 16, dữ liệu trong volume `db-data`).
- Nếu cổng 3000 đã bị dùng, đặt `APP_PORT=3001` trong `.env` rồi mở http://localhost:3001.
- Server không khởi động nếu thiếu `ADMIN_USERNAME`, `ADMIN_PASSWORD` hoặc mật khẩu admin ngắn hơn 12 ký tự; lý do ghi trong `docker compose logs app`.
- Kỷ lục lưu trong `localStorage` của trình duyệt. Mở bằng nhấp đúp `app/index.html` thì không đăng ký được (cần server).

## Chạy trên máy chủ (HTTPS)

Trên máy chủ, ghép thêm `compose.prod.yaml`: dịch vụ `caddy` mở cổng 80/443 và tự lấy chứng chỉ HTTPS cho `SITE_DOMAIN` (trong `.env`); `app` và `db` không mở cổng ra ngoài và bị giới hạn RAM cho máy 1 GB.

```bash
docker compose -f compose.yaml -f compose.prod.yaml up -d --build
```

Cần trỏ bản ghi DNS `A` của tên miền về IP máy chủ trước khi chạy. Thử trên máy cá nhân: đặt `SITE_DOMAIN=localhost` rồi mở https://localhost (chứng chỉ nội bộ của Caddy, trình duyệt sẽ cảnh báo). Kế hoạch đầy đủ: `docs/06-ke-hoach-deploy.html`.

## Kiểm thử

| Loại | Cách chạy |
|---|---|
| Logic game & đăng ký phía trình duyệt (UT-01 → UT-16) | Mở `app/test.html` trực tiếp trong trình duyệt (server không phục vụ file này). |
| Đơn vị phía server (UT-10 → UT-13, UT-17 → UT-21) | `docker run --rm -v "$PWD":/w -w /w node:22-alpine sh -c "npm ci && node --test test/unit.test.js"` |
| Tích hợp API với PostgreSQL (IT-01 → IT-10) | Xem bên dưới. Dùng bản test riêng, **xoá sạch dữ liệu** của bản test. |

Chạy kiểm thử tích hợp trên một bản test tách riêng (project `daptoi-test`, cổng 3100):

```bash
APP_PORT=3100 TRUST_PROXY=1 docker compose -p daptoi-test up -d --build
set -a; . ./.env; set +a
docker run --rm --network daptoi-test_default -v "$PWD":/w -w /w \
  -e BASE_URL=http://app:3000 \
  -e DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@db:5432/$POSTGRES_DB" \
  -e ADMIN_USERNAME -e ADMIN_PASSWORD \
  node:22-alpine sh -c "npm ci && node --test --test-concurrency=1 test/api.test.js"
docker compose -p daptoi-test down -v
```

Nạp 45 người chơi mẫu để thử trang quản trị: chạy `node test/seed.js` trong một container có `DATABASE_URL` trỏ tới database cần nạp.
