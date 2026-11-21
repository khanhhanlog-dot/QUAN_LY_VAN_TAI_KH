-- =============================================================================
-- KHÁNH HÀ TMS – NÂNG CẤP CƠ SỞ DỮ LIỆU: Tự động sao lưu dữ liệu theo giờ, tải Excel, gửi email
-- Dán toàn bộ tệp vào Supabase → SQL Editor → Run. Chạy MỘT LẦN trên CSDL đang dùng.
-- Không xóa và không thêm dữ liệu nghiệp vụ. Tệp được ghép tự động – không sửa tay.
-- =============================================================================
begin;

do $$ begin
  if to_regclass('public.data_backups') is not null then
    raise exception 'CSDL đã được nâng cấp Tự động sao lưu dữ liệu theo giờ, tải Excel, gửi email trước đó, không cần chạy lại.';
  end if;
end $$;

-- >>> 20261121000076_scheduled_backups.sql
-- =============================================================================
-- KHÁNH HÀ TMS - 0076: Tự động sao lưu dữ liệu theo giờ (21/11/2026)
--   - Mỗi ngày tự sao lưu toàn bộ dữ liệu vào các giờ đã chọn (mặc định 09:00, 14:00, 17:00 giờ Việt Nam).
--   - Mỗi bản sao lưu là ảnh chụp toàn bộ các bảng dữ liệu (đơn, chuyến, phí, chi phí, công nợ, danh mục,
--     tài xế, xe, ...) tại thời điểm đó; tải về thành tệp Excel ở trang Quản trị → Sao lưu dữ liệu.
--   - Hẹn giờ bằng pg_cron của Supabase (chạy trong CSDL, không phụ thuộc Vercel): cứ 10 phút kiểm tra một lần,
--     đến giờ đã chọn mà chưa có bản sao lưu của giờ đó thì sao lưu (lỗi thì tự thử lại, tối đa 3 lần mỗi giờ).
--   - Tự xóa bản sao lưu cũ hơn số ngày giữ (mặc định 30 ngày), luôn giữ lại ít nhất 3 bản thành công gần nhất.
--   - Có nút "Sao lưu ngay". Sao lưu lỗi thì báo cho người có quyền cấu hình sao lưu.
--   - Gửi email: nhập danh sách email nhận; mỗi lần tự sao lưu xong, gửi tệp Excel dữ liệu kỳ hiện tại
--     (tháng này; từ ngày 1 đến ngày 15 kèm thêm tháng trước, từ ngày 16 bỏ tháng trước) về các email đó.
--     CSDL gọi ứng dụng (pg_net) kèm mã dùng một lần; ứng dụng đổi mã lấy dữ liệu, tạo Excel và gửi bằng Gmail.
--   Quyền mới backups.{view, create, configure}.
--   Không sao lưu: nhật ký hệ thống, thông báo, tin nhắn trò chuyện, khóa sửa tạm, cấu hình cột cá nhân.
--   Ảnh/tệp đính kèm nằm ở Supabase Storage, không nằm trong bản sao lưu (chỉ có danh sách chứng từ).
-- =============================================================================

-- 1. Quyền
insert into public.permissions (code, module, action, name, sort_order) values
  ('backups.view', 'backups', 'view', 'Xem, tải về - Sao lưu dữ liệu', 2801),
  ('backups.create', 'backups', 'create', 'Sao lưu ngay - Sao lưu dữ liệu', 2803),
  ('backups.configure', 'backups', 'configure', 'Cấu hình giờ sao lưu - Sao lưu dữ liệu', 2805)
on conflict (code) do nothing;

-- Mặc định: Admin toàn quyền; Giám đốc xem, tải về, sao lưu ngay (Super Admin luôn có mọi quyền)
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on p.module = 'backups' and (
  r.code = 'admin'
  or (r.code = 'director' and p.action in ('view', 'create')))
on conflict do nothing;

