# 5. Danh sách API / Server Actions / hàm CSDL

Quy ước: mọi server action (1) lấy người dùng từ phiên, (2) gọi `requirePermission()`, (3) kiểm tra dữ liệu bằng Zod, (4) ghi qua Supabase client mang JWT người dùng (RLS áp dụng), (5) trả về `{ ok: true, data } | { ok: false, error }` bằng tiếng Việt, không ném lỗi thô ra giao diện. Hàm CSDL `security definer` tự kiểm tra quyền bên trong bằng `private.has_perm()`.

## 5.1 Đã triển khai (Giai đoạn 1–2)

| Tên | Loại | Quyền | Mô tả |
|---|---|---|---|
| `signInWithGoogle` | server action | công khai | Bắt đầu OAuth Google, chuyển về `/auth/callback` |
| `GET /auth/callback` | route handler | công khai | Đổi `code` lấy phiên, chuyển hướng theo trạng thái hồ sơ |
| `signOut` | server action | đăng nhập | Đăng xuất |
| `updateMyProfile` | server action | đăng nhập | Sửa họ tên, số điện thoại của chính mình |
| `inviteUser` | server action → RPC `invite_user` | `users.create` | Mời email + vai trò (+ gắn hồ sơ tài xế); kích hoạt ngay nếu đã đăng nhập trước |
| `revokeInvitation` | server action | `users.update` | Thu hồi lời mời chưa dùng |
| `setUserStatus` | server action | `users.update` | Khóa / mở khóa tài khoản (không tự khóa mình, không khóa Super Admin) |
| `setUserRoles` | server action | `users.configure` | Gán/thu hồi vai trò (trigger chặn tự sửa, chặn cấp Super Admin) |
| `setPermissionOverride` | server action | `users.configure` | Cấp riêng / chặn riêng một quyền cho một người |
| `toggleRolePermission` | server action | `users.configure` | Bật/tắt quyền của vai trò trong ma trận |
| `markNotificationRead` / `markAllNotificationsRead` | server action | đăng nhập | Đánh dấu đã đọc |
| `updateSystemSetting` | server action | `settings.configure` | Sửa tham số hệ thống (JSON hợp lệ) |
| `my_permissions()` | RPC | đăng nhập | Danh sách quyền hiệu lực của người gọi |
| `find_price_lists(...)` | RPC | `price_lists.view` (RLS) | Ứng viên bảng giá theo độ cụ thể + ưu tiên |

## 5.2 Kế hoạch các giai đoạn sau

| Giai đoạn | Tên | Quyền | Ghi chú |
|---|---|---|---|
| 3 | `upsertVehicle`, `upsertVehicleFinancials`, `upsertLoanSchedule`, `addMaintenanceRecord` | `vehicles.*` | |
| 3 | `upsertDriver`, `upsertDriverSensitive`, `inviteDriverLogin` | `drivers.*` | |
| 3 | `upsertCustomer`, `upsertSupplier`, `upsertLocation`, `quickCreateLocation`, `upsertRoute` | `customers.*`, `locations.*` | quick create dùng cho nút "+" |
| 3 | `upsertPriceList`, `upsertFuelSupportRule` | `price_lists.*` | |
| 3 | `upsertCatalogItem`, `upsertExpenseCategory`, `reorderItems` | `catalogs.*` | |
| 3 | `createField`, `updateField` (kèm `analyzeFieldImpact`), `deactivateField`, `restoreFieldVersion` | `fields.configure` | Kiểm tra công thức/báo cáo/quy trình dùng trường trước khi lưu |
| 3 | `saveTableView`, `resetTableView`, `saveRoleDefaultView` | đăng nhập / `settings.configure` | |
| 3 | `importRows` (Excel/CSV), `exportRows` | `*.create` / `*.export` | Xem trước + báo lỗi từng dòng trước khi ghi |
| 3 | `uploadDocument`, `getDocumentUrl` (signed URL 5 phút), `archiveDocument` | `documents.*` | |
| 4 | RPC `create_order_with_shipments(order, shipments[])` | `dispatch.create` | Một transaction; tính giá + hỗ trợ dầu, chụp snapshot |
| 4 | `updateShipment(id, version, patch)` | `shipments.update` | Khóa lạc quan theo `version` |
| 4 | RPC `assign_shipment(shipment_id, driver_id, vehicle_id)` | `dispatch.update` | Thay phân công cũ bằng `superseded`, thông báo tài xế |
| 4 | RPC `cancel_shipment(id, reason)` | `shipments.delete` | Hủy có lý do |
| 4 | RPC `resolve_fuel_support(shipment params)` | nội bộ | Theo thứ tự ưu tiên trong tài liệu 1 |
| 5 | RPC `driver_list_my_shipments()` | `driver_app.use` | Trả về địa điểm, SĐT liên hệ, link Maps của chuyến được phân công |
| 5 | RPC `driver_respond_assignment(assignment_id, accept, reason)` | `driver_app.use` | Chỉ phân công của chính mình; khóa dòng; thông báo điều phối |
| 5 | RPC `driver_update_progress(shipment_id, milestones)` / `driver_complete_shipment(...)` | `driver_app.use` | Kiểm tra bắt buộc trước khi chuyển `driver_completed` |
| 6 | RPC `submit_advance_request(client_request_id, ...)` | `driver_app.use` / `advances.create` | Tạo yêu cầu + approval_request trong một transaction |
| 6 | RPC `submit_shipment_expenses(client_request_id, items[])` | theo `expense_categories.allowed_role_codes` | Kiểm tra chứng từ bắt buộc |
| 6 | RPC `approval_act(request_id, action, comment, expected_version)` | theo `approval_rules` | Duyệt/từ chối/yêu cầu bổ sung; chặn tự duyệt |
| 6 | RPC `approval_revoke(request_id, reason)` | `approvals.configure` | Hủy duyệt có kiểm soát |
| 6–7 | RPC `record_payment(idempotency_key, ...)` | `*.pay` | Chống ghi nhận trùng |
| 7 | RPC `settle_shipment(shipment_id)` / `driver_reconciliation(driver_id, period)` | `settlements.*` | |
| 7 | RPC `report_*` (15 báo cáo) | `reports.view` | Tính trực tiếp từ bảng nguồn, không lưu số liệu tổng hợp trùng |
