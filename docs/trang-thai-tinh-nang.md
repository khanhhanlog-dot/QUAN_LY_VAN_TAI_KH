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
| Ứng dụng tài xế (GĐ5a): mở link /tx không cần tài khoản, nhập biển số xe (tự viết hoa, bỏ ký tự đặc biệt), xem chuyến dạng thẻ (giờ nhận/giao, điểm nhận/giao, chỉ đường, gọi điện, ghi chú), bấm Nhận đơn; máy nhớ xe 30 ngày; điều phối nhận thông báo. Người dùng chọn chỉ cần biển số (ai biết biển số cũng xem/nhận được chuyến của xe đó) | ✅ | 19 kiểm thử CSDL + E2E |
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
| Điều phối (GĐ4): tạo đơn hàng nhiều chuyến trong một giao dịch, tự tìm bảng giá (bắt chọn khi ngang nhau, nhập tay khi không có), hỗ trợ dầu theo thứ tự ưu tiên và chụp lại tham số trên chuyến, phân công/đổi/gỡ tài xế và xe (gợi ý tài xế phụ trách xe), thông báo cho tài xế, hủy chuyến bắt buộc lý do, xem theo ngày với tab trạng thái và chuyến trễ, chi tiết đơn hàng, thêm chuyến vào đơn đang mở | ✅ | 46 kiểm thử CSDL + 42 kiểm thử giao diện E2E |
| Quản lý chuyến xe (GĐ4): bảng kiểu Excel cố định cột mã chuyến, lọc theo ngày/khách hàng/trạng thái/từ khóa, tổng tiền theo bộ lọc, sửa nhanh số lượng/đơn giá/phụ phí/% hỗ trợ dầu/ghi chú (chống hai người sửa cùng lúc), xuất Excel; chi tiết chuyến với nguồn giá, lịch sử trạng thái, lịch sử phân công, lịch sử thay đổi giá | ✅ | CSDL + E2E |
| Trường dữ liệu động: 19 kiểu, bắt buộc, giá trị mặc định, hiện theo điều kiện, quyền xem/sửa riêng, công thức an toàn (không dùng eval), phiên bản + khôi phục, phân tích ảnh hưởng trước khi sửa, không xóa/đổi kiểu khi đã có dữ liệu | ✅ | 29 kiểm thử CSDL + kiểm thử đơn vị + E2E |

## Đã hoạt động (Giai đoạn 5 hoàn thiện và Giai đoạn 6, 22/10/2026)

| Chức năng | Trạng thái | Kiểm thử |
|---|---|---|
| Tài xế bấm Bắt đầu chạy, Hoàn thành chuyến; bắt buộc ít nhất 1 ảnh (ảnh hàng hoặc phiếu ký nhận); giao thiếu/không giao phải ghi lý do; điều phối nhận thông báo | ✅ | CSDL + E2E |
| Gửi ảnh từ điện thoại không cần tài khoản: ảnh thu nhỏ trên máy, tải thẳng lên Storage riêng tư bằng "vé" 2 giờ do CSDL cấp (tối đa 10 tệp/vé), không dùng khóa bí mật | ✅ | CSDL (vé bịa, tên tệp lạ, vé đã dùng bị chặn) + E2E với Storage thật cục bộ |
| Xem ảnh, chứng từ qua đường dẫn tạm 10 phút; nhân viên tải thêm chứng từ trên chi tiết chuyến | ✅ | E2E |
| Tài xế xin ứng tiền, nhập chi phí kèm ảnh hóa đơn, xem trạng thái, hủy yêu cầu đang chờ; gửi trùng do mạng chập chờn chỉ ghi 1 lần | ✅ | CSDL + E2E |
| Quy trình khách chốt: tài xế gửi → Giám đốc duyệt (được duyệt ít hơn số xin) → Kế toán ghi nhận chuyển tiền (phiếu chi, sổ tạm ứng). Không tự duyệt khoản của mình, không duyệt/chuyển tiền hai lần, từ chối bắt buộc lý do | ✅ | 40+ kiểm thử CSDL + E2E |
| Tắt duyệt cho từng loại chi phí (Danh mục → Hạng mục chi phí → Cần phê duyệt) | ✅ | CSDL |
| Cấu hình cấp duyệt (Phê duyệt → Cấu hình cấp duyệt): vai trò duyệt, cấp, khoảng số tiền | ✅ | E2E |
| Màn hình Ứng tiền và chi phí, Phê duyệt: đủ quy chuẩn (tìm kiếm, tìm kiếm nâng cao, chọn/kéo/giãn cột, xuất Excel, thêm trường cho biểu mẫu) | ✅ | E2E |
| Chi tiết chuyến: kết quả giao hàng, ảnh, chi phí chuyến, chi phí đã duyệt và lợi nhuận gộp | ✅ | E2E |
| Chưa làm: hủy duyệt sau khi đã duyệt, hủy phiếu chi, yêu cầu bổ sung thông tin | ⏳ | Làm khi có nhu cầu |

