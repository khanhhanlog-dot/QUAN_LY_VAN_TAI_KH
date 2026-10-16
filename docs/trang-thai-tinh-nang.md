# Trạng thái chức năng

Cập nhật: 16/10/2026 · Ký hiệu: ✅ hoạt động (đã kiểm thử) · 🟡 có CSDL/RLS, chưa có giao diện · ⏳ chưa triển khai (trong ứng dụng hiển thị nhãn "GĐx" và trang "Đang phát triển").

## Đã hoạt động (Giai đoạn 1–2)

| Chức năng | Trạng thái | Kiểm thử |
|---|---|---|
| Đăng nhập Google, đăng xuất, làm mới phiên | ✅ | E2E (phiên Supabase Auth thật cục bộ); Google OAuth cần chạy thử trên dự án thật |
| Chỉ email được mời mới vào; người lạ ở "chờ cấp quyền" và báo Admin | ✅ | E2E + CSDL |
| Mời người dùng (vai trò, gắn hồ sơ tài xế), thu hồi lời mời | ✅ | E2E + CSDL |
| Khóa/mở tài khoản, gán vai trò, ma trận quyền theo vai trò, cấp/chặn quyền riêng | ✅ | E2E + CSDL (chặn tự cấp quyền, bảo vệ Super Admin) |
| Menu và trang theo quyền; chặn truy cập bằng URL | ✅ | E2E |
| Tổng quan: số chuyến hôm nay/tháng, chờ nhận, đang chạy, trễ, chờ quyết toán, phê duyệt chờ, tài khoản chờ, giấy tờ xe sắp hết hạn | ✅ | E2E (số liệu đọc trực tiếp từ CSDL) |
| Thông báo trong ứng dụng, đánh dấu đã đọc | ✅ | E2E |
| Nhật ký hệ thống (chỉ đọc, không sửa/xóa, che dữ liệu nhạy cảm) | ✅ | E2E + CSDL |
| Cấu hình tham số hệ thống | ✅ | E2E |
| Hồ sơ cá nhân | ✅ | Kiểm thử đơn vị/thủ công |
| Ứng dụng tài xế: xem chuyến được phân công, link Google Maps, gọi điện liên hệ | ✅ | E2E (tài xế khác không thấy) |
| Toàn bộ CSDL 54 bảng, RLS mọi bảng, trigger chống sửa sau duyệt, mã tự sinh, nhật ký tự động | ✅ | 68 kiểm thử CSDL; sinh mã đồng thời 300/300 không trùng |

## Có sẵn trong CSDL, chờ giao diện

| Chức năng | Trạng thái | Giai đoạn giao diện |
|---|---|---|
| Xe, tài xế (tách thông tin nhạy cảm), khách hàng, nhà cung cấp, địa điểm, tuyến, bảng giá (chống trùng hiệu lực), hạng mục chi phí, hỗ trợ dầu 39%, ngân hàng | 🟡 | GĐ3 |
| Tìm bảng giá theo độ cụ thể (`find_price_lists`) | 🟡 | GĐ3–4 |
| Đơn hàng, Shipment, phân công, ma trận chuyển trạng thái, lịch sử | 🟡 | GĐ4 |
| Chứng từ, phê duyệt nhiều cấp, ứng tiền, chi phí chuyến, thanh toán, công nợ | 🟡 (chỉ đọc qua RLS; ghi qua RPC sẽ viết ở GĐ6–7) | GĐ6–7 |
| Trường động, biểu mẫu, quy trình, cấu hình bảng theo người dùng | 🟡 | GĐ3, GĐ6 |

## Chưa triển khai

| Chức năng | Giai đoạn |
|---|---|
| CRUD danh mục, DataTable cấu hình được, nút "+", nhập/xuất Excel, tải chứng từ, trường động + công thức | GĐ3 |
| Màn hình điều phối, bảng tổng hợp chuyến kiểu Excel, chi tiết chuyến | GĐ4 |
| Tài xế nhận/từ chối, cập nhật tiến độ, hoàn thành chuyến kèm ảnh (nút đang khóa, ghi rõ "Giai đoạn 5") | GĐ5 |
| Gửi ứng tiền/chi phí, duyệt, hủy duyệt có kiểm soát | GĐ6 |
| Quyết toán, công nợ, 15 báo cáo, chỉ tiêu tài chính trên Tổng quan (đang ghi "Chưa triển khai – Giai đoạn 7") | GĐ7 |
| Kiểm thử E2E đầy đủ, kiểm thử tải, triển khai production | GĐ8 |
