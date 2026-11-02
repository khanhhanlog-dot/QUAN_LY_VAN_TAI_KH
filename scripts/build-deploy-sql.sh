#!/usr/bin/env bash
# Ghép toàn bộ migration thành một tệp để dán vào Supabase SQL Editor khi cài đặt lần đầu.
# Cách dùng: bash scripts/build-deploy-sql.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=supabase/deploy/cai-dat-lan-dau.sql
mkdir -p "$(dirname "$OUT")"
{
  echo "-- ============================================================================="
  echo "-- KHÁNH HÀ TMS – CÀI ĐẶT CƠ SỞ DỮ LIỆU LẦN ĐẦU"
  echo "-- Dán toàn bộ tệp vào Supabase → SQL Editor → Run. Chỉ chạy MỘT LẦN trên dự án mới."
  echo "-- Không chứa dữ liệu mẫu. Tệp được ghép tự động từ supabase/migrations/ – không sửa tay."
  echo "-- ============================================================================="
  echo "begin;"
  for f in supabase/migrations/*.sql; do
    echo
    echo "-- >>> $(basename "$f")"
    cat "$f"
  done
  echo
  echo "commit;"
} > "$OUT"
echo "Đã tạo $OUT ($(wc -l < "$OUT") dòng)"

# Tệp nâng cấp cho CSDL đã cài trước đó: mỗi giai đoạn một tệp, chạy đúng một lần theo thứ tự.
upgrade() {
  local name="$1" title="$2" guard="$3"; shift 3
  local out="supabase/deploy/$name"
  {
    echo "-- ============================================================================="
    echo "-- KHÁNH HÀ TMS – NÂNG CẤP CƠ SỞ DỮ LIỆU: $title"
    echo "-- Dán toàn bộ tệp vào Supabase → SQL Editor → Run. Chạy MỘT LẦN trên CSDL đang dùng."
    echo "-- Không xóa và không thêm dữ liệu nghiệp vụ. Tệp được ghép tự động – không sửa tay."
    echo "-- ============================================================================="
    echo "begin;"
    echo
    echo "do \$\$ begin"
    echo "  if $guard then"
    echo "    raise exception 'CSDL đã được nâng cấp $title trước đó, không cần chạy lại.';"
    echo "  end if;"
    echo "end \$\$;"
    for f in "$@"; do
      echo
      echo "-- >>> $(basename "$f")"
      cat "$f"
    done
    echo
    echo "commit;"
  } > "$out"
  echo "Đã tạo $out ($(wc -l < "$out") dòng)"
}

upgrade nang-cap-giai-doan-4.sql "Giai đoạn 4 (điều phối)" "to_regclass('public.shipment_list') is not null" \
  supabase/migrations/20261021000013_dispatch.sql

upgrade nang-cap-giai-doan-5a.sql "Giai đoạn 5a (tài xế nhận chuyến qua link)" "to_regprocedure('public.driver_link_login(text)') is not null" \
  supabase/migrations/20261021000014_driver_link.sql

upgrade nang-cap-giai-doan-5b.sql "Giai đoạn 5b (trường bổ sung cho mọi biểu mẫu)" "private.custom_field_table('vehicle_types') is not null" \
  supabase/migrations/20261021000015_custom_fields_everywhere.sql

upgrade nang-cap-giai-doan-6.sql "Giai đoạn 6 (hoàn thành chuyến kèm ảnh, ứng tiền, chi phí, phê duyệt)" "to_regprocedure('public.approval_decide(uuid,text,text,numeric)') is not null" \
  supabase/migrations/20261022000016_driver_progress_finance.sql

upgrade nang-cap-giai-doan-7.sql "Giai đoạn 7 (đối soát lương tài xế, công nợ, báo cáo)" "to_regclass('public.driver_payrolls') is not null" \
  supabase/migrations/20261022000017_payroll_debts_reports.sql

upgrade nang-cap-giai-doan-7b.sql "Giai đoạn 7b (chi phí tài xế nhập khi hoàn thành chuyến, sửa/hủy chi phí)" "to_regprocedure('public.driver_link_update_expense(text,uuid,uuid,numeric,text,uuid)') is not null" \
  supabase/migrations/20261022000018_driver_expense_on_complete.sql

upgrade nang-cap-giai-doan-7c.sql "Giai đoạn 7c (tài xế đăng nhập Google để ứng tiền, xem chi phí và lương)" "to_regprocedure('public.driver_me_finance()') is not null" \
  supabase/migrations/20261022000019_driver_google_money.sql

upgrade nang-cap-tang-toc-tim-kiem.sql "Tăng tốc tìm kiếm (RLS tính quyền một lần mỗi truy vấn)" "to_regprocedure('private.wrap_rls_calls(text)') is not null" \
  supabase/migrations/20261029000020_rls_performance.sql

upgrade nang-cap-thu-tu-truong.sql "Sắp thứ tự trường trên biểu mẫu (Quản lý trường dữ liệu)" "to_regclass('public.form_layouts') is not null" \
  supabase/migrations/20261029000021_form_layouts.sql

upgrade nang-cap-an-hien-truong.sql "Hiện/ẩn trường bổ sung theo giá trị trường khác" "to_regprocedure('private.valid_visibility_condition(text)') is not null" \
  supabase/migrations/20261029000022_field_visibility.sql

upgrade nang-cap-thu-tu-chuyen-xe.sql "Thứ tự chuyến của xe trong ngày (Điều phối)" "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shipments' and column_name = 'vehicle_day_order')" \
  supabase/migrations/20261029000023_vehicle_day_order.sql

upgrade nang-cap-khach-thanh-toan-gia-sau.sql "Khách thanh toán mặc định, tạo chuyến khi chưa có giá" "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'customers' and column_name = 'default_payer_customer_id')" \
  supabase/migrations/20261030000024_customer_default_payer.sql supabase/migrations/20261030000025_price_later.sql

upgrade nang-cap-dieu-phoi-lam-thay.sql "Điều phối làm thay tài xế, bỏ qua ảnh có lý do" "to_regprocedure('public.dispatch_act_for_driver(uuid,text,text,text,boolean,text)') is not null" \
  supabase/migrations/20261030000026_dispatch_act_for_driver.sql

upgrade nang-cap-hang-hoa-chuyen.sql "Hàng hóa (nhiều mã hàng) của chuyến" "to_regclass('public.shipment_items') is not null" \
  supabase/migrations/20261030000027_shipment_items.sql

upgrade nang-cap-sua-huy-don.sql "Đổi kiểu trường tương thích, hủy đơn hàng" "to_regprocedure('public.cancel_transport_order(uuid,text)') is not null" \
  supabase/migrations/20261030000028_field_type_compat.sql

upgrade nang-cap-loai-phi-thu-khach.sql "Tách cước phí theo loại phí thu khách (bốc xếp, chi hộ...)" "to_regclass('public.shipment_fees') is not null" \
  supabase/migrations/20261030000029_customer_fees.sql

upgrade nang-cap-bao-cao-boc-xep.sql "Báo cáo cước vận chuyển, phí chi hộ, bốc xếp; nhà thầu bốc xếp" "to_regclass('public.report_loading') is not null" \
  supabase/migrations/20261030000030_fee_reports_loading.sql

upgrade nang-cap-ma-khach-bao-cao.sql "Báo cáo hiển thị mã khách hàng; xóa dữ liệu thử trong ứng dụng" "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'report_shipment_profit' and column_name = 'customer_code')" \
  supabase/migrations/20261030000031_report_customer_code.sql

upgrade nang-cap-giam-doc-duyet-chuyen.sql "Giám đốc duyệt chuyến (có ủy quyền duyệt hộ)" "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shipments' and column_name = 'dispatch_approval')" \
  supabase/migrations/20261101000033_trip_director_approval.sql supabase/migrations/20261101000034_trip_approval_delegation.sql
upgrade nang-cap-tach-boc-xep-chi-ho.sql "Tách phí bốc xếp khỏi báo cáo phí chi hộ" "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'report_fee_lines' and column_name = 'is_loading')" \
  supabase/migrations/20261030000032_loading_fee_split.sql
upgrade nang-cap-nhom-phi.sql "Nhóm phí (vận chuyển, chi hộ, tờ khai, bốc xếp), loại tờ khai, báo cáo chi phí theo nhóm" "to_regclass('public.fee_groups') is not null" \
  supabase/migrations/20261101000035_fee_groups.sql
upgrade nang-cap-nhap-chuyen-excel.sql "Nhập đơn hàng, chuyến từ Excel" "to_regprocedure('public.import_transport_order(jsonb,jsonb)') is not null" \
  supabase/migrations/20261101000036_import_trips.sql
upgrade nang-cap-tong-theo-nhom-phi.sql "Phí vận chuyển, chi hộ, tờ khai, bốc xếp trên Quản lý chuyến; công thức tính tiền" "to_regclass('public.shipment_fee_role_totals') is not null" \
  supabase/migrations/20261101000037_shipment_fee_role_totals.sql
upgrade nang-cap-so-hoa-don-phi.sql "Số hóa đơn, số chứng từ, số lượng × đơn giá cho dòng phí của chuyến" "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shipment_fees' and column_name = 'ref_no')" \
  supabase/migrations/20261101000038_shipment_fee_ref_qty.sql
upgrade nang-cap-loi-lo-chuyen.sql "Lời/lỗ từng chuyến, chia chi phí xe theo chuyến trong tháng" "to_regclass('public.shipment_profit') is not null" \
  supabase/migrations/20261101000039_trip_profit.sql
upgrade nang-cap-xin-nghi-ban-giao.sql "Xin nghỉ (phép/ốm), bàn giao khách hàng, nhân viên phụ trách khách" "to_regclass('public.leave_requests') is not null" \
  supabase/migrations/20261101000041_leave_requests.sql
upgrade nang-cap-de-nghi-chi.sql "Phiếu đề nghị chi, mua sắm (Giám đốc duyệt, Kế toán chi tiền)" "to_regclass('public.purchase_requests') is not null" \
  supabase/migrations/20261101000040_purchase_requests.sql
upgrade nang-cap-chi-phi-3pl.sql "Chi phí và thanh toán xe thuê ngoài 3PL (cước, chi hộ phải trả nhà xe, báo cáo)" "to_regclass('public.shipment_carrier_costs') is not null" \
  supabase/migrations/20261101000042_carrier_costs.sql
upgrade nang-cap-tro-chuyen.sql "Trò chuyện riêng và nhóm trong ứng dụng" "to_regclass('public.chat_messages') is not null" \
  supabase/migrations/20261101000043_chat.sql
upgrade nang-cap-giao-viec.sql "Giao việc (Giám đốc giao việc, theo dõi tiến độ, hạn, trao đổi)" "to_regclass('public.tasks') is not null" \
  supabase/migrations/20261101000044_tasks.sql
upgrade nang-cap-lap-ke-hoach.sql "Lập kế hoạch (tạo đơn theo số cont, thứ tự chuyến, hạ rỗng trái tuyến, SĐT điểm nhận/giao)" "to_regclass('public.transport_plans') is not null" \
  supabase/migrations/20261102000045_transport_plans.sql
upgrade nang-cap-tra-ve-ke-hoach.sql "Hủy đơn trả cont về Lập kế hoạch, khôi phục chuyến đã hủy" "to_regprocedure('public.restore_shipment(uuid)') is not null" \
  supabase/migrations/20261102000046_plan_return_restore.sql
