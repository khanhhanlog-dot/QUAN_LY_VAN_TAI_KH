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

upgrade nang-cap-thu-tu-chuyen-xe.sql "Thứ tự chuyến của xe trong ngày (Điều phối)" "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'shipments' and column_name = 'vehicle_day_order')" \
  supabase/migrations/20261029000023_vehicle_day_order.sql
