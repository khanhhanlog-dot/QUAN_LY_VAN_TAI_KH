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

## Đã hoạt động (Giai đoạn 7, 22/10/2026)

| Chức năng | Trạng thái | Kiểm thử |
|---|---|---|
| Đối soát lương tài xế cuối tháng (Ứng tiền và chi phí → Đối soát lương): thực nhận = lương cơ bản + số chuyến hoàn thành × lương chuyến + phụ cấp + thưởng − khấu trừ + chi phí tài xế tự trả đã duyệt − tiền đã ứng. Xem trước bảng tính trước khi lập; lập cho một tài xế hoặc tất cả tài xế | ✅ | CSDL + E2E |
| Quy trình bảng lương: Kế toán lập → Giám đốc duyệt → Kế toán ghi nhận trả lương (phiếu chi + cấn trừ sổ tạm ứng). Không lập hai bảng cùng tháng, không trả hai lần, không sửa số tiền trực tiếp; từ chối/hủy thì chi phí được trả lại để lập lại | ✅ | CSDL + E2E |
| Tạm ứng lớn hơn số được nhận: chỉ trừ đến hết lương, phần còn lại tự chuyển sang tháng sau | ✅ | CSDL |
| Tài xế xem bảng lương 12 tháng và tiền ứng đang giữ trên điện thoại | ✅ | CSDL + E2E |
| Công nợ phải thu: lập từ các chuyến đã hoàn thành của cùng khách hàng thanh toán (cước + phụ thu + hỗ trợ dầu), hoặc khoản thu khác; hạn thanh toán tự tính theo số ngày công nợ của khách; chuyến đã lập công nợ bị khóa giá | ✅ | CSDL + E2E |
| Thu/trả nhiều lần, lịch sử từng lần, hủy phiếu ghi nhầm có lý do (không xóa, công nợ tự cộng lại); hủy công nợ chưa thu có lý do | ✅ | CSDL + E2E |
| Công nợ phải trả nhà cung cấp hoặc tài xế/xe ngoài; tuổi nợ (chưa đến hạn, quá hạn 1-30, 31-60, 61-90, trên 90 ngày) | ✅ | CSDL + E2E |
| Danh sách phiếu thu chi (mọi dòng tiền: thu công nợ, trả công nợ, chuyển tiền ứng, trả lương) | ✅ | E2E |
| Báo cáo: lợi nhuận từng chuyến, tổng hợp theo tháng (doanh thu, chi phí, lợi nhuận, lương, tiền thu/chi thực tế), theo xe, tài xế, khách hàng, chi phí theo loại, số dư tạm ứng; thẻ số liệu và biểu đồ 6 tháng; mọi bảng tìm kiếm nâng cao, chọn cột, xuất Excel | ✅ | CSDL + E2E |
| Tổng quan: chỉ tiêu tài chính tháng này tính từ dữ liệu thật (người có quyền xem báo cáo) | ✅ | E2E |
| Lương tính theo quy tắc lương (theo km, % doanh thu, công thức) | ⏳ | Hiện tính theo mức trong hồ sơ tài xế; phụ cấp tính theo tháng |
| Hủy phiếu chuyển tiền ứng, hủy phiếu trả lương | ⏳ | Chưa hỗ trợ (chỉ hủy được phiếu thu/chi công nợ) |
| Báo cáo theo tuyến, nhiên liệu, giao trễ, chứng từ thiếu, lịch sử phê duyệt | ⏳ | Làm khi có nhu cầu |

## Giai đoạn 7b: chi phí tài xế nhập khi hoàn thành chuyến (khách hàng chốt 22/10/2026)

| Chức năng | Trạng thái | Kiểm thử |
|---|---|---|
| Bước "Hoàn thành chuyến" bắt buộc chọn: "Có chi phí" (nhập nhiều khoản: loại, số tiền, ghi chú, ảnh hóa đơn) hoặc "Không phát sinh chi phí" | ✅ | CSDL + E2E |
| Xác nhận không phát sinh chi phí lưu trên chuyến và lịch sử; văn phòng thấy trên chi tiết chuyến | ✅ | CSDL |
| Thẻ chuyến đã xong hiện số khoản, tổng chi phí; nút "Bổ sung chi phí" cho tới khi văn phòng đóng chuyến | ✅ | CSDL + E2E |
| Bỏ nút "Nhập chi phí" riêng trên trang tiền; chi phí chỉ nhập cho chuyến đã hoàn thành | ✅ | CSDL + E2E |
| Tài xế sửa/hủy khoản chưa duyệt (hoặc loại không cần duyệt, chưa vào bảng lương, chuyến chưa đóng). Sửa = khoản cũ chuyển Đã hủy, tạo khoản mới ghi "sửa từ ..."; không chụp lại thì giữ ảnh cũ | ✅ | CSDL + E2E |
| Khoản đã duyệt hoặc chuyến đã đóng: tài xế không sửa được, kế toán xử lý | ✅ | CSDL |
| Cấu hình loại chi phí tài xế được nhập: Danh mục hệ thống → Hạng mục chi phí (Vai trò được nhập có "Tài xế", Bắt buộc ảnh chứng từ, Cần phê duyệt, Đang dùng) | ✅ | Có sẵn từ GĐ3 |

## Giai đoạn 7c: tài xế đăng nhập Google để ứng tiền (khách hàng chốt 22/10/2026)

