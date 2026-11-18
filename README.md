# FCM-GAME

## Cách chạy bằng Docker

Cần cài [Docker Desktop](https://www.docker.com/products/docker-desktop/) (có sẵn Docker Compose).

1. Mở terminal tại thư mục gốc của dự án.
2. Build và khởi động:

   ```bash
   docker compose up -d --build
   ```

3. Mở trình duyệt tại **http://localhost:3000** (tự chuyển tới `/app/`).

Các lệnh thường dùng:

| Việc cần làm | Lệnh |
|---|---|
| Xem log | `docker compose logs -f app` |
| Xem trạng thái | `docker compose ps` |
| Dừng và xoá container | `docker compose down` |
| Build lại sau khi sửa code | `docker compose up -d --build` |

Ghi chú:

- Compose hiện có 1 dịch vụ `app`: server Node.js nhỏ (`server.js`, không thư viện ngoài) phục vụ các thư mục `app/`, `design/` và `assets/` ở cổng 3000.
- Nếu cổng 3000 đã bị dùng, đổi dòng `"3000:3000"` trong `compose.yaml` thành ví dụ `"3001:3000"` rồi mở http://localhost:3001.
- Kỷ lục lưu trong `localStorage` của trình duyệt nên không mất khi build lại container.
- Vẫn có thể chơi không cần Docker bằng cách nhấp đúp `app/index.html`.