-- 2. Tham số
insert into public.system_settings (key, value, description) values
  ('backup.enabled', 'true', 'Tự động sao lưu dữ liệu theo giờ'),
  ('backup.hours', '[9, 14, 17]', 'Các giờ tự sao lưu mỗi ngày (giờ Việt Nam, 0-23)'),
  ('backup.keep_days', '30', 'Số ngày giữ bản sao lưu (cũ hơn tự xóa)'),
  ('backup.emails', '[]', 'Email nhận tệp Excel sau mỗi lần tự sao lưu'),
  ('backup.app_url', '"https://quan-ly-van-tai-kh.vercel.app"', 'Địa chỉ ứng dụng (CSDL gọi vào để gửi email sao lưu)')
on conflict (key) do nothing;

-- 3. Bảng lưu bản sao lưu
create table if not exists public.data_backups (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('auto', 'manual')),
  status text not null check (status in ('ok', 'error')),
  error text,
  created_by uuid,
  created_by_name text,
  table_counts jsonb not null default '{}'::jsonb,
  row_total integer not null default 0,
  size_bytes bigint not null default 0,
  data jsonb,
  email_status text check (email_status in ('pending', 'sending', 'sent', 'error')),
  email_to text[],
  email_error text,
  emailed_at timestamptz
);
comment on table public.data_backups is 'Bản sao lưu dữ liệu: ảnh chụp toàn bộ các bảng (data = {tên bảng: [dòng...]}), tải về thành Excel';
create index if not exists data_backups_created_idx on public.data_backups (created_at desc);

alter table public.data_backups enable row level security;
drop policy if exists data_backups_select on public.data_backups;
create policy data_backups_select on public.data_backups for select to authenticated using ((select private.has_perm('backups.view')));
revoke all on public.data_backups from anon, authenticated;
grant select on public.data_backups to authenticated;

-- 4. Các bảng được sao lưu: mọi bảng dữ liệu trong public trừ danh sách loại trừ (bảng mới thêm sau tự được sao lưu)
create or replace function private.backup_table_names()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.relname::text order by c.relname), '{}')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
    and c.relname not in ('data_backups', 'audit_logs', 'notifications', 'chat_messages', 'chat_members', 'chat_rooms',
                          'shipment_edit_locks', 'table_view_preferences');
$$;

-- 5. Tạo một bản sao lưu (dùng chung cho tự động và "Sao lưu ngay")
create or replace function private.make_data_backup(p_kind text, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_data jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_rows jsonb;
  v_total integer := 0;
  v_t text;
  v_name text;
  v_keep integer;
  v_err text;
begin
  -- Không chạy hai bản sao lưu cùng lúc
  perform pg_advisory_xact_lock(hashtext('khanh_ha_data_backup'));
  select full_name into v_name from public.profiles where id = p_user;

  begin
    foreach v_t in array private.backup_table_names() loop
      execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_t) into v_rows;
      v_data := v_data || jsonb_build_object(v_t, v_rows);
      v_counts := v_counts || jsonb_build_object(v_t, jsonb_array_length(v_rows));
      v_total := v_total + jsonb_array_length(v_rows);
    end loop;
    -- Thêm danh sách chuyến dạng dễ đọc (tên khách, xe, tài xế, tuyến ... đã ghép sẵn)
    if to_regclass('public.shipment_list') is not null then
      execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.shipment_list t' into v_rows;
      v_data := v_data || jsonb_build_object('_shipment_list', v_rows);
      v_counts := v_counts || jsonb_build_object('_shipment_list', jsonb_array_length(v_rows));
    end if;

    insert into public.data_backups (kind, status, created_by, created_by_name, table_counts, row_total, data)
    values (p_kind, 'ok', p_user, v_name, v_counts, v_total, v_data)
    returning id into v_id;
    update public.data_backups set size_bytes = pg_column_size(data) where id = v_id;
  exception when others then
    v_err := sqlerrm;
    insert into public.data_backups (kind, status, error, created_by, created_by_name)
    values (p_kind, 'error', left(v_err, 1000), p_user, v_name)
    returning id into v_id;
    perform private.notify_permission_holders('backups.configure', 'backup_failed', 'Sao lưu dữ liệu bị lỗi',
      left(v_err, 300), 'data_backup', v_id, '/sao-luu');
  end;

  -- Xóa bản cũ hơn số ngày giữ, luôn chừa 3 bản thành công gần nhất
  select coalesce((value #>> '{}')::integer, 30) into v_keep from public.system_settings where key = 'backup.keep_days';
  delete from public.data_backups b
  where b.created_at < now() - make_interval(days => greatest(coalesce(v_keep, 30), 1))
    and b.id not in (select x.id from public.data_backups x where x.status = 'ok' order by x.created_at desc limit 3);

  return v_id;
end;
$$;
revoke all on function private.make_data_backup(text, uuid) from public, anon, authenticated;

-- 5b. Gửi email sau khi sao lưu
create table if not exists private.backup_email_jobs (
  id uuid primary key default gen_random_uuid(),
  backup_id uuid not null references public.data_backups (id) on delete cascade,
  token text not null unique,
  recipients text[] not null,
  created_at timestamptz not null default now(),
  picked_at timestamptz,
  finished_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'error')),
  error text
);
revoke all on private.backup_email_jobs from public, anon, authenticated;

