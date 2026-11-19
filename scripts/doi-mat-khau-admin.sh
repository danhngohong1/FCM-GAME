#!/bin/bash
# Đổi mật khẩu trang admin: nhập ẩn, cập nhật .env, khởi động lại app, đăng xuất mọi phiên cũ.
set -euo pipefail
cd ~/dap-toi
read -rsp "Mật khẩu admin mới (ít nhất 12 ký tự, chỉ chữ cái và chữ số): " p1; echo
read -rsp "Nhập lại: " p2; echo
[ "$p1" = "$p2" ] || { echo "Hai lần nhập không khớp. Chưa đổi gì."; exit 1; }
[[ "$p1" =~ ^[A-Za-z0-9]{12,}$ ]] || { echo "Mật khẩu cần ít nhất 12 ký tự, chỉ chữ cái và chữ số. Chưa đổi gì."; exit 1; }
sed -i "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$p1/" .env
unset p1 p2
C="sudo docker compose -f compose.yaml -f compose.prod.yaml"
$C up -d --no-deps --force-recreate app >/dev/null 2>&1
$C exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qAt -c "DELETE FROM admin_sessions"' >/dev/null
for i in $(seq 1 30); do
  [ "$(sudo docker inspect -f '{{.State.Health.Status}}' dap-toi-app-1)" = healthy ] && { echo "Đã đổi mật khẩu, app chạy lại bình thường, mọi phiên admin cũ đã bị đăng xuất."; exit 0; }
  sleep 2
done
echo "App chưa healthy sau 60 giây. Xem log: $C logs --tail=30 app"; exit 1
