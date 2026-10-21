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
