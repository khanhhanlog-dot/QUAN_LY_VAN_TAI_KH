#!/usr/bin/env bash
# Chạy toàn bộ migration + kiểm thử bảo mật trên một CSDL Postgres TẠM (không bao giờ trỏ vào CSDL thật).
# Yêu cầu: PostgreSQL 15+ cục bộ; dùng biến môi trường PGHOST/PGPORT/PGUSER nếu cần.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-gha_tms_test}"
dropdb --if-exists "$DB" 2>/dev/null
createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/00_supabase_stub.sql > /dev/null
for f in supabase/migrations/*.sql; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f" > /dev/null 2> >(grep -v NOTICE >&2)
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/01_security_tests.sql 2>&1 | sed -E 's/^psql:[^:]+:[0-9]+: (NOTICE|ERROR):  /\1: /'
