# BỘ TÀI LIỆU ĐẶC TẢ KỸ THUẬT & VẬN HÀNH TỔNG THỂ (MASTER SPECIFICATION)

## HỆ THỐNG ZALO MINI APP GAMIFICATION & BACKEND CMS ĐA CHI NHÁNH

* **Tên dự án:** Nền tảng Gamification & Chuyển đổi O2O Đa Chi Nhánh (`FTEL FCM TRADE`)

* **Phiên bản tài liệu:** 8.0 (Full Master Specification – Cập nhật luồng SOP, Chatbot FPT & Kho Game 4 Trò Chơi)

* **Đối tượng sử dụng tài liệu:** Ban Quản trị Dự án (Product Owner / Trade Marketing), Đội ngũ Phát triển (Frontend Zalo Mini App, Backend API, Database, Web CMS), Đội ngũ Vận hành Khu vực & Chi nhánh.

## 1. TỔNG QUAN MỤC TIÊU CỐT LÕI CỦA HỆ THỐNG

1. Thu thập dữ liệu khách hàng chính **chủ & Ghi nhớ tự động:** Xác thực 1 chạm qua Zalo (`getUserInfo`, `getPhoneNumber`) lấy Tên và SĐT thật. Tự động lưu trữ thông tin để những lần đăng nhập sau khách không phải nhập lại.

2. **Định tuyến trải nghiệm theo Mã UTM Đầu vào (`utm_in`):** Khi khách quét mã QR tại chi nhánh nào, hệ thống tự động hiển thị đúng **Loại Game** (Vòng quay may mắn / Đập hộp mù 9 ô / Gắp thú / Lật thẻ bài) và **Kho quà tặng riêng** đã được cấu hình cho chi nhánh đó.

3. **Chuyển đổi Kép khi trúng Voucher (`UTM Đầu ra` + `Quy trình SOP`):**

   * **Luồng tự đăng ký:** Khách bấm *"Sử dụng ưu đãi ngay"* $\rightarrow$ Chuyển hướng sang trang **`https://fpt.vn/[UTM_Đầu_Ra]`** và **tự động điền sẵn (Auto-fill) Họ tên + SĐT** của khách lên biểu mẫu web.

   * **Luồng nhờ tư vấn (Đổ dữ liệu Excel lên hệ thống SOP):** Khách bấm *"Nhận tư vấn thêm"* $\rightarrow$ Hệ thống ghi nhận khách hàng vào danh sách yêu cầu tư vấn trên CMS. **Super Admin xuất (Export) danh sách ra file Excel chuẩn hóa để chủ động đẩy lên hệ thống SOP** phân bổ cho Sale xử lý, đồng thời đánh dấu **`[Đã gửi thông tin đến Sale]`** để chuyển trạng thái khách thành **`KHTN` (Khách Hàng Tiềm Năng)**.

4. Báo cáo Tức thì sau **Sự kiện qua Chatbot FPT:** Ngay khi sự kiện/kho quà của chi nhánh hoặc khu vực kết thúc, hệ thống lập tức tổng hợp số liệu và **bắn Báo cáo Tổng kết Sự kiện tự động đến Ban Giám Đốc Khu Vực (BGĐ KV) thông qua Chatbot FPT**.

5. **Hệ thống Quản trị Phân quyền 3 Bậc (`Super Admin` – `Khu Vực` – `Chi Nhánh`):** Đổi tên module quản lý tài khoản thành **Module Phân Quyền**; bảo mật chặt chẽ theo phạm vi dữ liệu, bắt buộc đổi mật khẩu lần đầu, che số điện thoại khách hàng (`090xxxxxxx` - chỉ hiện 3 số đầu) đối với cấp Khu vực & Chi nhánh, và **chỉ duy nhất Super Admin có quyền gửi tin nhắn Zalo OA Remarketing**.

## 2. HÀNH TRÌNH TRẢI NGHIỆM KHÁCH HÀNG TRÊN MINI APP (USER FLOW 6 BƯỚC)

### 2.1. Sơ đồ Luồng Trải Nghiệm & Vòng Lặp Trang Chủ

