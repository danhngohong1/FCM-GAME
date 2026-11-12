# YÊU CẦU — Mini game "Đập Chuột" (Whack-a-Mole)

> Phiên bản: 1.0 · Ngày: 12/11/2026 · Trạng thái: Đặc tả, chưa viết code

## 1. Tổng quan

Mini game chạy trên trình duyệt (desktop và điện thoại), không cần cài đặt, không cần máy chủ. Người chơi bấm vào con chuột xuất hiện ngẫu nhiên trong lưới 3×3 ô để ghi điểm trong thời gian 30 giây.

- Nền tảng: HTML + CSS + JavaScript thuần, mở trực tiếp file `index.html` là chơi được.
- Thiết bị: chuột (desktop) và cảm ứng (mobile).
- Ngôn ngữ giao diện: tiếng Việt.

## 2. Luật chơi

1. Bàn chơi gồm **9 ô (lưới 3×3)**, mỗi ô là một "hang".
2. Người chơi bấm nút **"Bắt đầu"** để vào lượt chơi. Đồng hồ đếm ngược **30 giây** bắt đầu chạy ngay.
3. Trong lượt chơi, **mỗi thời điểm chỉ có tối đa 1 con chuột** hiện lên ở một ô ngẫu nhiên.
4. Chuột ở trên mặt đất trong một khoảng thời gian ngắn (mặc định **800 ms**), sau đó tự chui xuống.
5. Sau khi chuột chui xuống (hoặc bị đập), chờ **khoảng nghỉ ngẫu nhiên 200–500 ms** rồi chuột mới hiện ở ô khác.
6. Ô chuột hiện lần tiếp theo **không trùng** với ô vừa hiện liền trước.
7. Người chơi bấm/chạm trúng chuột → chuột bị đập, biến mất ngay và được cộng điểm.
8. Bấm vào ô trống hoặc bấm khi chuột đã chui xuống → **không cộng, không trừ** điểm.
9. Mỗi con chuột chỉ được tính điểm **một lần** (bấm nhiều lần liên tiếp vào cùng con chuột chỉ được 1 điểm).
10. Khi đồng hồ về **0**: lượt chơi kết thúc, chuột không còn xuất hiện, mọi thao tác bấm trên lưới bị bỏ qua.
11. Người chơi có thể bấm **"Chơi lại"** để bắt đầu lượt mới; điểm và thời gian được đặt lại từ đầu.

## 3. Cách tính điểm

| Hành động | Điểm |
|---|---|
| Bấm trúng chuột đang hiện | **+1** |
| Bấm vào ô trống | 0 |
| Bấm trúng cùng một con chuột lần thứ 2 trở đi | 0 |
| Để chuột chui xuống mà không bấm | 0 |
| Bấm sau khi hết giờ | 0 (không ghi nhận) |

- Điểm bắt đầu mỗi lượt: **0**.
- Điểm không bao giờ âm.
- **Điểm cao nhất (kỷ lục)**: lưu trong `localStorage` của trình duyệt. Khi kết thúc lượt, nếu điểm lượt này lớn hơn kỷ lục thì cập nhật kỷ lục và hiện thông báo "Kỷ lục mới!". Nếu trình duyệt không cho dùng `localStorage`, game vẫn chơi bình thường, chỉ không lưu kỷ lục.

## 4. Màn hình

Game gồm 3 trạng thái màn hình trên cùng một trang.

### 4.1. Màn hình bắt đầu

- Tên game: **"Đập Chuột"**.
- Mô tả ngắn luật chơi (1–2 câu): "Bấm trúng chuột để ghi điểm. Bạn có 30 giây!"
- Hiển thị **Kỷ lục: N** (ẩn hoặc hiện 0 nếu chưa có).
- Nút **"Bắt đầu"** nổi bật.

### 4.2. Màn hình chơi

```
┌───────────────────────────────┐
│  Điểm: 12        ⏱ 00:18      │  ← thanh trạng thái
├───────────────────────────────┤
│   [ ]     [🐭]     [ ]        │
│   [ ]     [ ]      [ ]        │  ← lưới 3×3
│   [ ]     [ ]      [ ]        │
└───────────────────────────────┘
```

- **Thanh trạng thái** ở trên: điểm hiện tại (bên trái) và thời gian còn lại (bên phải, đếm theo giây).
- Khi còn **≤ 5 giây**, đồng hồ đổi sang màu đỏ để báo sắp hết giờ.
- **Lưới 3×3** ở giữa: 9 ô kích thước bằng nhau, dạng hình vuông, có khoảng cách giữa các ô.
- Chuột có hiệu ứng **trồi lên / chui xuống** (animation ngắn ~100–150 ms).
- Khi đập trúng: hiệu ứng phản hồi (chuột đổi hình "bị choáng" hoặc ô nháy) và hiện "+1" bay lên trong ~300 ms.
- Con trỏ chuột trên desktop có thể thay bằng hình cái búa (không bắt buộc).