-- Kỳ gửi email: tháng hiện tại; từ ngày 1 đến ngày 15 kèm thêm tháng trước (ngày 15 là chốt tháng trước)
create or replace function private.backup_email_period_start(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $$
  select case when extract(day from (p_at at time zone 'Asia/Ho_Chi_Minh')) <= 15
    then (date_trunc('month', p_at at time zone 'Asia/Ho_Chi_Minh') - interval '1 month')::date
    else date_trunc('month', p_at at time zone 'Asia/Ho_Chi_Minh')::date end;
$$;

-- Tạo việc gửi email cho một bản sao lưu; p_call_http = CSDL tự gọi ứng dụng (pg_net) để gửi.
-- Trả về mã dùng một lần (null = không gửi: bản lỗi hoặc chưa nhập email).
create or replace function private.queue_backup_email(p_backup uuid, p_call_http boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_emails text[];
  v_url text;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if p_backup is null or not exists (select 1 from public.data_backups where id = p_backup and status = 'ok') then
    return null;
  end if;
  select coalesce(array_agg(e), '{}') into v_emails
  from public.system_settings s, jsonb_array_elements_text(s.value) e where s.key = 'backup.emails' and jsonb_typeof(s.value) = 'array';
  if cardinality(v_emails) = 0 then
    return null;
  end if;
  insert into private.backup_email_jobs (backup_id, token, recipients) values (p_backup, v_token, v_emails);
  update public.data_backups set email_status = 'pending', email_to = v_emails, email_error = null where id = p_backup;
  if p_call_http then
    select value #>> '{}' into v_url from public.system_settings where key = 'backup.app_url';
    if to_regnamespace('net') is null or coalesce(v_url, '') = '' then
      update public.data_backups set email_status = 'error', email_error = 'CSDL chưa bật pg_net hoặc chưa có địa chỉ ứng dụng' where id = p_backup;
    else
      -- pg_net gửi sau khi giao dịch hoàn tất nên ứng dụng luôn thấy việc gửi email này
      execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 120000)'
        using rtrim(v_url, '/') || '/api/sao-luu/gui-email', jsonb_build_object('token', v_token), '{"Content-Type": "application/json"}'::jsonb;
    end if;
  end if;
  return v_token;
end;
$$;
revoke all on function private.queue_backup_email(uuid, boolean) from public, anon, authenticated;

-- Ứng dụng đổi mã lấy dữ liệu kỳ gửi email (mã dùng một lần, hết hạn sau 30 phút)
create or replace function public.backup_email_payload(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.backup_email_jobs%rowtype;
  v_b public.data_backups%rowtype;
  v_from date;
  v_from_ts timestamptz;
  v_ship jsonb;
  v_ids jsonb;
  v_sheets jsonb := '{}'::jsonb;
  v_t text;
begin
  update private.backup_email_jobs set status = 'sending', picked_at = now()
  where token = p_token and status = 'pending' and created_at > now() - interval '30 minutes'
  returning * into v_job;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Mã gửi email không hợp lệ hoặc đã dùng');
  end if;
  select * into v_b from public.data_backups where id = v_job.backup_id;
  update public.data_backups set email_status = 'sending' where id = v_b.id;
  v_from := private.backup_email_period_start(v_b.created_at);
  v_from_ts := v_from::timestamp at time zone 'Asia/Ho_Chi_Minh';

  -- Chuyến trong kỳ: theo ngày lấy hàng (chưa có thì ngày tạo)
  select coalesce(jsonb_agg(e), '[]'::jsonb) into v_ship from jsonb_array_elements(coalesce(v_b.data -> 'shipments', '[]')) e
  where coalesce(e ->> 'pickup_at', e ->> 'created_at')::timestamptz >= v_from_ts;
  select coalesce(jsonb_agg(e -> 'id'), '[]'::jsonb) into v_ids from jsonb_array_elements(v_ship) e;

  v_sheets := jsonb_build_object(
    '_shipment_list', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(coalesce(v_b.data -> '_shipment_list', '[]')) e
                       where coalesce(e ->> 'pickup_at', e ->> 'created_at')::timestamptz >= v_from_ts),
    'transport_orders', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(coalesce(v_b.data -> 'transport_orders', '[]')) e
                       where coalesce((e ->> 'order_date')::date, ((e ->> 'created_at')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date) >= v_from),
    'shipments', v_ship);
  -- Bảng theo chuyến: chỉ dòng của các chuyến trong kỳ
  foreach v_t in array array['shipment_fees', 'shipment_carrier_costs', 'shipment_items'] loop
    v_sheets := v_sheets || jsonb_build_object(v_t, (select coalesce(jsonb_agg(e), '[]'::jsonb)
      from jsonb_array_elements(coalesce(v_b.data -> v_t, '[]')) e where v_ids @> jsonb_build_array(e -> 'shipment_id')));
  end loop;
  v_sheets := v_sheets || jsonb_build_object(
    'shipment_expenses', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(coalesce(v_b.data -> 'shipment_expenses', '[]')) e
                       where coalesce(e ->> 'incurred_at', e ->> 'created_at')::timestamptz >= v_from_ts or v_ids @> jsonb_build_array(e -> 'shipment_id')),
    'advance_requests', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(coalesce(v_b.data -> 'advance_requests', '[]')) e
                       where (e ->> 'created_at')::timestamptz >= v_from_ts),
    'receivables', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(coalesce(v_b.data -> 'receivables', '[]')) e
                       where coalesce((e ->> 'issued_date')::date, ((e ->> 'created_at')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date) >= v_from),
    'payables', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(coalesce(v_b.data -> 'payables', '[]')) e
                       where coalesce((e ->> 'issued_date')::date, ((e ->> 'created_at')::timestamptz at time zone 'Asia/Ho_Chi_Minh')::date) >= v_from),
    'payments', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(coalesce(v_b.data -> 'payments', '[]')) e
                       where coalesce(e ->> 'paid_at', e ->> 'created_at')::timestamptz >= v_from_ts),
    'purchase_requests', (select coalesce(jsonb_agg(e), '[]'::jsonb) from jsonb_array_elements(coalesce(v_b.data -> 'purchase_requests', '[]')) e
                       where (e ->> 'created_at')::timestamptz >= v_from_ts));

  return jsonb_build_object('ok', true, 'backup_id', v_b.id, 'created_at', v_b.created_at, 'kind', v_b.kind,
    'period_from', v_from, 'recipients', to_jsonb(v_job.recipients), 'sheets', v_sheets);
