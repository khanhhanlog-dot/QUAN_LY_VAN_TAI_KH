# Trạng thái chức năng

Cập nhật: 21/10/2026 · Ký hiệu: ✅ hoạt động (đã kiểm thử) · 🟡 có CSDL/RLS, chưa có giao diện · ⏳ chưa triển khai (trong ứng dụng hiển thị nhãn "GĐx" và trang "Đang phát triển").

## Đã hoạt động (Giai đoạn 1–2)

| Chức năng | Trạng thái | Kiểm thử |
|---|---|---|
| Đăng nhập Google, đăng xuất, làm mới phiên | ✅ | E2E (phiên Supabase Auth thật cục bộ); Google OAuth cần chạy thử trên dự án thật |
| Chỉ email được mời mới vào; người lạ ở "chờ cấp quyền" và báo Admin | ✅ | E2E + CSDL |
| Mời người dùng (vai trò, gắn hồ sơ tài xế), thu hồi lời mời | ✅ | E2E + CSDL |
| Khóa/mở tài khoản, gán vai trò, ma trận quyền theo vai trò, cấp/chặn quyền riêng | ✅ | E2E + CSDL (chặn tự cấp quyền, bảo vệ Super Admin) |
| Menu và trang theo quyền; chặn truy cập bằng URL | ✅ | E2E |
| Tổng quan: thẻ số liệu so với kỳ trước (hôm qua, cùng kỳ tháng trước), biểu đồ số chuyến 14 ngày, trạng thái chuyến trong tháng, sản lượng 6 tháng, chuyến gần đây, khách hàng nhiều chuyến nhất, việc cần xử lý, giấy tờ xe sắp hết hạn | ✅ | E2E + 6 kiểm thử CSDL (số liệu tính trực tiếp từ bảng chuyến qua RLS; tài xế chỉ được tính chuyến của mình) |
| Thông báo trong ứng dụng, đánh dấu đã đọc | ✅ | E2E |
| Nhật ký hệ thống (chỉ đọc, không sửa/xóa, che dữ liệu nhạy cảm) | ✅ | E2E + CSDL |
| Cấu hình tham số hệ thống | ✅ | E2E |
| Hồ sơ cá nhân | ✅ | Kiểm thử đơn vị/thủ công |
| Ứng dụng tài xế: xem chuyến được phân công, link Google Maps, gọi điện liên hệ | ✅ | E2E (tài xế khác không thấy) |
| Toàn bộ CSDL 54 bảng, RLS mọi bảng, trigger chống sửa sau duyệt, mã tự sinh, nhật ký tự động | ✅ | 68 kiểm thử CSDL; sinh mã đồng thời 300/300 không trùng |

## Đã hoạt động (Giai đoạn 3)

| Chức năng | Trạng thái | Kiểm thử |
|---|---|---|
| Phương tiện: danh sách, chi tiết, tài chính xe và lịch trả góp (chỉ người có quyền xem dữ liệu nhạy cảm), lịch sử bảo dưỡng | ✅ | E2E + CSDL (điều phối không đọc/ghi được tài chính xe) |
| Tài xế: danh sách, chi tiết, xe được giao, tài khoản đăng nhập, CCCD và tài khoản ngân hàng tách riêng (dữ liệu nhạy cảm) | ✅ | E2E |
| Khách hàng, nhà cung cấp, địa điểm, tuyến đường | ✅ | E2E (tạo nhanh địa điểm bằng nút "+" ngay trong form tuyến) |
| Bảng giá vận chuyển (chặn trùng hiệu lực cùng ưu tiên), quy tắc hỗ trợ dầu, tra cứu giá theo độ cụ thể | ✅ | E2E (kế toán bị chặn khi trùng, đổi ưu tiên thì lưu được) |
| 9 danh mục: loại xe, hạng mục chi phí, ngân hàng, tài khoản công ty, hình thức thanh toán, đơn vị, quy tắc lương, danh mục chung | ✅ | Kiểm thử đơn vị + E2E |
| Mã tự sinh cho danh mục (XE001, TX001, KH001…), mã nhập tay tự chuẩn hóa chữ hoa | ✅ | CSDL |
| Bảng dữ liệu: tìm kiếm, lọc, sắp xếp, phân trang, ẩn/hiện/sắp cột, kéo rộng cột, ghim cột, mật độ dòng; lưu cấu hình theo từng người | ✅ | E2E + CSDL (không đọc/ghi được cấu hình người khác) |
| Nút "+" tạo nhanh bản ghi liên kết mà không rời form | ✅ | E2E |
| Xuất Excel (tối đa 5.000 dòng, theo bộ lọc và cột đang hiện); nhập Excel/CSV có file mẫu, xem trước, báo lỗi từng dòng, ghi một lần toàn bộ hoặc không ghi gì | ✅ | E2E + kiểm thử đơn vị |
| Kiểm tra trùng và khóa lạc quan khi hai người cùng sửa | ✅ | E2E |
| Không xóa được bản ghi đang được dùng (gợi ý ngừng sử dụng thay vì xóa) | ✅ | E2E |
| Giao diện theo mẫu người dùng chọn (21/10/2026): menu xanh đậm, thẻ số liệu có biểu tượng màu, nhãn trạng thái màu, tab lọc trạng thái có số lượng, ô tìm nhanh chức năng (gõ có hoặc không dấu) | ✅ | E2E |
| Trường dữ liệu động: 19 kiểu, bắt buộc, giá trị mặc định, hiện theo điều kiện, quyền xem/sửa riêng, công thức an toàn (không dùng eval), phiên bản + khôi phục, phân tích ảnh hưởng trước khi sửa, không xóa/đổi kiểu khi đã có dữ liệu | ✅ | 29 kiểm thử CSDL + kiểm thử đơn vị + E2E |

## Có sẵn trong CSDL, chờ giao diện

| Chức năng | Trạng thái | Giai đoạn giao diện |
|---|---|---|
| Đơn hàng, Shipment, phân công, ma trận chuyển trạng thái, lịch sử | 🟡 | GĐ4 |
| Chứng từ, phê duyệt nhiều cấp, ứng tiền, chi phí chuyến, thanh toán, công nợ | 🟡 (chỉ đọc qua RLS; ghi qua RPC sẽ viết ở GĐ6–7) | GĐ6–7 |
| Biểu mẫu, quy trình cấu hình được | 🟡 | GĐ6 |

## Chưa triển khai

| Chức năng | Giai đoạn |
|---|---|
| Tải chứng từ, ảnh, tệp đính kèm (kể cả trường động kiểu tệp, đang ghi "GĐ5"); xem qua signed URL | GĐ5 |
| Trình thiết kế biểu mẫu (trang "Biểu mẫu" đang ghi "Giai đoạn 6") | GĐ6 |
| Màn hình điều phối, bảng tổng hợp chuyến kiểu Excel, chi tiết chuyến | GĐ4 |
| Tài xế nhận/từ chối, cập nhật tiến độ, hoàn thành chuyến kèm ảnh (nút đang khóa, ghi rõ "Giai đoạn 5") | GĐ5 |
| Gửi ứng tiền/chi phí, duyệt, hủy duyệt có kiểm soát | GĐ6 |
| Quyết toán, công nợ, 15 báo cáo, chỉ tiêu tài chính trên Tổng quan (đang ghi "Chưa triển khai – Giai đoạn 7") | GĐ7 |
| Kiểm thử E2E đầy đủ, kiểm thử tải, triển khai production | GĐ8 |