```
[Bước 1: Quét QR Điểm bán (?utm_in=SG01)]
       │
       ▼
[Bước 2: Kiểm tra Định danh Zalo ID]
  ├──► (Khách mới): Cấp quyền Tên, SĐT Zalo -> Nhập Tỉnh/Thành, Địa chỉ -> Lưu Hồ sơ (+1 lượt chơi)
  └──► (Khách cũ): Tự động nhận diện & Auto-fill 100% thông tin cũ -> Vào thẳng Trang chủ Săn Quà
       │
       ▼
[Bước 3: TRANG CHỦ MINI APP (SẢNH SĂN QUÀ THEO CHI NHÁNH)]
  • Hiển thị: Thông tin KH (cho phép sửa địa chỉ) + Số lượt chơi hiện có + Danh sách "Quà đã trúng của tôi".
  • Khu vực Nhiệm vụ tăng lượt: Quan tâm Zalo OA (+1 lượt) | Chia sẻ cho bạn bè (+1 lượt).
  • Khu vực Kho Game: Hiển thị các Game đang được BẬT cho mã UTM Chi nhánh đó (Vòng quay / 9 Hộp mù / Gắp thú / Lật thẻ bài).
       │
       ▼
[Bước 4: THAM GIA CHƠI GAME (Dùng chung 1 Kho Quà của Chi nhánh)]
  • Giao diện Game vẫn giữ nguyên đầy đủ tất cả các phần quà trên mặt hiển thị (không xóa ô quà đã hết để giữ tính hấp dẫn).
  • Thuật toán Server chỉ quay trúng các món quà đang MỞ, còn hạn và còn tồn kho > 0 (tuyệt đối không rơi vào quà đã hết).
       │
       ▼
[Bước 5: POPUP KẾT QUẢ TRÚNG THƯỞNG & ĐIỀU HƯỚNG CHUYỂN ĐỔI]
  ├──► TH1: Trúng Quà Hiện Vật (Nón bảo hiểm, Áo mưa, Quạt mini...):
  │      • Hiện thông báo trúng giải & hướng dẫn đối chiếu nhận quà.
  │      • Nút bấm: [VỀ TRANG CHỦ (TIẾP TỤC SĂN QUÀ)] ──► Quay lại Bước 3.
  │
  └──► TH2: Trúng Voucher Ưu Đãi (VD: Phiếu giảm giá 100K):
         • Cấp phát 01 Mã Code duy nhất rút từ Kho Voucher được gắn cho Chi nhánh đó.
         • Hiển thị 03 Nút hành động:
           1. [SỬ DỤNG ƯU ĐÃI NGAY] (Nút chính): Mở `https://fpt.vn/[UTM_Đầu_Ra]?fullname=...&phone=...` (Auto-fill Tên & SĐT).
           2. [NHẬN TƯ VẤN THÊM]: Lưu vào danh sách chờ tư vấn trên CMS để Super Admin xuất Excel đưa lên hệ thống SOP & chuyển thành `KHTN`.
           3. [VỀ TRANG CHỦ]: Quay lại Bước 3 để chơi tiếp (nếu còn lượt) hoặc xem lại quà.

```

## 3. MODULE PHÂN QUYỀN 3 BẬC & BẢO MẬT DỮ LIỆU (THAY THẾ MỤC TÀI KHOẢN)

Trên thanh Menu điều hướng của CMS, mục *"Quản lý Tài khoản"* được đổi tên chính thức thành **Module "Phân Quyền" (`Role & Permission Management`)**.

### 3.1. Quy tắc Cấp phát trong Module Phân Quyền & Bảo mật Đăng nhập

* **Super Admin chủ động quản lý Phân quyền:** Tạo người dùng mới, gán nhóm quyền (`Super Admin` / `Khu Vực` / `Chi Nhánh`), gán Cụm chi nhánh (cho cấp Khu Vực) hoặc gán mã `UTM Đầu vào` (cho cấp Chi Nhánh), cấp mật khẩu khởi tạo, khóa/mở khóa và **Reset mật khẩu**.

* **Bắt buộc đổi mật khẩu lần đầu (`Force Password Change`):** Khi người dùng thuộc nhóm quyền Khu Vực hoặc Chi Nhánh đăng nhập lần đầu tiên (hoặc vừa được Super Admin reset mật khẩu), hệ thống chặn mọi thao tác và bắt buộc phải đổi mật khẩu mới trước khi vào trang quản trị.

* **Cơ chế Che Số Điện Thoại (`Phone Masking 090xxxxxxx`):**

  * **Nhóm quyền Super Admin:** Xem trực tiếp trên CMS và xuất file Excel thấy đầy đủ **10 số điện thoại thật** (`0901234567`) để đưa lên hệ thống **SOP**.

  * **Nhóm quyền Khu Vực & Chi Nhánh:** Chỉ nhìn thấy **3** chữ **số đầu tiên**, 7 chữ số sau bị ẩn thành `xxxxxxx` (Ví dụ: `090xxxxxxx`, `098xxxxxxx`). Quy tắc che số này được xử lý trực tiếp tại tầng Backend API nên cả khi **xem trên màn hình CMS** lẫn khi **tải file Export Excel/CSV về máy** đều chỉ hiển thị dạng `090xxxxxxx`.

### 3.2. Ma Trận Phân Quyền Chi Tiết 3 Cấp Bậc (`Super Admin` – `Khu Vực` – `Chi Nhánh`)

| Hạng mục Chức năng trên CMS | **BẬC 1: SUPER ADMIN (Quản trị Tối cao)** | **BẬC 2: QUYỀN KHU VỰC (Quản lý Cụm Chi nhánh)** | **BẬC 3: QUYỀN CHI NHÁNH (User Chi nhánh)** | 
| ----- | ----- | ----- | ----- | 