end;
$$;
revoke all on function public.backup_email_payload(text) from public;
grant execute on function public.backup_email_payload(text) to anon, authenticated;

-- Ứng dụng báo kết quả gửi email
create or replace function public.backup_email_report(p_token text, p_ok boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job private.backup_email_jobs%rowtype;
begin
  update private.backup_email_jobs set status = case when p_ok then 'sent' else 'error' end, finished_at = now(), error = left(p_error, 1000)
  where token = p_token and status = 'sending'
  returning * into v_job;
  if not found then
    return;
  end if;
  update public.data_backups
     set email_status = case when p_ok then 'sent' else 'error' end, email_error = case when p_ok then null else left(p_error, 1000) end,
         emailed_at = case when p_ok then now() else emailed_at end
   where id = v_job.backup_id;
  if not p_ok then
    perform private.notify_permission_holders('backups.configure', 'backup_email_failed', 'Gửi email sao lưu bị lỗi',
      left(coalesce(p_error, ''), 300), 'data_backup', v_job.backup_id, '/sao-luu');
  end if;
end;
$$;
revoke all on function public.backup_email_report(text, boolean, text) from public;
grant execute on function public.backup_email_report(text, boolean, text) to anon, authenticated;

-- 6. Hẹn giờ: pg_cron gọi hàm này 10 phút một lần
create or replace function public.backup_tick()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamp := now() at time zone 'Asia/Ho_Chi_Minh';
  v_hour integer := extract(hour from v_now)::integer;
  v_enabled boolean;
  v_hours jsonb;
begin
  select coalesce((value #>> '{}')::boolean, true) into v_enabled from public.system_settings where key = 'backup.enabled';
  select value into v_hours from public.system_settings where key = 'backup.hours';
  if not coalesce(v_enabled, true) then
    return 'tắt';
  end if;
  if not exists (select 1 from jsonb_array_elements_text(coalesce(v_hours, '[]'::jsonb)) h where h::integer = v_hour) then
    return 'chưa đến giờ';
  end if;
  if exists (
    select 1 from public.data_backups
    where kind = 'auto' and status = 'ok'
      and date_trunc('hour', created_at at time zone 'Asia/Ho_Chi_Minh') = date_trunc('hour', v_now)
  ) then
    return 'đã sao lưu giờ này';
  end if;
  if (select count(*) from public.data_backups
      where kind = 'auto' and status = 'error'
        and date_trunc('hour', created_at at time zone 'Asia/Ho_Chi_Minh') = date_trunc('hour', v_now)) >= 3 then
    return 'lỗi 3 lần trong giờ này, chờ giờ sau';
  end if;
  perform private.queue_backup_email(private.make_data_backup('auto', null), true);
  return 'đã sao lưu';
end;
$$;
revoke all on function public.backup_tick() from public, anon, authenticated;

-- 7. Nút "Sao lưu ngay"
create or replace function public.create_data_backup(p_send_email boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text;
  v_error text;
  v_token text;
begin
  if not private.has_perm('backups.create') then
    raise exception 'Bạn không có quyền sao lưu dữ liệu' using errcode = '42501';
  end if;
  if exists (select 1 from public.data_backups where kind = 'manual' and created_at > now() - interval '1 minute') then
    raise exception 'Vừa có bản sao lưu cách đây chưa đến 1 phút, vui lòng đợi rồi bấm lại' using errcode = '22023';
  end if;
  v_id := private.make_data_backup('manual', auth.uid());
  select status, error into v_status, v_error from public.data_backups where id = v_id;
  -- Gửi email ngay: ứng dụng nhận mã dùng một lần và tự gửi (không cần CSDL gọi ra ngoài)
  if coalesce(p_send_email, false) and v_status = 'ok' then
    v_token := private.queue_backup_email(v_id, false);
  end if;
  return jsonb_build_object('id', v_id, 'status', v_status, 'error', v_error, 'email_token', v_token);
end;
$$;
revoke all on function public.create_data_backup(boolean) from public, anon;
grant execute on function public.create_data_backup(boolean) to authenticated;

-- 8. Xem / lưu cấu hình sao lưu
create or replace function public.backup_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cron boolean := false;
begin
  if not private.has_perm('backups.view') then
    raise exception 'Bạn không có quyền xem sao lưu dữ liệu' using errcode = '42501';
  end if;
  if to_regclass('cron.job') is not null then
    execute 'select exists (select 1 from cron.job where jobname = ''khanh-ha-sao-luu'' and active)' into v_cron;
  end if;
  return jsonb_build_object(
    'enabled', coalesce((select (value #>> '{}')::boolean from public.system_settings where key = 'backup.enabled'), true),
    'hours', coalesce((select value from public.system_settings where key = 'backup.hours'), '[]'::jsonb),
    'keep_days', coalesce((select (value #>> '{}')::integer from public.system_settings where key = 'backup.keep_days'), 30),
    'scheduler_ok', v_cron,
    'emails', coalesce((select value from public.system_settings where key = 'backup.emails'), '[]'::jsonb),
    'total_bytes', coalesce((select sum(size_bytes) from public.data_backups), 0),
    'tables', to_jsonb(private.backup_table_names())
  );
end;
$$;
revoke all on function public.backup_overview() from public, anon;
grant execute on function public.backup_overview() to authenticated;

create or replace function public.set_backup_settings(p_enabled boolean, p_hours integer[], p_keep_days integer, p_emails text[] default '{}')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours integer[];
  v_emails text[];
begin
  if not private.has_perm('backups.configure') then
    raise exception 'Bạn không có quyền cấu hình sao lưu dữ liệu' using errcode = '42501';
  end if;
  select coalesce(array_agg(distinct h order by h), '{}') into v_hours from unnest(coalesce(p_hours, '{}')) h;
  if exists (select 1 from unnest(v_hours) h where h < 0 or h > 23) then
    raise exception 'Giờ sao lưu phải từ 0 đến 23' using errcode = '22023';
  end if;
  if coalesce(p_enabled, false) and cardinality(v_hours) = 0 then
    raise exception 'Chọn ít nhất một giờ sao lưu (hoặc tắt tự động sao lưu)' using errcode = '22023';
  end if;
  if p_keep_days is null or p_keep_days < 1 or p_keep_days > 365 then
    raise exception 'Số ngày giữ bản sao lưu phải từ 1 đến 365' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct lower(btrim(e)) order by lower(btrim(e))), '{}') into v_emails
  from unnest(coalesce(p_emails, '{}')) e where btrim(e) <> '';
  if exists (select 1 from unnest(v_emails) e where e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$') then
    raise exception 'Email không hợp lệ: %', (select string_agg(e, ', ') from unnest(v_emails) e where e !~ '^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$') using errcode = '22023';
  end if;
  if cardinality(v_emails) > 20 then
    raise exception 'Tối đa 20 email nhận' using errcode = '22023';
  end if;
  insert into public.system_settings (key, value, description, updated_by, updated_at) values
    ('backup.emails', to_jsonb(v_emails), 'Email nhận tệp Excel sau mỗi lần tự sao lưu', auth.uid(), now()),
    ('backup.enabled', to_jsonb(coalesce(p_enabled, false)), 'Tự động sao lưu dữ liệu theo giờ', auth.uid(), now()),
    ('backup.hours', to_jsonb(v_hours), 'Các giờ tự sao lưu mỗi ngày (giờ Việt Nam, 0-23)', auth.uid(), now()),
    ('backup.keep_days', to_jsonb(p_keep_days), 'Số ngày giữ bản sao lưu (cũ hơn tự xóa)', auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;
revoke all on function public.set_backup_settings(boolean, integer[], integer, text[]) from public, anon;
grant execute on function public.set_backup_settings(boolean, integer[], integer, text[]) to authenticated;

-- 9. Bật pg_cron và hẹn lịch (Supabase có sẵn pg_cron; CSDL thử nghiệm không có thì bỏ qua)
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from pg_available_extensions where name = 'pg_net') then
      create extension if not exists pg_net;
    end if;
    execute $q$select cron.schedule('khanh-ha-sao-luu', '*/10 * * * *', 'select public.backup_tick()')$q$;
  else
    raise notice 'Không có pg_cron: bỏ qua hẹn giờ sao lưu (CSDL thử nghiệm)';
  end if;
end $$;

commit;