## Có sẵn trong CSDL, chờ giao diện

| Chức năng | Trạng thái | Giai đoạn giao diện |
|---|---|---|
| Công nợ phải thu/phải trả, thanh toán nhiều lần | 🟡 (chỉ đọc qua RLS) | GĐ7 |
| Biểu mẫu, quy trình cấu hình được | 🟡 | GĐ8 |

## Chưa triển khai

| Chức năng | Giai đoạn |
|---|---|
| Trường động kiểu tệp | GĐ8 |
| Trình thiết kế biểu mẫu, quy trình (trang đang ghi "Giai đoạn 8") | GĐ8 |
| Đối soát cuối tháng: tiền ứng trừ chi phí được duyệt, cộng/trừ vào lương | GĐ7 |
| Quyết toán, công nợ, 15 báo cáo, chỉ tiêu tài chính trên Tổng quan (đang ghi "Chưa triển khai – Giai đoạn 7") | GĐ7 |
| Kiểm thử E2E đầy đủ, kiểm thử tải, triển khai production | GĐ8 |

## Quy chuẩn màn hình (áp dụng mọi màn hình, 2026-10-21)

| Chức năng | Trạng thái | Ghi chú |
|---|---|---|
| Ô chọn danh mục thêm mới ngay tại ô (gõ tên chưa có → Thêm mới, điền sẵn tên) | ✅ | Mọi ô chọn danh mục; theo quyền tạo của vai trò |
| Người dùng tự thêm trường, kể cả trường công thức, cho mọi biểu mẫu | ✅ | Xe, tài xế, khách hàng, nhà cung cấp, địa điểm, loại xe, tuyến, bảng giá, quy tắc dầu, loại chi phí, ngân hàng, phương thức thanh toán, pháp nhân, quy tắc lương, bảo dưỡng, mục danh mục, đơn hàng, chuyến. Liên kết "+ Thêm trường" ngay trong biểu mẫu |
| Ô tìm kiếm trên mọi danh sách | ✅ | Danh mục, bảng chuyến, điều phối, thông báo, người dùng, nhật ký |
| Tìm kiếm nâng cao: người dùng tự thêm điều kiện theo trường (kể cả trường bổ sung) | ✅ | Mọi bảng danh mục và bảng chuyến; xuất Excel theo đúng điều kiện |
| Chọn cột hiển thị, kéo đổi thứ tự cột, kéo giãn cột, kéo giãn dòng, cố định cột, lưu cấu hình theo người dùng | ✅ | Mọi bảng danh mục và bảng chuyến |
| Danh sách trạng thái cố định (trạng thái chuyến, chứng từ, quyết toán) | Không thêm tại ô | Đây là trạng thái quy trình của hệ thống, thêm giá trị mới sẽ làm sai quy trình |