| Chức năng | Trạng thái | Kiểm thử |
|---|---|---|
| Trang "Ứng tiền & chi phí" bắt buộc đăng nhập Google; nhận ra tài xế theo người, không theo xe (chạy xe nào do điều phối sắp xếp) | ✅ | CSDL + E2E |
| Tự gắn tài khoản: email Google trùng "Email Gmail" trong hồ sơ tài xế (đúng 1 hồ sơ) → tự kích hoạt, chỉ cấp vai trò Tài xế; ghi email sau khi tài xế đã đăng nhập cũng gắn được; tài khoản bị khóa không tự mở lại | ✅ | CSDL |
| Ứng tiền lúc nào cũng được, không cần chuyến; gắn chuyến là không bắt buộc (chỉ chuyến phân cho chính tài xế) | ✅ | CSDL + E2E |
| Sửa/hủy chi phí, xem bảng lương theo tài khoản đăng nhập; link biển số không còn xem được lương, tiền ứng | ✅ | CSDL + E2E |
| Link biển số chỉ dùng cho chuyến: nhận, chạy, hoàn thành, nhập/bổ sung chi phí của chuyến | ✅ | E2E |
| Ảnh biên lai không bắt buộc mặc định (bốc xếp, vá lốp dọc đường không có biên lai); quản lý bật "Bắt buộc ảnh chứng từ" cho từng mục nếu cần | ✅ | CSDL + E2E |
| Quản lý chọn mục chi phí tài xế được thấy: Hạng mục chi phí → "Vai trò được nhập" có "Tài xế" (cột hiện trên danh sách); mục mới mặc định không cho tài xế | ✅ | CSDL |
| Xe thuê ngoài 3PL (Hình thức sở hữu = "Thuê ngoài 3PL"): chuyến không ứng tiền, không nhập chi phí tài xế, hoàn thành không cần khai chi phí | ✅ | CSDL |
| Google OAuth đang ở chế độ Testing: tài xế phải được thêm vào Test users, hoặc chuyển ứng dụng sang Production | ⏳ | Việc cấu hình của chủ tài khoản Google Cloud |

## Cải tiến màn hình Điều phối (khách hàng yêu cầu 29/10/2026)

| Chức năng | Trạng thái | Ghi chú |
|---|---|---|
| Lọc theo khoảng ngày nhận hàng (từ ngày – đến ngày, tối đa 92 ngày, nút nhanh Hôm qua/Hôm nay/Ngày mai/7 ngày tới/Tháng này), công ty/khách hàng, số xe, tài xế, từ khóa, tìm kiếm nâng cao theo mọi cột của chuyến | ✅ | Liên kết cũ `?ngay=` vẫn chạy |
| Báo cáo "Xe chưa có đơn": xe công ty đang hoạt động (không tính 3PL) còn trống trong ngày/khoảng ngày, số ngày trống và danh sách ngày trống | ✅ | Chuyến chạy nhiều ngày tính bận đến ngày giao dự kiến; bảng có tìm kiếm, tìm nâng cao, chọn/kéo/giãn cột, lưu cấu hình |
| Cảnh báo khi giao xe đã có chuyến cùng ngày (khi phân công và khi tạo đơn); tích "Vẫn giao cho xe này" và bắt buộc nhập thứ tự chuyến của xe trong ngày (1, 2…) | ✅ | Migration 0022 (`shipments.vehicle_day_order`), app tài xế xếp chuyến trong ngày theo thứ tự này |

## Chưa triển khai

| Chức năng | Giai đoạn |
|---|---|
| Trường động kiểu tệp | GĐ8 |
| Trình thiết kế biểu mẫu, quy trình (trang đang ghi "Giai đoạn 8") | GĐ8 |
| Kiểm thử tải, triển khai production | GĐ8 |

## Quy chuẩn màn hình (áp dụng mọi màn hình, 2026-10-21)

| Chức năng | Trạng thái | Ghi chú |
|---|---|---|
| Ô chọn danh mục thêm mới ngay tại ô (gõ tên chưa có → Thêm mới, điền sẵn tên) | ✅ | Mọi ô chọn danh mục; theo quyền tạo của vai trò |
| Người dùng tự thêm trường, kể cả trường công thức, cho mọi biểu mẫu | ✅ | Xe, tài xế, khách hàng, nhà cung cấp, địa điểm, loại xe, tuyến, bảng giá, quy tắc dầu, loại chi phí, ngân hàng, phương thức thanh toán, pháp nhân, quy tắc lương, bảo dưỡng, mục danh mục, đơn hàng, chuyến. Liên kết "+ Thêm trường" ngay trong biểu mẫu |
| Kéo thả sắp thứ tự trường trên biểu mẫu (trường hệ thống và trường bổ sung xen kẽ), áp dụng cho mọi người dùng | ✅ | Quản lý trường dữ liệu → chọn màn hình → "Thứ tự trên biểu mẫu". Áp dụng cho form tạo đơn hàng/chuyến (Điều phối) và hộp thêm/sửa của mọi danh mục. Hộp tạo ứng tiền, chi phí, lương, công nợ: trường hệ thống giữ cố định, chỉ trường bổ sung theo thứ tự |
| Ô tìm kiếm trên mọi danh sách | ✅ | Danh mục, bảng chuyến, điều phối, thông báo, người dùng, nhật ký |
| Tìm kiếm nâng cao: người dùng tự thêm điều kiện theo trường (kể cả trường bổ sung) | ✅ | Mọi bảng danh mục và bảng chuyến; xuất Excel theo đúng điều kiện |
| Chọn cột hiển thị, kéo đổi thứ tự cột, kéo giãn cột, kéo giãn dòng, cố định cột, lưu cấu hình theo người dùng | ✅ | Mọi bảng danh mục và bảng chuyến |
| Danh sách trạng thái cố định (trạng thái chuyến, chứng từ, quyết toán) | Không thêm tại ô | Đây là trạng thái quy trình của hệ thống, thêm giá trị mới sẽ làm sai quy trình |