### 4.3. Màn hình kết thúc

- Tiêu đề **"Hết giờ!"**.
- **Điểm của bạn: N**.
- **Kỷ lục: M** — kèm dòng "Kỷ lục mới!" nếu vừa phá kỷ lục.
- Nút **"Chơi lại"** (vào thẳng lượt mới, không quay về màn hình bắt đầu).

### 4.4. Yêu cầu chung về giao diện

- Bố cục **responsive**: chơi được trên màn hình rộng từ **320 px** trở lên, lưới luôn nằm gọn trong màn hình, không phải cuộn ngang.
- Ô lưới đủ lớn để bấm bằng ngón tay (tối thiểu **64×64 px**).
- Chạm trên điện thoại không gây phóng to trang, không chọn chữ, không có độ trễ bấm đáng kể.
- Màu sắc tươi sáng, chữ dễ đọc, độ tương phản đạt tối thiểu WCAG AA cho chữ.

## 5. Thông số cấu hình

Các giá trị sau đặt ở một chỗ duy nhất trong code để dễ chỉnh:

| Tham số | Giá trị mặc định |
|---|---|
| Kích thước lưới | 3 × 3 |
| Thời gian mỗi lượt | 30 giây |
| Thời gian chuột ở trên mặt đất | 800 ms |
| Khoảng nghỉ giữa 2 lần chuột hiện | ngẫu nhiên 200–500 ms |
| Điểm mỗi lần đập trúng | 1 |

## 6. Ngoài phạm vi (phiên bản này)

- Âm thanh, nhạc nền.
- Nhiều mức độ khó, chuột tăng tốc theo thời gian.
- Nhiều chuột cùng lúc, vật phẩm đặc biệt (bom, chuột vàng…).
- Bảng xếp hạng online, đăng nhập, lưu điểm lên máy chủ.

## 7. Tiêu chí hoàn thành

Game được coi là hoàn thành khi **tất cả** các mục sau đều đạt:

### Chức năng
- [ ] Mở `index.html` trực tiếp trong trình duyệt là chơi được, không cần server, không lỗi trong Console.
- [ ] Màn hình bắt đầu hiển thị tên game, luật chơi ngắn, kỷ lục và nút "Bắt đầu".
- [ ] Bấm "Bắt đầu" → đồng hồ chạy từ 30 về 0, điểm bắt đầu từ 0.
- [ ] Lưới hiển thị đúng 9 ô xếp 3×3.
- [ ] Tại mọi thời điểm có tối đa 1 chuột trên lưới; chuột không hiện 2 lần liên tiếp ở cùng một ô.
- [ ] Chuột tự chui xuống sau ~800 ms nếu không bị đập.
- [ ] Bấm trúng chuột: điểm +1, chuột biến mất ngay, có hiệu ứng phản hồi.
- [ ] Bấm ô trống, bấm lặp lại cùng con chuột: điểm không đổi.
- [ ] Lượt chơi kết thúc đúng 30 giây (sai số ≤ 0,5 giây), kể cả khi chuyển tab rồi quay lại.
- [ ] Sau khi hết giờ: không còn chuột xuất hiện, bấm lưới không đổi điểm, màn hình kết thúc hiện đúng điểm.
- [ ] Kỷ lục được lưu và vẫn còn sau khi tải lại trang; chỉ cập nhật khi điểm mới lớn hơn.
- [ ] "Chơi lại" đặt lại điểm = 0, thời gian = 30 và không còn bộ hẹn giờ cũ chạy chồng (bấm "Chơi lại" nhiều lần nhanh không làm đồng hồ chạy nhanh gấp đôi).

### Giao diện & tương thích
- [ ] Chạy đúng trên Chrome, Edge, Firefox bản mới nhất và Safari/Chrome trên điện thoại.
- [ ] Hiển thị gọn trên màn hình rộng 320 px và 1920 px, không cuộn ngang.
- [ ] Chơi bằng cảm ứng mượt, không bị phóng to trang khi chạm nhanh.
- [ ] Đồng hồ chuyển màu đỏ khi còn ≤ 5 giây.

### Mã nguồn
- [ ] Các thông số ở mục 5 nằm tập trung tại một chỗ.
- [ ] Không dùng thư viện ngoài.
