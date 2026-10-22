-- =============================================================================
-- KHÁNH HÀ TMS – CÀI ĐẶT CƠ SỞ DỮ LIỆU LẦN ĐẦU
-- Dán toàn bộ tệp vào Supabase → SQL Editor → Run. Chỉ chạy MỘT LẦN trên dự án mới.
-- Không chứa dữ liệu mẫu. Tệp được ghép tự động từ supabase/migrations/ – không sửa tay.
-- =============================================================================
begin;

-- >>> 20261016000001_foundation.sql
-- =============================================================================
-- GHA TMS - 0001: Nền tảng (schema, extension, hàm tiện ích)
-- =============================================================================
-- Quy ước:
--   * Bảng nghiệp vụ nằm ở schema public (được PostgREST/Supabase API phục vụ, luôn bật RLS).
--   * Hàm nội bộ dùng trong RLS/trigger nằm ở schema private (không được API phục vụ).
--   * Tiền tệ: numeric(18,2) theo VND. Thời gian: timestamptz (hiển thị Asia/Ho_Chi_Minh).
--   * Không xóa cứng dữ liệu đã phát sinh giao dịch: dùng status / archived_at.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Cập nhật updated_at tự động
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Ghi created_by / updated_by theo người dùng hiện tại (nếu có)
create or replace function private.set_actor_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- Gắn trigger updated_at + actor cho một bảng có các cột created_by, updated_by, updated_at
create or replace function private.attach_standard_triggers(tbl regclass)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text := tbl::text;
  n text := replace(replace(tbl::text, 'public.', ''), '"', '');
begin
  execute format('create trigger trg_%s_updated_at before update on %s for each row execute function private.set_updated_at()', n, t);
  execute format('create trigger trg_%s_actor before insert or update on %s for each row execute function private.set_actor_columns()', n, t);
end;
$$;

-- Bộ đếm mã chứng từ theo ngày, an toàn khi nhiều người cùng tạo (một câu lệnh, khóa dòng)
create table public.code_sequences (
  scope text not null,
  period text not null,
  last_value integer not null default 0,
  primary key (scope, period)
);
alter table public.code_sequences enable row level security;
-- Không có policy: chỉ hàm security definer mới truy cập được.

-- Sinh mã dạng PREFIX-YYYYMMDD-0001 theo ngày giờ Việt Nam
create or replace function private.next_code(prefix text, at_time timestamptz default now())
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  d text := to_char(at_time at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDD');
  v integer;
begin
  insert into public.code_sequences as cs (scope, period, last_value)
  values (prefix, d, 1)
  on conflict (scope, period) do update set last_value = cs.last_value + 1
  returning last_value into v;
  return prefix || '-' || d || '-' || lpad(v::text, greatest(4, length(v::text)), '0');
end;
$$;
revoke all on function private.next_code(text, timestamptz) from public;
grant execute on function private.next_code(text, timestamptz) to authenticated, service_role;

-- >>> 20261016000002_rbac.sql
-- =============================================================================
-- GHA TMS - 0002: Người dùng, vai trò, quyền (RBAC) và lời mời truy cập
-- =============================================================================
-- Nguyên tắc:
--   * Đăng nhập Google qua Supabase Auth chỉ tạo hồ sơ ở trạng thái "pending".
--     Chỉ email đã được quản trị viên mời (user_invitations) mới được kích hoạt.
--   * Quyền = hợp của quyền theo vai trò + quyền cấp riêng (grant), trừ quyền bị chặn riêng (deny).
--   * Vai trò super_admin có toàn quyền; chỉ super_admin mới cấp/thu hồi được super_admin.
--   * Không ai tự thay đổi vai trò, quyền hay trạng thái của chính mình.
-- =============================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique check (email = lower(email)),
  full_name text,
  avatar_url text,
  phone text,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
comment on table public.profiles is 'Hồ sơ người dùng (1-1 với auth.users).';

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  module text not null,
  action text not null,
  name text not null,
  description text,
  sort_order integer not null default 0
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_code)
);

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create table public.user_permission_overrides (
  user_id uuid not null references public.profiles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  effect text not null check (effect in ('grant', 'deny')),
  reason text,
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (user_id, permission_code)
);

create table public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and email like '%@%'),
  role_codes text[] not null default '{}',
  driver_id uuid, -- FK thêm ở migration danh mục
  note text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references public.profiles (id),
  accepted_user_id uuid references public.profiles (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create unique index user_invitations_pending_email_uq on public.user_invitations (email) where status = 'pending';

select private.attach_standard_triggers('public.profiles');
select private.attach_standard_triggers('public.roles');
select private.attach_standard_triggers('public.user_invitations');

create index user_roles_role_idx on public.user_roles (role_id);
create index role_permissions_perm_idx on public.role_permissions (permission_code);

-- -----------------------------------------------------------------------------
-- Hàm kiểm tra quyền (dùng trong RLS, trigger và server)
-- -----------------------------------------------------------------------------
create or replace function private.is_system_op()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is null or coalesce(current_setting('gha.system_op', true), '') = 'on';
$$;
grant execute on function private.is_system_op() to authenticated, service_role;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active');
$$;

create or replace function private.is_super_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = uid and r.code = 'super_admin' and p.status = 'active'
  );
$$;

create or replace function private.has_perm(perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_active_user() and (
    private.is_super_admin()
    or (
      not exists (
        select 1 from public.user_permission_overrides o
        where o.user_id = auth.uid() and o.permission_code = perm and o.effect = 'deny'
      )
      and (
        exists (
          select 1 from public.user_permission_overrides o
          where o.user_id = auth.uid() and o.permission_code = perm and o.effect = 'grant'
        )
        or exists (
          select 1
          from public.user_roles ur
          join public.role_permissions rp on rp.role_id = ur.role_id
          where ur.user_id = auth.uid() and rp.permission_code = perm
        )
      )
    )
  );
$$;

grant execute on function private.is_active_user() to authenticated, service_role;
grant execute on function private.is_super_admin(uuid) to authenticated, service_role;
grant execute on function private.has_perm(text) to authenticated, service_role;

-- RPC cho giao diện: danh sách quyền hiệu lực của chính người gọi
create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select p.code from public.permissions p
  where private.has_perm(p.code)
  order by p.code;
$$;
revoke all on function public.my_permissions() from public, anon;
grant execute on function public.my_permissions() to authenticated;

-- -----------------------------------------------------------------------------
-- Lời mời: kích hoạt người dùng theo email đã được cho phép
-- -----------------------------------------------------------------------------
create or replace function private.apply_invitation(inv_id uuid, uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.user_invitations;
begin
  select * into inv from public.user_invitations where id = inv_id and status = 'pending' for update;
  if not found then
    return;
  end if;

  -- Đánh dấu thao tác hệ thống để trigger bảo vệ cho phép (chỉ trong phạm vi hàm này)
  perform set_config('gha.system_op', 'on', true);

  insert into public.user_roles (user_id, role_id, granted_by)
  select uid, r.id, inv.invited_by from public.roles r where r.code = any (inv.role_codes)
  on conflict do nothing;

  update public.profiles set status = 'active' where id = uid and status = 'pending';

  if inv.driver_id is not null then
    update public.drivers set profile_id = uid where id = inv.driver_id and profile_id is null;
  end if;

  update public.user_invitations
     set status = 'accepted', accepted_user_id = uid, accepted_at = now()
   where id = inv.id;

  perform set_config('gha.system_op', '', true);
end;
$$;

-- Trigger trên auth.users: tạo hồ sơ khi người dùng đăng nhập lần đầu
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv_id uuid;
  em text := lower(coalesce(new.email, ''));
begin
  if em = '' then
    return new;
  end if;

  insert into public.profiles (id, email, full_name, avatar_url, status)
  values (
    new.id,
    em,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    'pending'
  )
  on conflict (id) do nothing;

  select id into inv_id from public.user_invitations where email = em and status = 'pending' limit 1;
  if inv_id is not null then
    perform private.apply_invitation(inv_id, new.id);
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, new_data)
  values (new.id, 'auth.first_sign_in', 'profiles', new.id::text,
          jsonb_build_object('email', em, 'invited', inv_id is not null));
  return new;
end;
$$;

-- RPC: mời / cấp quyền truy cập cho một email (dùng từ màn hình Người dùng và phân quyền)
create or replace function public.invite_user(p_email text, p_role_codes text[], p_driver_id uuid default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  em text := lower(trim(p_email));
  existing_uid uuid;
  inv_id uuid;
begin
  if not private.has_perm('users.create') then
    raise exception 'Bạn không có quyền mời người dùng' using errcode = '42501';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Email không hợp lệ' using errcode = '22023';
  end if;
  if coalesce(array_length(p_role_codes, 1), 0) = 0 then
    raise exception 'Phải chọn ít nhất một vai trò' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_role_codes) c where c not in (select code from public.roles)) then
    raise exception 'Vai trò không tồn tại' using errcode = '22023';
  end if;
  if 'super_admin' = any (p_role_codes) and not private.is_super_admin() then
    raise exception 'Chỉ Super Admin mới cấp được vai trò Super Admin' using errcode = '42501';
  end if;

  update public.user_invitations set status = 'revoked' where email = em and status = 'pending';

  insert into public.user_invitations (email, role_codes, driver_id, note, invited_by)
  values (em, p_role_codes, p_driver_id, p_note, auth.uid())
  returning id into inv_id;

  select id into existing_uid from public.profiles where email = em;
  if existing_uid is not null then
    if existing_uid = auth.uid() then
      raise exception 'Không được tự cấp quyền cho chính mình' using errcode = '42501';
    end if;
    perform private.apply_invitation(inv_id, existing_uid);
  end if;
  return inv_id;
end;
$$;
revoke all on function public.invite_user(text, text[], uuid, text) from public, anon;
grant execute on function public.invite_user(text, text[], uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Chống leo thang đặc quyền
-- -----------------------------------------------------------------------------
create or replace function private.guard_user_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.user_id, old.user_id);
  rid uuid := coalesce(new.role_id, old.role_id);
begin
  if private.is_system_op() then
    return coalesce(new, old); -- thao tác hệ thống (SQL editor / service role / hàm nội bộ)
  end if;
  if target = auth.uid() then
    raise exception 'Không được tự thay đổi vai trò của chính mình' using errcode = '42501';
  end if;
  if (select code from public.roles where id = rid) = 'super_admin' and not private.is_super_admin() then
    raise exception 'Chỉ Super Admin mới cấp/thu hồi được vai trò Super Admin' using errcode = '42501';
  end if;
  if private.is_super_admin(target) and not private.is_super_admin() then
    raise exception 'Không được thay đổi vai trò của Super Admin' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.granted_by := auth.uid();
    new.granted_at := now();
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_user_roles_guard before insert or update or delete on public.user_roles
for each row execute function private.guard_user_roles();

create or replace function private.guard_permission_overrides()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.user_id, old.user_id);
begin
  if private.is_system_op() then
    return coalesce(new, old);
  end if;
  if target = auth.uid() then
    raise exception 'Không được tự thay đổi quyền của chính mình' using errcode = '42501';
  end if;
  if private.is_super_admin(target) and not private.is_super_admin() then
    raise exception 'Không được thay đổi quyền của Super Admin' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    new.granted_by := auth.uid();
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_user_perm_overrides_guard before insert or update or delete on public.user_permission_overrides
for each row execute function private.guard_permission_overrides();

create or replace function private.guard_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_system_op() then
    return new;
  end if;
  if new.id <> old.id or new.email <> old.email then
    raise exception 'Không được đổi mã hoặc email người dùng' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.id = auth.uid() then
      raise exception 'Không được tự đổi trạng thái tài khoản của chính mình' using errcode = '42501';
    end if;
    if not private.has_perm('users.update') then
      raise exception 'Bạn không có quyền đổi trạng thái tài khoản' using errcode = '42501';
    end if;
    if private.is_super_admin(new.id) and not private.is_super_admin() then
      raise exception 'Không được đổi trạng thái của Super Admin' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_profiles_guard before update on public.profiles
for each row execute function private.guard_profiles();

create or replace function private.guard_system_roles()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.is_system then
    raise exception 'Không được xóa vai trò hệ thống' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.is_system and new.code <> old.code then
    raise exception 'Không được đổi mã vai trò hệ thống' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_roles_guard before update or delete on public.roles
for each row execute function private.guard_system_roles();

-- Chỉ Super Admin được sửa quyền của vai trò super_admin / admin
create or replace function private.guard_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (select code from public.roles where id = coalesce(new.role_id, old.role_id)) in ('super_admin', 'admin')
     and not private.is_super_admin() then
    raise exception 'Chỉ Super Admin được sửa quyền của vai trò Admin' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger trg_role_permissions_guard before insert or update or delete on public.role_permissions
for each row execute function private.guard_role_permissions();

-- -----------------------------------------------------------------------------
-- Dữ liệu tham chiếu bắt buộc (vai trò & quyền) - cần có ở mọi môi trường
-- -----------------------------------------------------------------------------
insert into public.roles (code, name, description, is_system, sort_order) values
  ('super_admin', 'Super Admin', 'Toàn quyền hệ thống, quản lý Admin', true, 1),
  ('admin', 'Admin', 'Quản trị hệ thống và dữ liệu', true, 2),
  ('director', 'Giám đốc', 'Xem toàn bộ, phê duyệt', true, 3),
  ('dispatcher', 'Điều phối', 'Tạo đơn, phân công chuyến', true, 4),
  ('accountant', 'Kế toán', 'Chi phí, ứng tiền, quyết toán, công nợ, thanh toán', true, 5),
  ('ops_manager', 'Quản lý vận hành', 'Quản lý xe, tài xế, chuyến, duyệt vận hành', true, 6),
  ('driver', 'Tài xế', 'Ứng dụng tài xế: chỉ chuyến được phân công', true, 7),
  ('report_viewer', 'Người chỉ xem báo cáo', 'Chỉ xem dashboard và báo cáo', true, 8);

with modules (module, module_name, actions, ord) as (
  values
    ('dashboard', 'Tổng quan', array['view'], 1),
    ('dispatch', 'Điều phối', array['view', 'create', 'update', 'delete'], 2),
    ('shipments', 'Chuyến xe', array['view', 'create', 'update', 'delete', 'export'], 3),
    ('drivers', 'Tài xế', array['view', 'create', 'update', 'delete', 'export', 'view_sensitive'], 4),
    ('vehicles', 'Phương tiện', array['view', 'create', 'update', 'delete', 'export', 'view_sensitive'], 5),
    ('customers', 'Khách hàng', array['view', 'create', 'update', 'delete', 'export'], 6),
    ('locations', 'Địa điểm', array['view', 'create', 'update', 'delete', 'export'], 7),
    ('price_lists', 'Bảng giá', array['view', 'create', 'update', 'delete', 'export'], 8),
    ('expenses', 'Chi phí chuyến', array['view', 'create', 'update', 'delete', 'approve', 'export'], 9),
    ('advances', 'Ứng tiền', array['view', 'create', 'update', 'delete', 'approve', 'pay', 'export'], 10),
    ('settlements', 'Quyết toán', array['view', 'update', 'approve', 'export'], 11),
    ('receivables', 'Công nợ', array['view', 'create', 'update', 'delete', 'pay', 'export'], 12),
    ('payments', 'Thanh toán', array['view', 'create', 'delete', 'export'], 13),
    ('approvals', 'Phê duyệt', array['view', 'approve', 'configure'], 14),
    ('reports', 'Báo cáo', array['view', 'export'], 15),
    ('catalogs', 'Danh mục hệ thống', array['view', 'create', 'update', 'delete'], 16),
    ('fields', 'Trường dữ liệu', array['view', 'configure'], 17),
    ('forms', 'Biểu mẫu', array['view', 'configure'], 18),
    ('workflows', 'Quy trình', array['view', 'configure'], 19),
    ('users', 'Người dùng và phân quyền', array['view', 'create', 'update', 'configure'], 20),
    ('audit_logs', 'Nhật ký hệ thống', array['view', 'export'], 21),
    ('settings', 'Cấu hình', array['view', 'configure'], 22),
    ('documents', 'Chứng từ', array['view', 'create', 'delete', 'view_sensitive'], 23),
    ('driver_app', 'Ứng dụng tài xế', array['use'], 24)
),
action_names (action, action_name, ord) as (
  values ('view', 'Xem', 1), ('create', 'Tạo', 2), ('update', 'Sửa', 3), ('delete', 'Xóa/Hủy', 4),
         ('approve', 'Duyệt', 5), ('pay', 'Thanh toán', 6), ('export', 'Xuất dữ liệu', 7),
         ('configure', 'Cấu hình', 8), ('view_sensitive', 'Xem trường nhạy cảm', 9), ('use', 'Sử dụng', 10)
)
insert into public.permissions (code, module, action, name, sort_order)
select m.module || '.' || a.action, m.module, a.action, a.action_name || ' - ' || m.module_name, m.ord * 100 + a.ord
from modules m
cross join lateral unnest(m.actions) as act(action)
join action_names a on a.action = act.action;

-- Gán quyền mặc định cho vai trò (super_admin có toàn quyền ngầm định, không cần gán)
insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on (
  (r.code = 'admin' and p.module <> 'driver_app')
  or (r.code = 'director' and (
        p.action in ('view', 'export', 'approve', 'view_sensitive')
        and p.module not in ('driver_app')
  ))
  or (r.code = 'dispatcher' and p.code = any (array[
        'dashboard.view', 'dispatch.view', 'dispatch.create', 'dispatch.update', 'dispatch.delete',
        'shipments.view', 'shipments.create', 'shipments.update', 'shipments.delete', 'shipments.export',
        'drivers.view', 'vehicles.view', 'customers.view', 'customers.create', 'customers.update',
        'locations.view', 'locations.create', 'locations.update', 'price_lists.view',
        'expenses.view', 'expenses.create', 'advances.view', 'approvals.view',
        'documents.view', 'documents.create', 'catalogs.view', 'reports.view']))
  or (r.code = 'accountant' and p.code = any (array[
        'dashboard.view', 'shipments.view', 'shipments.update', 'shipments.export',
        'drivers.view', 'drivers.view_sensitive', 'vehicles.view', 'vehicles.view_sensitive',
        'customers.view', 'customers.create', 'customers.update', 'customers.export',
        'locations.view', 'price_lists.view', 'price_lists.create', 'price_lists.update', 'price_lists.delete', 'price_lists.export',
        'expenses.view', 'expenses.create', 'expenses.update', 'expenses.delete', 'expenses.approve', 'expenses.export',
        'advances.view', 'advances.create', 'advances.update', 'advances.approve', 'advances.pay', 'advances.export',
        'settlements.view', 'settlements.update', 'settlements.approve', 'settlements.export',
        'receivables.view', 'receivables.create', 'receivables.update', 'receivables.delete', 'receivables.pay', 'receivables.export',
        'payments.view', 'payments.create', 'payments.delete', 'payments.export',
        'approvals.view', 'approvals.approve', 'reports.view', 'reports.export',
        'documents.view', 'documents.create', 'documents.view_sensitive',
        'catalogs.view', 'catalogs.create', 'catalogs.update']))
  or (r.code = 'ops_manager' and p.code = any (array[
        'dashboard.view', 'dispatch.view', 'dispatch.create', 'dispatch.update', 'dispatch.delete',
        'shipments.view', 'shipments.create', 'shipments.update', 'shipments.delete', 'shipments.export',
        'drivers.view', 'drivers.create', 'drivers.update', 'drivers.export',
        'vehicles.view', 'vehicles.create', 'vehicles.update', 'vehicles.export',
        'customers.view', 'locations.view', 'locations.create', 'locations.update', 'price_lists.view',
        'expenses.view', 'expenses.create', 'expenses.approve', 'advances.view', 'advances.approve',
        'approvals.view', 'approvals.approve', 'reports.view', 'reports.export',
        'documents.view', 'documents.create', 'catalogs.view']))
  or (r.code = 'driver' and p.code = any (array['driver_app.use', 'documents.create']))
  or (r.code = 'report_viewer' and p.code = any (array['dashboard.view', 'reports.view', 'reports.export']))
);

-- >>> 20261016000003_master_data.sql
-- =============================================================================
-- GHA TMS - 0003: Danh mục quản lý
-- (đơn vị nội bộ, danh mục chung, ngân hàng, phương tiện, tài xế, khách hàng,
--  nhà cung cấp, địa điểm, tuyến, bảng giá, chi phí, hỗ trợ dầu, lương)
-- =============================================================================

-- Danh mục chung có thể cấu hình (tỉnh/thành, hãng xe, loại hợp đồng, nhóm chi phí...)
create table public.catalogs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  catalog_id uuid not null references public.catalogs (id) on delete restrict,
  code text not null,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (catalog_id, code)
);

-- Đơn vị nội bộ (pháp nhân của doanh nghiệp, dùng cho "Công ty áp dụng" bảng giá, tài khoản)
create table public.company_entities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  tax_code text,
  address text,
  phone text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- Ngân hàng, phương thức thanh toán
create table public.banks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  short_name text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  requires_bank_account boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- Loại xe
create table public.vehicle_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  payload_tons numeric(8,2),
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- Quy tắc tính lương tài xế
create table public.salary_rules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  method text not null check (method in ('fixed', 'per_trip', 'per_km', 'revenue_percent', 'formula')),
  rate numeric(18,4),
  formula text,
  effective_from date not null default current_date,
  effective_to date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (effective_to is null or effective_to >= effective_from),
  check (method <> 'formula' or formula is not null)
);

-- Tài xế
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  full_name text not null,
  date_of_birth date,
  phone text,
  email text,
  address text,
  contract_signed_date date,
  contract_type text,
  start_date date,
  contract_end_date date,
  base_salary numeric(18,2) check (base_salary >= 0),
  per_trip_salary numeric(18,2) check (per_trip_salary >= 0),
  meal_allowance numeric(18,2) check (meal_allowance >= 0),
  other_allowance numeric(18,2) check (other_allowance >= 0),
  salary_rule_id uuid references public.salary_rules (id),
  status text not null default 'active' check (status in ('active', 'on_leave', 'terminated')),
  profile_id uuid unique references public.profiles (id) on delete set null,
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
comment on column public.drivers.profile_id is 'Tài khoản đăng nhập (Google) của tài xế';

-- Thông tin nhạy cảm của tài xế tách bảng riêng để RLS chặn theo quyền view_sensitive
create table public.driver_sensitive (
  driver_id uuid primary key references public.drivers (id) on delete cascade,
  national_id text,
  national_id_issued_date date,
  national_id_issued_place text,
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

alter table public.user_invitations
  add constraint user_invitations_driver_fk foreign key (driver_id) references public.drivers (id) on delete set null;

-- Nhà cung cấp (sửa chữa, nhiên liệu, thuê ngoài...)
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  tax_code text,
  address text,
  contact_name text,
  phone text,
  email text,
  payment_term_days integer check (payment_term_days >= 0),
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- Khách hàng / đơn vị thuê vận chuyển / đơn vị thanh toán - xuất hóa đơn
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  tax_code text,
  billing_address text,
  contact_name text,
  phone text,
  invoice_email text,
  payment_term_days integer check (payment_term_days >= 0),
  credit_limit numeric(18,2) check (credit_limit >= 0),
  is_shipper boolean not null default true,
  is_payer boolean not null default true,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create unique index customers_tax_code_uq on public.customers (tax_code) where tax_code is not null and tax_code <> '';

-- Tài khoản ngân hàng (công ty, tài xế, nhà cung cấp, khách hàng). Không lưu mật khẩu/đăng nhập ngân hàng.
create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('company', 'driver', 'supplier', 'customer')),
  company_entity_id uuid references public.company_entities (id),
  driver_id uuid references public.drivers (id),
  supplier_id uuid references public.suppliers (id),
  customer_id uuid references public.customers (id),
  bank_id uuid not null references public.banks (id),
  account_number text not null,
  account_name text not null,
  branch text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (
    (owner_type = 'company' and company_entity_id is not null and driver_id is null and supplier_id is null and customer_id is null)
    or (owner_type = 'driver' and driver_id is not null and company_entity_id is null and supplier_id is null and customer_id is null)
    or (owner_type = 'supplier' and supplier_id is not null and company_entity_id is null and driver_id is null and customer_id is null)
    or (owner_type = 'customer' and customer_id is not null and company_entity_id is null and driver_id is null and supplier_id is null)
  ),
  unique (bank_id, account_number)
);

-- Phương tiện
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  plate_number text not null,
  vehicle_type_id uuid references public.vehicle_types (id),
  brand text,
  model_year integer check (model_year between 1950 and 2100),
  ownership_type text not null default 'owned' check (ownership_type in ('owned', 'leased', 'lease_purchase')),
  registration_expiry date,
  insurance_expiry date,
  fuel_norm_l_per_100km numeric(6,2) check (fuel_norm_l_per_100km >= 0),
  status text not null default 'active' check (status in ('active', 'maintenance', 'inactive', 'sold')),
  assigned_driver_id uuid references public.drivers (id) on delete set null,
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
comment on column public.vehicles.assigned_driver_id is 'Nguồn duy nhất cho phân công xe-tài xế mặc định; biển số của tài xế lấy qua view driver_vehicle_view';
create unique index vehicles_plate_uq on public.vehicles (upper(regexp_replace(plate_number, '[^A-Za-z0-9]', '', 'g')));
create unique index vehicles_assigned_driver_uq on public.vehicles (assigned_driver_id) where assigned_driver_id is not null and archived_at is null;

-- Thông tin tài chính của xe (giá mua, khấu hao, khoản vay) tách bảng để RLS chặn theo vehicles.view_sensitive
create table public.vehicle_financials (
  vehicle_id uuid primary key references public.vehicles (id) on delete cascade,
  purchase_date date,
  purchase_price numeric(18,2) check (purchase_price >= 0),
  residual_value numeric(18,2) check (residual_value >= 0),
  depreciation_method text not null default 'straight_line' check (depreciation_method in ('straight_line', 'none')),
  depreciation_months integer check (depreciation_months > 0),
  monthly_depreciation numeric(18,2) generated always as (
    case
      when depreciation_method = 'straight_line' and depreciation_months > 0 and purchase_price is not null
        then round((purchase_price - coalesce(residual_value, 0)) / depreciation_months, 0)
      else null
    end
  ) stored,
  lender_bank_id uuid references public.banks (id),
  loan_principal numeric(18,2) check (loan_principal >= 0),
  loan_interest_rate numeric(7,4) check (loan_interest_rate >= 0),
  loan_start_date date,
  loan_end_date date,
  monthly_installment numeric(18,2) check (monthly_installment >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (residual_value is null or purchase_price is null or residual_value <= purchase_price),
  check (loan_end_date is null or loan_start_date is null or loan_end_date >= loan_start_date)
);
comment on column public.vehicle_financials.loan_interest_rate is 'Lãi suất năm (%)';

-- Lịch trả nợ vay xe: dư nợ chỉ được tính từ lịch này, không suy đoán
create table public.loan_schedules (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  installment_no integer not null check (installment_no > 0),
  due_date date not null,
  principal_due numeric(18,2) not null check (principal_due >= 0),
  interest_due numeric(18,2) not null default 0 check (interest_due >= 0),
  paid_principal numeric(18,2) not null default 0 check (paid_principal >= 0),
  paid_interest numeric(18,2) not null default 0 check (paid_interest >= 0),
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (vehicle_id, installment_no)
);

-- Sửa chữa, bảo dưỡng, thay lốp, thay nhớt...
create table public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  record_type text not null check (record_type in ('repair', 'maintenance', 'tire', 'oil', 'inspection', 'other')),
  performed_at date not null,
  odometer_km integer check (odometer_km >= 0),
  description text not null,
  supplier_id uuid references public.suppliers (id),
  amount numeric(18,2) not null default 0 check (amount >= 0),
  next_due_date date,
  next_due_km integer,
  status text not null default 'recorded' check (status in ('recorded', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index maintenance_records_vehicle_idx on public.maintenance_records (vehicle_id, performed_at desc);

-- Địa điểm dùng chung cho nơi nhận / nơi giao
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  company_name text,
  full_address text not null,
  province text,
  billing_address text,
  tax_code text,
  contact_name text,
  phone text,
  email text,
  latitude numeric(9,6) check (latitude between -90 and 90),
  longitude numeric(9,6) check (longitude between -180 and 180),
  google_maps_url text,
  operating_hours text,
  gate_instructions text,
  delivery_notes text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index locations_search_idx on public.locations using gin (to_tsvector('simple', coalesce(code, '') || ' ' || name || ' ' || coalesce(company_name, '') || ' ' || full_address));

-- Tuyến đường
create table public.routes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  pickup_location_id uuid not null references public.locations (id),
  delivery_location_id uuid not null references public.locations (id),
  distance_km numeric(10,2) check (distance_km >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (pickup_location_id, delivery_location_id)
);

-- Bảng giá vận chuyển
create table public.transport_price_lists (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  company_entity_id uuid references public.company_entities (id),
  customer_id uuid references public.customers (id),
  pickup_location_id uuid references public.locations (id),
  delivery_location_id uuid references public.locations (id),
  vehicle_type_id uuid references public.vehicle_types (id),
  unit_price numeric(18,2) not null check (unit_price >= 0),
  pricing_unit text not null default 'trip' check (pricing_unit in ('trip', 'km', 'ton', 'other')),
  pricing_unit_label text,
  fuel_support_rate numeric(6,3) check (fuel_support_rate between 0 and 100),
  reference_distance_km numeric(10,2) check (reference_distance_km >= 0),
  surcharge_amount numeric(18,2) not null default 0 check (surcharge_amount >= 0),
  effective_from date not null,
  effective_to date,
  conditions text,
  priority integer not null default 0,
  status text not null default 'active' check (status in ('draft', 'active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (effective_to is null or effective_to >= effective_from),
  check (pricing_unit <> 'other' or pricing_unit_label is not null),
  -- Không cho hai bảng giá đang hiệu lực có cùng phạm vi, cùng độ ưu tiên và chồng lấn thời gian
  constraint price_list_no_overlap exclude using gist (
    (coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    (coalesce(pickup_location_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    (coalesce(delivery_location_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    (coalesce(vehicle_type_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    (coalesce(company_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    pricing_unit with =,
    priority with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  ) where (status = 'active')
);
create index price_lists_lookup_idx on public.transport_price_lists (customer_id, pickup_location_id, delivery_location_id, vehicle_type_id) where status = 'active';

-- Danh mục chi phí dùng chung
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  group_name text not null,
  report_bucket text not null default 'other' check (report_bucket in (
    'fuel', 'toll', 'loading_yard', 'repair', 'driver', 'outsourcing', 'allocated_overhead', 'depreciation', 'interest', 'other')),
  cost_class text not null default 'direct' check (cost_class in ('direct', 'allocated')),
  allowed_role_codes text[] not null default array['admin', 'accountant', 'dispatcher', 'driver'],
  requires_amount boolean not null default true,
  requires_invoice boolean not null default false,
  requires_image boolean not null default false,
  requires_approval boolean not null default true,
  counts_to_trip_cost boolean not null default true,
  formula text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- Quy tắc hỗ trợ dầu (ưu tiên: chuyến > tuyến/khách hàng > loại xe > mặc định)
create table public.fuel_support_rules (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('default', 'customer', 'route', 'customer_route', 'vehicle_type')),
  customer_id uuid references public.customers (id),
  route_id uuid references public.routes (id),
  vehicle_type_id uuid references public.vehicle_types (id),
  rate_percent numeric(6,3) check (rate_percent between 0 and 100),
  calculation_base text not null default 'freight_revenue' check (calculation_base in ('freight_revenue', 'unit_price', 'total_revenue', 'fuel_norm', 'formula')),
  fuel_norm_l_per_100km numeric(6,2) check (fuel_norm_l_per_100km >= 0),
  reference_fuel_price numeric(18,2) check (reference_fuel_price >= 0),
  formula text,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (effective_to is null or effective_to >= effective_from),
  check (
    (scope_type = 'default' and customer_id is null and route_id is null and vehicle_type_id is null)
    or (scope_type = 'customer' and customer_id is not null and route_id is null and vehicle_type_id is null)
    or (scope_type = 'route' and route_id is not null and customer_id is null and vehicle_type_id is null)
    or (scope_type = 'customer_route' and customer_id is not null and route_id is not null and vehicle_type_id is null)
    or (scope_type = 'vehicle_type' and vehicle_type_id is not null and customer_id is null and route_id is null)
  ),
  check (calculation_base <> 'formula' or formula is not null),
  check (calculation_base = 'fuel_norm' or calculation_base = 'formula' or rate_percent is not null),
  constraint fuel_rule_no_overlap exclude using gist (
    scope_type with =,
    (coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    (coalesce(route_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    (coalesce(vehicle_type_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&
  ) where (is_active)
);

do $$
declare t text;
begin
  foreach t in array array[
    'catalogs', 'catalog_items', 'company_entities', 'banks', 'payment_methods', 'vehicle_types', 'salary_rules',
    'drivers', 'suppliers', 'customers', 'bank_accounts', 'vehicles', 'vehicle_financials', 'loan_schedules', 'maintenance_records',
    'locations', 'routes', 'transport_price_lists', 'expense_categories', 'fuel_support_rules'
  ] loop
    perform private.attach_standard_triggers(('public.' || t)::regclass);
  end loop;
end $$;

create trigger trg_driver_sensitive_updated_at before update on public.driver_sensitive
for each row execute function private.set_updated_at();
create trigger trg_driver_sensitive_actor before insert or update on public.driver_sensitive
for each row execute function private.set_actor_columns();

-- Dư nợ vay xe (chỉ từ lịch trả nợ đã nhập)
create view public.vehicle_loan_summary with (security_invoker = true) as
select
  vf.vehicle_id,
  vf.loan_principal,
  count(ls.id) as installments,
  sum(ls.principal_due) as scheduled_principal,
  sum(ls.paid_principal) as paid_principal,
  -- Chỉ tính dư nợ khi đã có lịch trả nợ; không suy đoán từ lãi suất/thời hạn
  case when count(ls.id) = 0 then null
       else coalesce(vf.loan_principal, sum(ls.principal_due)) - coalesce(sum(ls.paid_principal), 0)
  end as outstanding_principal,
  min(ls.due_date) filter (where ls.paid_principal < ls.principal_due) as next_due_date
from public.vehicle_financials vf
left join public.loan_schedules ls on ls.vehicle_id = vf.vehicle_id
group by vf.vehicle_id, vf.loan_principal;

-- Biển số xe được phân công cho tài xế (suy ra từ vehicles.assigned_driver_id)
create view public.driver_vehicle_view with (security_invoker = true) as
select d.id as driver_id, v.id as vehicle_id, v.plate_number
from public.drivers d
join public.vehicles v on v.assigned_driver_id = d.id and v.archived_at is null;

-- Hàm tiện ích: id tài xế gắn với người dùng hiện tại
create or replace function private.my_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.id from public.drivers d where d.profile_id = auth.uid() and private.is_active_user();
$$;
grant execute on function private.my_driver_id() to authenticated, service_role;

-- Tìm bảng giá phù hợp: trả về các ứng viên, xếp theo độ cụ thể rồi độ ưu tiên.
-- Nếu hai dòng đầu bằng nhau cả hai tiêu chí, giao diện phải bắt người dùng chọn.
create or replace function public.find_price_lists(
  p_customer_id uuid,
  p_pickup_location_id uuid,
  p_delivery_location_id uuid,
  p_vehicle_type_id uuid,
  p_on_date date default (now() at time zone 'Asia/Ho_Chi_Minh')::date
)
returns table (
  id uuid, code text, unit_price numeric, pricing_unit text, pricing_unit_label text,
  fuel_support_rate numeric, surcharge_amount numeric, reference_distance_km numeric,
  specificity integer, priority integer, effective_from date, effective_to date
)
language sql
stable
security invoker
set search_path = ''
as $$
  select pl.id, pl.code, pl.unit_price, pl.pricing_unit, pl.pricing_unit_label,
         pl.fuel_support_rate, pl.surcharge_amount, pl.reference_distance_km,
         ((pl.customer_id is not null)::int * 8 + (pl.pickup_location_id is not null)::int * 2
          + (pl.delivery_location_id is not null)::int * 2 + (pl.vehicle_type_id is not null)::int * 4) as specificity,
         pl.priority, pl.effective_from, pl.effective_to
  from public.transport_price_lists pl
  where pl.status = 'active'
    and p_on_date between pl.effective_from and coalesce(pl.effective_to, 'infinity'::date)
    and (pl.customer_id is null or pl.customer_id = p_customer_id)
    and (pl.pickup_location_id is null or pl.pickup_location_id = p_pickup_location_id)
    and (pl.delivery_location_id is null or pl.delivery_location_id = p_delivery_location_id)
    and (pl.vehicle_type_id is null or pl.vehicle_type_id = p_vehicle_type_id)
  order by specificity desc, pl.priority desc, pl.effective_from desc;
$$;

-- >>> 20261016000004_operations.sql
-- =============================================================================
-- GHA TMS - 0004: Điều phối, đơn hàng, Shipment, phân công, lịch sử trạng thái
-- =============================================================================

create table public.transport_orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  order_date date not null default (now() at time zone 'Asia/Ho_Chi_Minh')::date,
  company_entity_id uuid references public.company_entities (id),
  customer_id uuid not null references public.customers (id),
  payer_customer_id uuid not null references public.customers (id),
  dispatcher_id uuid references public.profiles (id),
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index transport_orders_customer_idx on public.transport_orders (customer_id, order_date desc);

-- Trạng thái chính của Shipment (xem docs/06-trang-thai-shipment.md)
--   draft -> assigned -> accepted -> in_transit -> driver_completed -> closed
--   assigned -> rejected -> assigned (phân công lại)
--   draft/assigned/accepted/rejected/in_transit -> cancelled
create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_code text not null unique,
  order_id uuid not null references public.transport_orders (id) on delete restrict,
  sequence_in_order integer not null default 1,
  pickup_at timestamptz not null,
  expected_delivery_at timestamptz,
  pickup_location_id uuid not null references public.locations (id),
  delivery_location_id uuid not null references public.locations (id),
  route_id uuid references public.routes (id),
  vehicle_type_id uuid references public.vehicle_types (id),
  vehicle_id uuid references public.vehicles (id),
  driver_id uuid references public.drivers (id),

  -- Ảnh chụp giá tại thời điểm tạo chuyến: bảng giá đổi sau này không làm đổi chuyến cũ
  price_list_id uuid references public.transport_price_lists (id),
  unit_price numeric(18,2) not null default 0 check (unit_price >= 0),
  pricing_unit text not null default 'trip' check (pricing_unit in ('trip', 'km', 'ton', 'other')),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  freight_amount numeric(18,2) generated always as (round(unit_price * quantity, 0)) stored,
  surcharge_amount numeric(18,2) not null default 0 check (surcharge_amount >= 0),
  fuel_support_rate numeric(6,3) check (fuel_support_rate between 0 and 100),
  fuel_support_base text check (fuel_support_base in ('freight_revenue', 'unit_price', 'total_revenue', 'fuel_norm', 'formula')),
  fuel_support_amount numeric(18,2) not null default 0 check (fuel_support_amount >= 0),
  fuel_support_rule_id uuid references public.fuel_support_rules (id),
  pricing_snapshot jsonb not null default '{}'::jsonb,

  status text not null default 'draft' check (status in ('draft', 'assigned', 'accepted', 'rejected', 'in_transit', 'driver_completed', 'closed', 'cancelled')),
  document_status text not null default 'missing' check (document_status in ('missing', 'submitted', 'verified', 'rejected')),
  settlement_status text not null default 'unsettled' check (settlement_status in ('unsettled', 'pending_approval', 'settled', 'reopened')),

  -- Hoàn thành chuyến (tài xế nhập)
  arrived_pickup_at timestamptz,
  departed_pickup_at timestamptz,
  arrived_delivery_at timestamptz,
  completed_at timestamptz,
  odometer_start integer check (odometer_start >= 0),
  odometer_end integer check (odometer_end >= 0),
  actual_km numeric(10,2) check (actual_km >= 0),
  delivery_result text check (delivery_result in ('full', 'partial', 'failed')),
  completion_note text,

  cancel_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id),
  notes text,
  custom_fields jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (pickup_location_id <> delivery_location_id),
  check (odometer_end is null or odometer_start is null or odometer_end >= odometer_start),
  check (expected_delivery_at is null or expected_delivery_at >= pickup_at),
  check (status <> 'cancelled' or cancel_reason is not null),
  unique (order_id, sequence_in_order)
);
create index shipments_pickup_idx on public.shipments (pickup_at desc);
create index shipments_driver_idx on public.shipments (driver_id, pickup_at desc);
create index shipments_vehicle_idx on public.shipments (vehicle_id, pickup_at desc);
create index shipments_status_idx on public.shipments (status);
create index shipments_order_idx on public.shipments (order_id);

-- Phân công tài xế: tối đa một phân công còn hiệu lực (pending/accepted) cho mỗi chuyến
create table public.shipment_assignments (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  driver_id uuid not null references public.drivers (id),
  vehicle_id uuid references public.vehicles (id),
  assigned_by uuid references public.profiles (id),
  assigned_at timestamptz not null default now(),
  response text not null default 'pending' check (response in ('pending', 'accepted', 'rejected', 'superseded')),
  responded_at timestamptz,
  reject_reason text,
  check (response <> 'rejected' or (reject_reason is not null and length(trim(reject_reason)) > 0))
);
create unique index shipment_assignments_active_uq on public.shipment_assignments (shipment_id)
  where response in ('pending', 'accepted');
create index shipment_assignments_driver_idx on public.shipment_assignments (driver_id, assigned_at desc);

create table public.shipment_status_history (
  id bigint generated always as identity primary key,
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  status_field text not null default 'status' check (status_field in ('status', 'document_status', 'settlement_status')),
  from_status text,
  to_status text not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  note text
);
create index shipment_status_history_idx on public.shipment_status_history (shipment_id, changed_at);

select private.attach_standard_triggers('public.transport_orders');
select private.attach_standard_triggers('public.shipments');

-- Sinh mã đơn hàng / Shipment khi tạo; không cho đổi sau đó
create or replace function private.shipments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shipment_code is null or new.shipment_code = '' then
    new.shipment_code := private.next_code('SHP', now());
  end if;
  new.status := coalesce(new.status, 'draft');
  return new;
end;
$$;
create trigger trg_shipments_code before insert on public.shipments
for each row execute function private.shipments_before_insert();

create or replace function private.orders_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.order_code is null or new.order_code = '' then
    new.order_code := private.next_code('ORD', now());
  end if;
  return new;
end;
$$;
create trigger trg_orders_code before insert on public.transport_orders
for each row execute function private.orders_before_insert();

-- Ma trận chuyển trạng thái hợp lệ
create or replace function private.shipment_transition_allowed(from_s text, to_s text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select from_s = to_s or (from_s, to_s) in (
    ('draft', 'assigned'), ('draft', 'cancelled'),
    ('assigned', 'accepted'), ('assigned', 'rejected'), ('assigned', 'draft'), ('assigned', 'cancelled'),
    ('rejected', 'assigned'), ('rejected', 'draft'), ('rejected', 'cancelled'),
    ('accepted', 'in_transit'), ('accepted', 'assigned'), ('accepted', 'cancelled'),
    ('in_transit', 'driver_completed'), ('in_transit', 'cancelled'),
    ('driver_completed', 'in_transit'), ('driver_completed', 'closed'),
    ('closed', 'driver_completed')
  );
$$;

create or replace function private.shipments_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shipment_code <> old.shipment_code then
    raise exception 'Mã Shipment không được thay đổi' using errcode = '42501';
  end if;
  if new.order_id <> old.order_id then
    raise exception 'Không được chuyển Shipment sang đơn hàng khác' using errcode = '42501';
  end if;
  if not private.shipment_transition_allowed(old.status, new.status) then
    raise exception 'Không thể chuyển trạng thái chuyến từ % sang %', old.status, new.status using errcode = '22023';
  end if;
  -- Chuyến đã đóng/hủy: khóa dữ liệu giá
  if old.status in ('closed', 'cancelled') and (
       new.unit_price, new.quantity, new.surcharge_amount, new.fuel_support_amount, new.price_list_id
     ) is distinct from (
       old.unit_price, old.quantity, old.surcharge_amount, old.fuel_support_amount, old.price_list_id
     ) then
    raise exception 'Chuyến đã đóng hoặc đã hủy, không được sửa giá' using errcode = '42501';
  end if;
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;
create trigger trg_shipments_guard before update on public.shipments
for each row execute function private.shipments_before_update();

create or replace function private.shipments_status_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.shipment_status_history (shipment_id, status_field, from_status, to_status, changed_by)
    values (new.id, 'status', null, new.status, auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.shipment_status_history (shipment_id, status_field, from_status, to_status, changed_by, note)
    values (new.id, 'status', old.status, new.status, auth.uid(), case when new.status = 'cancelled' then new.cancel_reason end);
  end if;
  if new.document_status is distinct from old.document_status then
    insert into public.shipment_status_history (shipment_id, status_field, from_status, to_status, changed_by)
    values (new.id, 'document_status', old.document_status, new.document_status, auth.uid());
  end if;
  if new.settlement_status is distinct from old.settlement_status then
    insert into public.shipment_status_history (shipment_id, status_field, from_status, to_status, changed_by)
    values (new.id, 'settlement_status', old.settlement_status, new.settlement_status, auth.uid());
  end if;
  return new;
end;
$$;
create trigger trg_shipments_history after insert or update on public.shipments
for each row execute function private.shipments_status_history();

-- >>> 20261016000005_finance.sql
-- =============================================================================
-- GHA TMS - 0005: Chứng từ, phê duyệt, chi phí chuyến, ứng tiền, thanh toán, công nợ
-- =============================================================================
-- Nguyên tắc tài chính:
--   * Tạm ứng là khoản trả trước cho tài xế, KHÔNG phải chi phí.
--   * Chi phí chuyến chỉ được ghi nhận khi status = 'approved'.
--   * Hỗ trợ dầu là một khoản doanh thu/thu từ khách hàng, KHÔNG phải chi phí dầu thực tế.
--   * Một yêu cầu phê duyệt chỉ được ghi nhận thanh toán một lần (unique index).
--   * Mọi thao tác tài chính đi qua hàm SQL trong transaction (Giai đoạn 6-7).
-- =============================================================================

-- Chứng từ / tệp đính kèm (metadata; tệp nằm trong Supabase Storage bucket riêng tư)
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  bucket text not null default 'documents',
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type in (
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  entity_type text not null check (entity_type in (
    'shipment', 'shipment_expense', 'advance_request', 'payment', 'vehicle', 'driver',
    'maintenance_record', 'approval_request', 'receivable', 'payable', 'transport_order', 'location', 'customer')),
  entity_id uuid not null,
  doc_type text not null default 'other' check (doc_type in (
    'delivery_note', 'invoice', 'receipt', 'photo', 'contract', 'id_card', 'registration', 'insurance', 'bank', 'other')),
  is_sensitive boolean not null default false,
  uploaded_by uuid references public.profiles (id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bucket, storage_path)
);
create index documents_entity_idx on public.documents (entity_type, entity_id) where archived_at is null;

-- Hạng mục phê duyệt (cấu hình)
create table public.approval_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  requires_document boolean not null default false,
  requires_reject_reason boolean not null default true,
  allow_self_approval boolean not null default false,
  sla_hours integer check (sla_hours > 0),
  max_amount numeric(18,2) check (max_amount >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

-- Cấp duyệt theo hạng mục và hạn mức
create table public.approval_rules (
  id uuid primary key default gen_random_uuid(),
  approval_type_id uuid not null references public.approval_types (id) on delete cascade,
  level integer not null check (level between 1 and 5),
  approver_role_id uuid references public.roles (id),
  approver_user_id uuid references public.profiles (id),
  min_amount numeric(18,2) not null default 0 check (min_amount >= 0),
  max_amount numeric(18,2) check (max_amount is null or max_amount >= min_amount),
  notify_role_ids uuid[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (approver_role_id is not null or approver_user_id is not null)
);
create index approval_rules_type_idx on public.approval_rules (approval_type_id, level);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  approval_type_id uuid not null references public.approval_types (id),
  entity_type text not null,
  entity_id uuid,
  shipment_id uuid references public.shipments (id),
  requested_by uuid not null references public.profiles (id),
  requested_at timestamptz not null default now(),
  amount numeric(18,2) check (amount >= 0),
  content text not null,
  status text not null default 'draft' check (status in ('draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled', 'info_requested')),
  current_level integer not null default 1,
  required_levels integer not null default 1,
  reject_reason text,
  decided_at timestamptz,
  due_at timestamptz,
  workflow_version_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index approval_requests_status_idx on public.approval_requests (status, requested_at desc);
create index approval_requests_shipment_idx on public.approval_requests (shipment_id);

create table public.approval_steps (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.approval_requests (id) on delete restrict,
  level integer not null,
  action text not null check (action in ('submit', 'approve', 'reject', 'request_info', 'cancel', 'revoke', 'comment', 'mark_paid')),
  actor_id uuid not null references public.profiles (id),
  acted_at timestamptz not null default now(),
  comment text
);
create unique index approval_steps_one_approve_per_level on public.approval_steps (request_id, level) where action = 'approve';
create index approval_steps_request_idx on public.approval_steps (request_id, acted_at);

-- Chi phí chuyến xe
create table public.shipment_expenses (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete restrict,
  category_id uuid not null references public.expense_categories (id),
  amount numeric(18,2) not null check (amount >= 0),
  incurred_at timestamptz not null default now(),
  note text,
  source text not null check (source in ('driver', 'admin', 'other')),
  supplier_id uuid references public.suppliers (id),
  status text not null default 'pending' check (status in ('draft', 'pending', 'approved', 'rejected', 'cancelled')),
  approval_request_id uuid references public.approval_requests (id),
  client_request_id uuid unique, -- chống gửi trùng khi mạng chập chờn
  entered_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index shipment_expenses_shipment_idx on public.shipment_expenses (shipment_id);

-- Yêu cầu ứng tiền
create table public.advance_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  shipment_id uuid references public.shipments (id),
  driver_id uuid not null references public.drivers (id),
  amount_requested numeric(18,2) not null check (amount_requested > 0),
  amount_approved numeric(18,2) check (amount_approved >= 0),
  reason text not null,
  payment_method_id uuid references public.payment_methods (id),
  bank_account_id uuid references public.bank_accounts (id),
  note text,
  status text not null default 'pending' check (status in ('draft', 'pending', 'approved', 'rejected', 'paid', 'cancelled', 'info_requested')),
  approval_request_id uuid unique references public.approval_requests (id),
  client_request_id uuid unique,
  requested_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index advance_requests_driver_idx on public.advance_requests (driver_id, created_at desc);

-- Thanh toán / thu tiền (mọi dòng tiền thực tế)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  direction text not null check (direction in ('in', 'out')),
  purpose text not null check (purpose in ('advance', 'advance_refund', 'expense_reimbursement', 'driver_settlement', 'receivable', 'payable', 'other')),
  payment_method_id uuid references public.payment_methods (id),
  company_bank_account_id uuid references public.bank_accounts (id),
  amount numeric(18,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  driver_id uuid references public.drivers (id),
  customer_id uuid references public.customers (id),
  supplier_id uuid references public.suppliers (id),
  shipment_id uuid references public.shipments (id),
  approval_request_id uuid references public.approval_requests (id),
  advance_request_id uuid references public.advance_requests (id),
  receivable_id uuid,
  payable_id uuid,
  reference_no text,
  note text,
  status text not null default 'posted' check (status in ('posted', 'voided')),
  void_reason text,
  idempotency_key uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (status <> 'voided' or void_reason is not null)
);
-- Một yêu cầu phê duyệt / một yêu cầu ứng chỉ được chi một lần
create unique index payments_one_per_approval on public.payments (approval_request_id) where status = 'posted' and approval_request_id is not null;
create unique index payments_one_per_advance on public.payments (advance_request_id) where status = 'posted' and purpose = 'advance';

-- Giao dịch tạm ứng (sổ phụ tạm ứng theo tài xế/chuyến)
create table public.advance_transactions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.drivers (id),
  shipment_id uuid references public.shipments (id),
  advance_request_id uuid references public.advance_requests (id),
  payment_id uuid references public.payments (id),
  txn_type text not null check (txn_type in ('disbursement', 'refund', 'settlement_offset', 'adjustment')),
  amount numeric(18,2) not null check (amount <> 0),
  occurred_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);
create index advance_transactions_driver_idx on public.advance_transactions (driver_id, occurred_at);

-- Công nợ phải thu
create table public.receivables (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid not null references public.customers (id),
  shipment_id uuid references public.shipments (id),
  order_id uuid references public.transport_orders (id),
  amount numeric(18,2) not null check (amount > 0),
  issued_date date not null,
  due_date date not null,
  paid_amount numeric(18,2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(18,2) generated always as (amount - paid_amount) stored,
  status text not null default 'open' check (status in ('open', 'partial', 'paid', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (paid_amount <= amount),
  check (due_date >= issued_date)
);
create index receivables_customer_idx on public.receivables (customer_id, due_date);

-- Công nợ phải trả
create table public.payables (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  supplier_id uuid references public.suppliers (id),
  driver_id uuid references public.drivers (id),
  shipment_id uuid references public.shipments (id),
  maintenance_record_id uuid references public.maintenance_records (id),
  amount numeric(18,2) not null check (amount > 0),
  issued_date date not null,
  due_date date not null,
  paid_amount numeric(18,2) not null default 0 check (paid_amount >= 0),
  remaining_amount numeric(18,2) generated always as (amount - paid_amount) stored,
  status text not null default 'open' check (status in ('open', 'partial', 'paid', 'cancelled')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (paid_amount <= amount),
  check (due_date >= issued_date),
  check (supplier_id is not null or driver_id is not null)
);
create index payables_supplier_idx on public.payables (supplier_id, due_date);

alter table public.payments
  add constraint payments_receivable_fk foreign key (receivable_id) references public.receivables (id),
  add constraint payments_payable_fk foreign key (payable_id) references public.payables (id);

do $$
declare t text;
begin
  foreach t in array array[
    'approval_types', 'approval_rules', 'approval_requests', 'shipment_expenses', 'advance_requests',
    'payments', 'receivables', 'payables'
  ] loop
    perform private.attach_standard_triggers(('public.' || t)::regclass);
  end loop;
end $$;

-- Mã chứng từ tự sinh
create or replace function private.fill_doc_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code is null or new.code = '' then
    new.code := private.next_code(tg_argv[0], now());
  end if;
  return new;
end;
$$;
create trigger trg_approval_requests_code before insert on public.approval_requests for each row execute function private.fill_doc_code('APR');
create trigger trg_advance_requests_code before insert on public.advance_requests for each row execute function private.fill_doc_code('ADV');
create trigger trg_payments_code before insert on public.payments for each row execute function private.fill_doc_code('PAY');
create trigger trg_receivables_code before insert on public.receivables for each row execute function private.fill_doc_code('AR');
create trigger trg_payables_code before insert on public.payables for each row execute function private.fill_doc_code('AP');

-- Đã duyệt thì không sửa trực tiếp số tiền / nội dung
create or replace function private.guard_approval_requests()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('approved', 'paid') and (new.amount, new.content, new.approval_type_id, new.entity_id)
       is distinct from (old.amount, old.content, old.approval_type_id, old.entity_id) then
    raise exception 'Yêu cầu đã duyệt: không được sửa số tiền hoặc nội dung. Hãy tạo yêu cầu điều chỉnh.' using errcode = '42501';
  end if;
  if old.status = 'paid' and new.status <> 'paid' then
    raise exception 'Yêu cầu đã thanh toán không thể đổi trạng thái' using errcode = '42501';
  end if;
  new.version := old.version + 1;
  return new;
end;
$$;
create trigger trg_approval_requests_guard before update on public.approval_requests
for each row execute function private.guard_approval_requests();

create or replace function private.guard_approved_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'shipment_expenses' and old.status = 'approved'
     and (new.amount, new.category_id, new.shipment_id) is distinct from (old.amount, old.category_id, old.shipment_id) then
    raise exception 'Chi phí đã duyệt: không được sửa trực tiếp số tiền/loại chi phí' using errcode = '42501';
  end if;
  if tg_table_name = 'advance_requests' and old.status in ('approved', 'paid')
     and (new.amount_requested, new.amount_approved, new.driver_id) is distinct from (old.amount_requested, old.amount_approved, old.driver_id) then
    raise exception 'Yêu cầu ứng đã duyệt: không được sửa trực tiếp số tiền' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_shipment_expenses_guard before update on public.shipment_expenses
for each row execute function private.guard_approved_amount();
create trigger trg_advance_requests_guard before update on public.advance_requests
for each row execute function private.guard_approved_amount();

-- Thanh toán đã ghi nhận chỉ được hủy (void) có lý do, không được sửa số tiền hay xóa
create or replace function private.guard_payments()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Không được xóa thanh toán; hãy hủy (void) có lý do' using errcode = '42501';
  end if;
  if old.status = 'voided' then
    raise exception 'Thanh toán đã hủy không thể sửa' using errcode = '42501';
  end if;
  if (new.amount, new.direction, new.purpose, new.approval_request_id, new.advance_request_id, new.receivable_id, new.payable_id)
     is distinct from (old.amount, old.direction, old.purpose, old.approval_request_id, old.advance_request_id, old.receivable_id, old.payable_id) then
    raise exception 'Không được sửa số tiền/đối tượng thanh toán; hãy hủy và tạo lại' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_payments_guard before update or delete on public.payments
for each row execute function private.guard_payments();

-- Không xóa cứng chuyến đã phát sinh tài chính hoặc đã qua bước nháp
create or replace function private.guard_shipment_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'draft'
     or exists (select 1 from public.shipment_expenses where shipment_id = old.id)
     or exists (select 1 from public.advance_requests where shipment_id = old.id)
     or exists (select 1 from public.payments where shipment_id = old.id)
     or exists (select 1 from public.receivables where shipment_id = old.id)
     or exists (select 1 from public.payables where shipment_id = old.id)
     or exists (select 1 from public.approval_requests where shipment_id = old.id) then
    raise exception 'Chuyến đã phát sinh nghiệp vụ, chỉ được hủy (không xóa)' using errcode = '42501';
  end if;
  delete from public.shipment_status_history where shipment_id = old.id;
  delete from public.shipment_assignments where shipment_id = old.id;
  return old;
end;
$$;
create trigger trg_shipments_delete_guard before delete on public.shipments
for each row execute function private.guard_shipment_delete();

-- >>> 20261016000006_config_audit.sql
-- =============================================================================
-- GHA TMS - 0006: Cấu hình động (trường, biểu mẫu, quy trình, bảng), thông báo,
--                 nhật ký hệ thống, cấu hình hệ thống
-- =============================================================================

-- Định nghĩa trường dữ liệu (trường hệ thống + trường động lưu trong custom_fields JSONB)
create table public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  module text not null check (module ~ '^[a-z][a-z0-9_]*$'),
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,62}$'),
  label text not null,
  description text,
  field_kind text not null default 'business' check (field_kind in ('system', 'business', 'formula')),
  data_type text not null check (data_type in (
    'short_text', 'long_text', 'integer', 'decimal', 'currency', 'percent', 'date', 'datetime',
    'single_select', 'multi_select', 'boolean', 'email', 'phone', 'url', 'reference', 'formula',
    'file', 'image', 'gps')),
  is_required boolean not null default false,
  is_editable boolean not null default true,
  is_visible boolean not null default true,
  is_searchable boolean not null default false,
  is_filterable boolean not null default false,
  is_sortable boolean not null default false,
  default_value jsonb,
  display_format text,
  sort_order integer not null default 0,
  view_permission text references public.permissions (code),
  edit_permission text references public.permissions (code),
  validation jsonb not null default '{}'::jsonb,
  formula text,
  visibility_condition text,
  options jsonb not null default '[]'::jsonb,
  reference_target text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (module, field_key),
  check (data_type <> 'formula' or formula is not null),
  check (data_type <> 'reference' or reference_target is not null)
);

create table public.field_definition_versions (
  id bigint generated always as identity primary key,
  field_id uuid not null references public.field_definitions (id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  change_note text,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  unique (field_id, version)
);

create table public.form_definitions (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  code text not null unique,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  current_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table public.form_versions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.form_definitions (id) on delete cascade,
  version integer not null,
  layout jsonb not null,
  change_note text,
  published_by uuid,
  published_at timestamptz not null default now(),
  unique (form_id, version)
);

create table public.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  entity_type text not null,
  approval_type_id uuid references public.approval_types (id),
  description text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  current_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table public.workflow_versions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflow_definitions (id) on delete cascade,
  version integer not null,
  definition jsonb not null,
  change_note text,
  published_by uuid,
  published_at timestamptz not null default now(),
  unique (workflow_id, version)
);

alter table public.approval_requests
  add constraint approval_requests_workflow_version_fk foreign key (workflow_version_id) references public.workflow_versions (id);

-- Cấu hình hiển thị bảng: hệ thống, theo vai trò, theo người dùng
create table public.table_view_preferences (
  id uuid primary key default gen_random_uuid(),
  table_key text not null check (table_key ~ '^[a-z][a-z0-9_.]*$'),
  scope text not null check (scope in ('system', 'role', 'user')),
  role_id uuid references public.roles (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  name text not null default 'Mặc định',
  is_default boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'system' and role_id is null and user_id is null)
    or (scope = 'role' and role_id is not null and user_id is null)
    or (scope = 'user' and user_id is not null and role_id is null)
  ),
  check (pg_column_size(config) < 65536)
);
create unique index table_view_pref_uq on public.table_view_preferences (
  table_key, scope, coalesce(role_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), name);
create trigger trg_table_view_preferences_updated_at before update on public.table_view_preferences
for each row execute function private.set_updated_at();

-- Thông báo trong ứng dụng
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

-- Nhật ký hệ thống (chỉ ghi thêm)
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  reason text
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, occurred_at desc);
create index audit_logs_time_idx on public.audit_logs (occurred_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, occurred_at desc);

-- Cấu hình hệ thống dạng key-value
create table public.system_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_.]*$'),
  value jsonb not null,
  description text,
  is_public boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['field_definitions', 'form_definitions', 'workflow_definitions'] loop
    perform private.attach_standard_triggers(('public.' || t)::regclass);
  end loop;
end $$;

-- Trường dữ liệu: mã không đổi, trường hệ thống không xóa, lưu phiên bản mỗi lần sửa
create or replace function private.guard_field_definitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.field_kind = 'system' then
      raise exception 'Không được xóa trường hệ thống' using errcode = '42501';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if new.field_key <> old.field_key or new.module <> old.module then
      raise exception 'Mã trường và module không được thay đổi' using errcode = '42501';
    end if;
    if old.field_kind = 'system' and (new.field_kind <> old.field_kind or new.data_type <> old.data_type) then
      raise exception 'Không được đổi loại của trường hệ thống' using errcode = '42501';
    end if;
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
create trigger trg_field_definitions_guard before update or delete on public.field_definitions
for each row execute function private.guard_field_definitions();

create or replace function private.version_field_definitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.field_definition_versions (field_id, version, snapshot, changed_by)
  values (new.id, new.version, to_jsonb(new), auth.uid());
  return new;
end;
$$;
create trigger trg_field_definitions_version after insert or update on public.field_definitions
for each row execute function private.version_field_definitions();

-- -----------------------------------------------------------------------------
-- Ghi nhật ký tự động cho bảng nghiệp vụ
-- -----------------------------------------------------------------------------
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_j jsonb;
  new_j jsonb;
  changed text[];
  rid text;
begin
  if tg_op in ('UPDATE', 'DELETE') then old_j := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then new_j := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into changed
    from jsonb_object_keys(new_j) k
    where k not in ('updated_at', 'updated_by', 'version')
      and (old_j -> k) is distinct from (new_j -> k);
    if changed is null then
      return new; -- không có thay đổi thực sự
    end if;
  end if;

  -- Không ghi giá trị nhạy cảm vào nhật ký dạng rõ
  if tg_table_name = 'driver_sensitive' then
    old_j := case when old_j is null then null else jsonb_build_object('driver_id', old_j -> 'driver_id', 'redacted', true) end;
    new_j := case when new_j is null then null else jsonb_build_object('driver_id', new_j -> 'driver_id', 'redacted', true) end;
  end if;

  rid := coalesce(new_j, old_j) ->> 'id';
  if rid is null then
    rid := coalesce(new_j, old_j) ->> coalesce(tg_argv[0], 'id');
  end if;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data, changed_fields, reason)
  values (auth.uid(), lower(tg_op), tg_table_name, rid, old_j, new_j, changed,
          nullif(current_setting('gha.audit_reason', true), ''));
  return coalesce(new, old);
end;
$$;

do $$
declare t text; key_col text;
begin
  foreach t in array array[
    'profiles', 'roles', 'role_permissions', 'user_roles', 'user_permission_overrides', 'user_invitations',
    'catalogs', 'catalog_items', 'company_entities', 'banks', 'payment_methods', 'vehicle_types', 'salary_rules',
    'drivers', 'driver_sensitive', 'suppliers', 'customers', 'bank_accounts', 'vehicles', 'vehicle_financials', 'loan_schedules',
    'maintenance_records', 'locations', 'routes', 'transport_price_lists', 'expense_categories', 'fuel_support_rules',
    'transport_orders', 'shipments', 'shipment_assignments',
    'documents', 'approval_types', 'approval_rules', 'approval_requests', 'approval_steps', 'shipment_expenses',
    'advance_requests', 'advance_transactions', 'payments', 'receivables', 'payables',
    'field_definitions', 'form_definitions', 'form_versions', 'workflow_definitions', 'workflow_versions', 'system_settings'
  ] loop
    key_col := case t
      when 'role_permissions' then 'role_id'
      when 'user_roles' then 'user_id'
      when 'user_permission_overrides' then 'user_id'
      when 'driver_sensitive' then 'driver_id'
      when 'vehicle_financials' then 'vehicle_id'
      when 'system_settings' then 'key'
      else 'id' end;
    execute format('create trigger trg_%s_audit after insert or update or delete on public.%I for each row execute function private.audit_row_change(%L)', t, t, key_col);
  end loop;
end $$;

-- Nhật ký: không ai (kể cả Super Admin qua API) được sửa hoặc xóa
create or replace function private.block_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Nhật ký hệ thống không được sửa hoặc xóa' using errcode = '42501';
end;
$$;
create trigger trg_audit_logs_immutable before update or delete on public.audit_logs
for each row execute function private.block_audit_mutation();
revoke update, delete, truncate on public.audit_logs from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Thông báo: hàm tạo thông báo cho người dùng có quyền (dùng ở các giai đoạn sau)
-- -----------------------------------------------------------------------------
create or replace function private.notify_permission_holders(perm text, n_type text, n_title text, n_body text, n_entity_type text, n_entity_id uuid, n_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, link)
  select distinct p.id, n_type, n_title, n_body, n_entity_type, n_entity_id, n_link
  from public.profiles p
  where p.status = 'active' and (
    exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p.id and r.code = 'super_admin')
    or exists (select 1 from public.user_roles ur join public.role_permissions rp on rp.role_id = ur.role_id where ur.user_id = p.id and rp.permission_code = perm)
    or exists (select 1 from public.user_permission_overrides o where o.user_id = p.id and o.permission_code = perm and o.effect = 'grant')
  )
  and not exists (select 1 from public.user_permission_overrides o where o.user_id = p.id and o.permission_code = perm and o.effect = 'deny');
$$;

-- Thông báo cho người quản lý người dùng khi có tài khoản mới chờ cấp quyền
create or replace function private.notify_pending_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform private.notify_permission_holders('users.update', 'user.pending', 'Tài khoản mới chờ cấp quyền',
      new.email || ' vừa đăng nhập và đang chờ cấp quyền.', 'profiles', new.id, '/nguoi-dung');
  end if;
  return new;
end;
$$;
create trigger trg_profiles_notify_pending after insert on public.profiles
for each row execute function private.notify_pending_profile();

-- Kích hoạt trigger tạo hồ sơ khi đăng nhập lần đầu
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_auth_user();

-- >>> 20261016000007_rls.sql
-- =============================================================================
-- GHA TMS - 0007: Row Level Security
-- =============================================================================
-- Mặc định TỪ CHỐI: bật RLS cho mọi bảng public; chỉ mở đúng quyền cần thiết.
-- (Không dùng FORCE RLS để các hàm security definer do chủ sở hữu bảng chạy hoạt động đúng.)
-- Các thao tác tài chính / tài xế (nhận chuyến, ứng tiền, nhập chi phí, duyệt, thanh toán)
-- KHÔNG mở ghi trực tiếp; sẽ đi qua hàm SQL security definer ở Giai đoạn 5-7 để kiểm tra
-- nghiệp vụ trong cùng transaction.
-- =============================================================================

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Không cho khách (anon) đọc/ghi bất kỳ bảng nào
revoke all on all tables in schema public from anon;

-- Sinh bộ policy chuẩn theo module: view / create / update / delete
create or replace function private.apply_module_policies(
  tbl text, module text,
  select_expr text default null,
  with_delete boolean default true
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('create policy %I on public.%I for select to authenticated using (%s)',
    tbl || '_select', tbl, coalesce(select_expr, format('private.has_perm(%L)', module || '.view')));
  execute format('create policy %I on public.%I for insert to authenticated with check (private.has_perm(%L))',
    tbl || '_insert', tbl, module || '.create');
  execute format('create policy %I on public.%I for update to authenticated using (private.has_perm(%L)) with check (private.has_perm(%L))',
    tbl || '_update', tbl, module || '.update', module || '.update');
  if with_delete then
    execute format('create policy %I on public.%I for delete to authenticated using (private.has_perm(%L))',
      tbl || '_delete', tbl, module || '.delete');
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Người dùng & phân quyền
-- -----------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or private.has_perm('users.view'));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or private.has_perm('users.update'))
  with check (id = auth.uid() or private.has_perm('users.update'));

create policy roles_select on public.roles for select to authenticated using (private.is_active_user());
create policy roles_insert on public.roles for insert to authenticated with check (private.has_perm('users.configure'));
create policy roles_update on public.roles for update to authenticated using (private.has_perm('users.configure')) with check (private.has_perm('users.configure'));
create policy roles_delete on public.roles for delete to authenticated using (private.has_perm('users.configure'));

create policy permissions_select on public.permissions for select to authenticated using (private.is_active_user());

create policy role_permissions_select on public.role_permissions for select to authenticated using (private.is_active_user());
create policy role_permissions_insert on public.role_permissions for insert to authenticated with check (private.has_perm('users.configure'));
create policy role_permissions_delete on public.role_permissions for delete to authenticated using (private.has_perm('users.configure'));

create policy user_roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or private.has_perm('users.view'));
create policy user_roles_insert on public.user_roles for insert to authenticated with check (private.has_perm('users.configure'));
create policy user_roles_delete on public.user_roles for delete to authenticated using (private.has_perm('users.configure'));

create policy user_perm_overrides_select on public.user_permission_overrides for select to authenticated
  using (user_id = auth.uid() or private.has_perm('users.view'));
create policy user_perm_overrides_insert on public.user_permission_overrides for insert to authenticated with check (private.has_perm('users.configure'));
create policy user_perm_overrides_update on public.user_permission_overrides for update to authenticated using (private.has_perm('users.configure')) with check (private.has_perm('users.configure'));
create policy user_perm_overrides_delete on public.user_permission_overrides for delete to authenticated using (private.has_perm('users.configure'));

create policy user_invitations_select on public.user_invitations for select to authenticated using (private.has_perm('users.view'));
create policy user_invitations_update on public.user_invitations for update to authenticated
  using (private.has_perm('users.update')) with check (private.has_perm('users.update') and status in ('pending', 'revoked'));

-- -----------------------------------------------------------------------------
-- Danh mục tham chiếu: mọi người dùng đang hoạt động được đọc; ghi theo quyền catalogs.*
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['catalogs', 'catalog_items', 'company_entities', 'banks', 'payment_methods',
                           'vehicle_types', 'expense_categories', 'approval_types'] loop
    perform private.apply_module_policies(t, 'catalogs', 'private.is_active_user()');
  end loop;
end $$;

select private.apply_module_policies('salary_rules', 'catalogs', 'private.has_perm(''catalogs.view'') or private.has_perm(''drivers.view'')');
select private.apply_module_policies('approval_rules', 'approvals', 'private.has_perm(''approvals.view'')');
-- approval_rules: ghi theo approvals.configure thay vì create/update/delete
drop policy approval_rules_insert on public.approval_rules;
drop policy approval_rules_update on public.approval_rules;
drop policy approval_rules_delete on public.approval_rules;
create policy approval_rules_write on public.approval_rules for all to authenticated
  using (private.has_perm('approvals.configure')) with check (private.has_perm('approvals.configure'));

-- -----------------------------------------------------------------------------
-- Tài xế, phương tiện, khách hàng, địa điểm, bảng giá
-- -----------------------------------------------------------------------------
select private.apply_module_policies('drivers', 'drivers',
  'private.has_perm(''drivers.view'') or (profile_id = auth.uid() and private.is_active_user())');

create policy driver_sensitive_select on public.driver_sensitive for select to authenticated
  using (private.has_perm('drivers.view_sensitive') or driver_id = private.my_driver_id());
create policy driver_sensitive_write on public.driver_sensitive for all to authenticated
  using (private.has_perm('drivers.view_sensitive') and private.has_perm('drivers.update'))
  with check (private.has_perm('drivers.view_sensitive') and private.has_perm('drivers.update'));

select private.apply_module_policies('vehicles', 'vehicles');
create policy vehicle_financials_select on public.vehicle_financials for select to authenticated
  using (private.has_perm('vehicles.view_sensitive'));
create policy vehicle_financials_write on public.vehicle_financials for all to authenticated
  using (private.has_perm('vehicles.view_sensitive') and private.has_perm('vehicles.update'))
  with check (private.has_perm('vehicles.view_sensitive') and private.has_perm('vehicles.update'));
create policy loan_schedules_select on public.loan_schedules for select to authenticated
  using (private.has_perm('vehicles.view_sensitive'));
create policy loan_schedules_write on public.loan_schedules for all to authenticated
  using (private.has_perm('vehicles.view_sensitive') and private.has_perm('vehicles.update'))
  with check (private.has_perm('vehicles.view_sensitive') and private.has_perm('vehicles.update'));
select private.apply_module_policies('maintenance_records', 'vehicles', null, false);

select private.apply_module_policies('customers', 'customers');
select private.apply_module_policies('suppliers', 'customers');
select private.apply_module_policies('locations', 'locations');
select private.apply_module_policies('routes', 'locations');
select private.apply_module_policies('transport_price_lists', 'price_lists');
select private.apply_module_policies('fuel_support_rules', 'price_lists');

-- Tài khoản ngân hàng: của tài xế thuộc dữ liệu nhạy cảm
create policy bank_accounts_select on public.bank_accounts for select to authenticated using (
  (owner_type = 'driver' and (private.has_perm('drivers.view_sensitive') or driver_id = private.my_driver_id()))
  or (owner_type <> 'driver' and (private.has_perm('catalogs.view') or private.has_perm('payments.view')))
);
create policy bank_accounts_write on public.bank_accounts for all to authenticated using (
  (owner_type = 'driver' and private.has_perm('drivers.view_sensitive') and private.has_perm('drivers.update'))
  or (owner_type <> 'driver' and private.has_perm('catalogs.update'))
) with check (
  (owner_type = 'driver' and private.has_perm('drivers.view_sensitive') and private.has_perm('drivers.update'))
  or (owner_type <> 'driver' and private.has_perm('catalogs.update'))
);

-- -----------------------------------------------------------------------------
-- Điều phối & Shipment
-- -----------------------------------------------------------------------------
create policy transport_orders_select on public.transport_orders for select to authenticated
  using (private.has_perm('dispatch.view') or private.has_perm('shipments.view'));
create policy transport_orders_insert on public.transport_orders for insert to authenticated
  with check (private.has_perm('dispatch.create'));
create policy transport_orders_update on public.transport_orders for update to authenticated
  using (private.has_perm('dispatch.update')) with check (private.has_perm('dispatch.update'));

create policy shipments_select on public.shipments for select to authenticated using (
  private.has_perm('shipments.view') or private.has_perm('dispatch.view')
  or (driver_id is not null and driver_id = private.my_driver_id() and private.has_perm('driver_app.use'))
);
create policy shipments_insert on public.shipments for insert to authenticated
  with check (private.has_perm('dispatch.create') or private.has_perm('shipments.create'));
create policy shipments_update on public.shipments for update to authenticated
  using (private.has_perm('dispatch.update') or private.has_perm('shipments.update'))
  with check (private.has_perm('dispatch.update') or private.has_perm('shipments.update'));
create policy shipments_delete on public.shipments for delete to authenticated
  using ((private.has_perm('dispatch.delete') or private.has_perm('shipments.delete')) and status = 'draft');

create policy shipment_assignments_select on public.shipment_assignments for select to authenticated using (
  private.has_perm('shipments.view') or private.has_perm('dispatch.view')
  or (driver_id = private.my_driver_id() and private.has_perm('driver_app.use'))
);
create policy shipment_assignments_insert on public.shipment_assignments for insert to authenticated
  with check (private.has_perm('dispatch.update'));
create policy shipment_assignments_update on public.shipment_assignments for update to authenticated
  using (private.has_perm('dispatch.update')) with check (private.has_perm('dispatch.update'));

create policy shipment_status_history_select on public.shipment_status_history for select to authenticated
  using (exists (select 1 from public.shipments s where s.id = shipment_id));

-- -----------------------------------------------------------------------------
-- Chứng từ
-- -----------------------------------------------------------------------------
create policy documents_select on public.documents for select to authenticated using (
  archived_at is null and (
    uploaded_by = auth.uid()
    or (private.has_perm('documents.view') and (not is_sensitive or private.has_perm('documents.view_sensitive')))
    or (entity_type = 'shipment' and not is_sensitive
        and exists (select 1 from public.shipments s where s.id = entity_id and s.driver_id = private.my_driver_id()))
  )
);
create policy documents_insert on public.documents for insert to authenticated
  with check (private.has_perm('documents.create') and uploaded_by = auth.uid());
create policy documents_archive on public.documents for update to authenticated
  using (private.has_perm('documents.delete')) with check (private.has_perm('documents.delete'));

-- -----------------------------------------------------------------------------
-- Tài chính: chỉ đọc qua RLS; ghi qua hàm nghiệp vụ (Giai đoạn 6-7)
-- -----------------------------------------------------------------------------
create policy approval_requests_select on public.approval_requests for select to authenticated
  using (private.has_perm('approvals.view') or requested_by = auth.uid());
create policy approval_steps_select on public.approval_steps for select to authenticated
  using (exists (select 1 from public.approval_requests r where r.id = request_id));

create policy shipment_expenses_select on public.shipment_expenses for select to authenticated using (
  private.has_perm('expenses.view') or entered_by = auth.uid()
);
create policy advance_requests_select on public.advance_requests for select to authenticated using (
  private.has_perm('advances.view') or requested_by = auth.uid() or driver_id = private.my_driver_id()
);
create policy advance_transactions_select on public.advance_transactions for select to authenticated using (
  private.has_perm('advances.view') or driver_id = private.my_driver_id()
);
create policy payments_select on public.payments for select to authenticated using (private.has_perm('payments.view'));
create policy receivables_select on public.receivables for select to authenticated using (private.has_perm('receivables.view'));
create policy payables_select on public.payables for select to authenticated using (private.has_perm('receivables.view'));

-- -----------------------------------------------------------------------------
-- Cấu hình động
-- -----------------------------------------------------------------------------
create policy field_definitions_select on public.field_definitions for select to authenticated using (private.is_active_user());
create policy field_definitions_write on public.field_definitions for all to authenticated
  using (private.has_perm('fields.configure')) with check (private.has_perm('fields.configure'));
create policy field_definition_versions_select on public.field_definition_versions for select to authenticated
  using (private.has_perm('fields.view') or private.has_perm('fields.configure'));

create policy form_definitions_select on public.form_definitions for select to authenticated using (private.is_active_user());
create policy form_definitions_write on public.form_definitions for all to authenticated
  using (private.has_perm('forms.configure')) with check (private.has_perm('forms.configure'));
create policy form_versions_select on public.form_versions for select to authenticated using (private.is_active_user());
create policy form_versions_insert on public.form_versions for insert to authenticated with check (private.has_perm('forms.configure'));

create policy workflow_definitions_select on public.workflow_definitions for select to authenticated
  using (private.has_perm('workflows.view') or private.has_perm('approvals.view'));
create policy workflow_definitions_write on public.workflow_definitions for all to authenticated
  using (private.has_perm('workflows.configure')) with check (private.has_perm('workflows.configure'));
create policy workflow_versions_select on public.workflow_versions for select to authenticated
  using (private.has_perm('workflows.view') or private.has_perm('approvals.view'));
create policy workflow_versions_insert on public.workflow_versions for insert to authenticated with check (private.has_perm('workflows.configure'));

create policy table_view_prefs_select on public.table_view_preferences for select to authenticated using (
  private.is_active_user() and (
    scope = 'system'
    or user_id = auth.uid()
    or (scope = 'role' and exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role_id = table_view_preferences.role_id))
    or private.has_perm('settings.configure')
  )
);
create policy table_view_prefs_write on public.table_view_preferences for all to authenticated using (
  private.is_active_user() and (
    (scope = 'user' and user_id = auth.uid())
    or (scope in ('system', 'role') and private.has_perm('settings.configure'))
  )
) with check (
  private.is_active_user() and (
    (scope = 'user' and user_id = auth.uid())
    or (scope in ('system', 'role') and private.has_perm('settings.configure'))
  )
);

create policy notifications_select on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create or replace function private.guard_notifications()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.recipient_id, new.type, new.title, new.body, new.entity_type, new.entity_id, new.link, new.created_at)
     is distinct from (old.recipient_id, old.type, old.title, old.body, old.entity_type, old.entity_id, old.link, old.created_at) then
    raise exception 'Chỉ được đánh dấu đã đọc' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_notifications_guard before update on public.notifications
for each row execute function private.guard_notifications();

create policy audit_logs_select on public.audit_logs for select to authenticated using (private.has_perm('audit_logs.view'));

create policy system_settings_select on public.system_settings for select to authenticated using (private.is_active_user());
create policy system_settings_write on public.system_settings for all to authenticated
  using (private.has_perm('settings.configure')) with check (private.has_perm('settings.configure'));

create or replace function private.system_settings_actor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
create trigger trg_system_settings_actor before insert or update on public.system_settings
for each row execute function private.system_settings_actor();

-- >>> 20261016000008_storage.sql
-- =============================================================================
-- GHA TMS - 0008: Supabase Storage cho chứng từ (bucket riêng tư, truy cập bằng signed URL)
-- =============================================================================
-- Quy ước đường dẫn tệp: {entity_type}/{entity_id}/{uuid}-{tên tệp}
-- Tải lên: qua server action (kiểm tra quyền + loại tệp + dung lượng) rồi ghi metadata vào public.documents.
-- Xem/tải: server tạo signed URL ngắn hạn sau khi kiểm tra quyền đọc bản ghi documents (RLS).
-- =============================================================================
do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'Bỏ qua cấu hình Storage: không có schema storage (môi trường kiểm thử cục bộ).';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documents', 'documents', false, 10485760, array[
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy documents_bucket_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'documents' and private.has_perm('documents.create'))
  $p$;
  execute $p$
    create policy documents_bucket_select on storage.objects for select to authenticated
    using (bucket_id = 'documents' and exists (
      select 1 from public.documents d where d.bucket = 'documents' and d.storage_path = storage.objects.name
    ))
  $p$;
end
$outer$;

-- >>> 20261016000009_reference_data.sql
-- =============================================================================
-- GHA TMS - 0009: Dữ liệu tham chiếu mặc định (cần có ở mọi môi trường)
-- Đây là cấu hình mặc định theo đặc tả, KHÔNG phải dữ liệu mẫu nghiệp vụ.
-- Quản trị viên có thể sửa/ẩn sau khi triển khai.
-- =============================================================================

insert into public.payment_methods (code, name, requires_bank_account, sort_order) values
  ('cash', 'Tiền mặt', false, 1),
  ('bank_transfer', 'Chuyển khoản', true, 2),
  ('offset', 'Cấn trừ', false, 3),
  ('other', 'Khác', false, 4);

insert into public.banks (code, short_name, name) values
  ('VCB', 'Vietcombank', 'Ngân hàng TMCP Ngoại thương Việt Nam'),
  ('CTG', 'VietinBank', 'Ngân hàng TMCP Công Thương Việt Nam'),
  ('BIDV', 'BIDV', 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam'),
  ('AGRIBANK', 'Agribank', 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam'),
  ('TCB', 'Techcombank', 'Ngân hàng TMCP Kỹ Thương Việt Nam'),
  ('MB', 'MB', 'Ngân hàng TMCP Quân đội'),
  ('ACB', 'ACB', 'Ngân hàng TMCP Á Châu'),
  ('VPB', 'VPBank', 'Ngân hàng TMCP Việt Nam Thịnh Vượng'),
  ('STB', 'Sacombank', 'Ngân hàng TMCP Sài Gòn Thương Tín'),
  ('TPB', 'TPBank', 'Ngân hàng TMCP Tiên Phong');

insert into public.catalogs (code, name, description, is_system) values
  ('province', 'Tỉnh/thành phố', 'Danh sách tỉnh/thành dùng cho địa điểm. Quản trị viên tự nhập theo danh mục hành chính hiện hành.', true),
  ('vehicle_brand', 'Hãng xe', null, true),
  ('contract_type', 'Loại hợp đồng lao động', null, true),
  ('reject_reason', 'Lý do từ chối chuyến', 'Danh sách lý do tài xế chọn khi từ chối chuyến', true),
  ('expense_group', 'Nhóm chi phí', null, true);

insert into public.catalog_items (catalog_id, code, name, sort_order)
select c.id, v.code, v.name, v.ord
from public.catalogs c
join (values
  ('contract_type', 'indefinite', 'Không xác định thời hạn', 1),
  ('contract_type', 'definite', 'Xác định thời hạn', 2),
  ('contract_type', 'probation', 'Thử việc', 3),
  ('contract_type', 'service', 'Hợp đồng dịch vụ / khoán', 4),
  ('reject_reason', 'busy', 'Đang chạy chuyến khác', 1),
  ('reject_reason', 'vehicle_issue', 'Xe gặp sự cố', 2),
  ('reject_reason', 'health', 'Lý do sức khỏe', 3),
  ('reject_reason', 'personal', 'Việc cá nhân', 4),
  ('reject_reason', 'other', 'Lý do khác', 99),
  ('expense_group', 'fuel', 'Nhiên liệu', 1),
  ('expense_group', 'road', 'Cầu đường, bến bãi', 2),
  ('expense_group', 'loading', 'Bốc xếp, nâng hạ', 3),
  ('expense_group', 'vehicle', 'Sửa chữa, bảo dưỡng xe', 4),
  ('expense_group', 'driver', 'Chi phí tài xế', 5),
  ('expense_group', 'other', 'Khác', 99)
) as v(catalog_code, code, name, ord) on v.catalog_code = c.code;

insert into public.expense_categories
  (code, name, group_name, report_bucket, requires_invoice, requires_image, requires_approval, sort_order) values
  ('DIESEL', 'Dầu diesel', 'Nhiên liệu', 'fuel', true, true, true, 1),
  ('GASOLINE', 'Xăng', 'Nhiên liệu', 'fuel', true, true, true, 2),
  ('TOLL', 'Cầu đường', 'Cầu đường, bến bãi', 'toll', false, true, true, 3),
  ('YARD', 'Phí bến bãi', 'Cầu đường, bến bãi', 'loading_yard', false, true, true, 4),
  ('GATE', 'Phí vào cổng', 'Cầu đường, bến bãi', 'loading_yard', false, true, true, 5),
  ('LOADING', 'Bốc xếp', 'Bốc xếp, nâng hạ', 'loading_yard', false, true, true, 6),
  ('LIFTING', 'Nâng hạ', 'Bốc xếp, nâng hạ', 'loading_yard', false, true, true, 7),
  ('TIRE_PATCH', 'Vá lốp', 'Sửa chữa, bảo dưỡng xe', 'repair', false, true, true, 8),
  ('TIRE_REPLACE', 'Thay lốp', 'Sửa chữa, bảo dưỡng xe', 'repair', true, true, true, 9),
  ('REPAIR', 'Sửa chữa', 'Sửa chữa, bảo dưỡng xe', 'repair', true, true, true, 10),
  ('MAINTENANCE', 'Bảo dưỡng', 'Sửa chữa, bảo dưỡng xe', 'repair', true, true, true, 11),
  ('WASH', 'Rửa xe', 'Sửa chữa, bảo dưỡng xe', 'repair', false, false, true, 12),
  ('MEAL', 'Ăn uống', 'Chi phí tài xế', 'driver', false, false, true, 13),
  ('OVERNIGHT', 'Lưu đêm', 'Chi phí tài xế', 'driver', false, false, true, 14),
  ('OTHER', 'Chi phí phát sinh khác', 'Khác', 'other', false, true, true, 99);

insert into public.approval_types (code, name, requires_document, sla_hours, sort_order) values
  ('advance', 'Ứng tiền', false, 24, 1),
  ('expense', 'Duyệt chi phí', true, 48, 2),
  ('invoice_payment', 'Thanh toán hóa đơn', true, 72, 3),
  ('supplier_payment', 'Thanh toán nhà cung cấp', true, 72, 4),
  ('revenue_adjustment', 'Điều chỉnh doanh thu', false, 48, 5),
  ('expense_adjustment', 'Điều chỉnh chi phí', false, 48, 6),
  ('trip_settlement', 'Duyệt quyết toán chuyến', false, 72, 7),
  ('vehicle_repair', 'Duyệt sửa chữa xe', true, 48, 8),
  ('purchase', 'Duyệt mua sắm', true, 72, 9),
  ('other', 'Yêu cầu khác', false, 72, 99);

-- Cấp duyệt mặc định: cấp 1 Kế toán; cấp 2 Giám đốc khi số tiền từ 5.000.000đ (cần xác nhận với Khánh Hà)
insert into public.approval_rules (approval_type_id, level, approver_role_id, min_amount, max_amount)
select t.id, 1, (select id from public.roles where code = 'accountant'), 0, null from public.approval_types t;
insert into public.approval_rules (approval_type_id, level, approver_role_id, min_amount, max_amount)
select t.id, 2, (select id from public.roles where code = 'director'), 5000000, null from public.approval_types t;

-- Hỗ trợ dầu mặc định 39% trên doanh thu cước vận chuyển (cơ sở tính cần xác nhận)
insert into public.fuel_support_rules (scope_type, rate_percent, calculation_base, effective_from, notes)
values ('default', 39, 'freight_revenue', date '2026-01-01',
        'Mặc định theo yêu cầu ban đầu. Cơ sở tính (doanh thu cước / đơn giá / khác) cần Khánh Hà xác nhận.');

insert into public.system_settings (key, value, description, is_public) values
  ('company.name', '"Công ty Vận tải Khánh Hà"', 'Tên doanh nghiệp hiển thị', true),
  ('app.timezone', '"Asia/Ho_Chi_Minh"', 'Múi giờ hệ thống', true),
  ('app.currency', '"VND"', 'Tiền tệ', true),
  ('documents.max_file_mb', '10', 'Dung lượng tối đa mỗi tệp (MB)', true),
  ('approval.allow_self_approval', 'false', 'Cho phép người tạo tự duyệt (mặc định không)', false),
  ('shipment.require_delivery_photo', 'true', 'Bắt buộc ảnh giao hàng khi hoàn thành chuyến', false),
  ('alerts.vehicle_document_days_before', '30', 'Số ngày cảnh báo trước khi giấy tờ xe hết hạn', false);

-- >>> 20261016000010_driver_read.sql
-- =============================================================================
-- GHA TMS - 0010: Hàm đọc dữ liệu cho ứng dụng tài xế
-- Tài xế không có quyền đọc bảng địa điểm/xe/khách hàng; hàm này chỉ trả về
-- thông tin cần thiết của các chuyến được phân công cho chính tài xế đang đăng nhập.
-- =============================================================================
create or replace function public.driver_list_my_shipments(p_include_finished boolean default false)
returns table (
  shipment_id uuid,
  shipment_code text,
  status text,
  pickup_at timestamptz,
  expected_delivery_at timestamptz,
  plate_number text,
  notes text,
  pickup_name text,
  pickup_address text,
  pickup_contact text,
  pickup_phone text,
  pickup_maps_url text,
  pickup_gate_instructions text,
  delivery_name text,
  delivery_address text,
  delivery_contact text,
  delivery_phone text,
  delivery_maps_url text,
  delivery_gate_instructions text,
  assignment_id uuid,
  assignment_response text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.shipment_code, s.status, s.pickup_at, s.expected_delivery_at,
         v.plate_number, s.notes,
         pl.name, pl.full_address, pl.contact_name, pl.phone,
         coalesce(pl.google_maps_url, case when pl.latitude is not null then
           'https://www.google.com/maps/search/?api=1&query=' || pl.latitude || ',' || pl.longitude end),
         pl.gate_instructions,
         dl.name, dl.full_address, dl.contact_name, dl.phone,
         coalesce(dl.google_maps_url, case when dl.latitude is not null then
           'https://www.google.com/maps/search/?api=1&query=' || dl.latitude || ',' || dl.longitude end),
         dl.gate_instructions,
         a.id, a.response
  from public.shipments s
  join public.locations pl on pl.id = s.pickup_location_id
  join public.locations dl on dl.id = s.delivery_location_id
  left join public.vehicles v on v.id = s.vehicle_id
  left join public.shipment_assignments a
    on a.shipment_id = s.id and a.driver_id = s.driver_id and a.response in ('pending', 'accepted')
  where private.has_perm('driver_app.use')
    and s.driver_id = private.my_driver_id()
    and s.status not in ('draft', 'cancelled')
    and (p_include_finished or s.status not in ('closed'))
  order by s.pickup_at desc
  limit 200;
$$;
revoke all on function public.driver_list_my_shipments(boolean) from public, anon;
grant execute on function public.driver_list_my_shipments(boolean) to authenticated;

-- >>> 20261018000011_phase3_master_data.sql
-- =============================================================================
-- GHA TMS - 0011: Giai đoạn 3 - danh mục, trường dữ liệu động, cấu hình bảng
--   * Tự sinh mã danh mục khi để trống (TX001, XE001, KH001...)
--   * Lưu cấu hình bảng theo người dùng (RPC save_table_view)
--   * Trường dữ liệu động: lịch sử phiên bản, khóa thuộc tính không được đổi,
--     phân tích ảnh hưởng trước khi sửa/xóa
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Mã danh mục tự sinh: PREFIX + số thứ tự 3 chữ số, bỏ qua mã đã nhập tay
-- -----------------------------------------------------------------------------
create or replace function private.fill_master_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prefix text := tg_argv[0];
  v integer;
  candidate text;
  taken boolean;
begin
  if new.code is not null and btrim(new.code) <> '' then
    new.code := upper(btrim(new.code));
    return new;
  end if;
  loop
    insert into public.code_sequences as cs (scope, period, last_value)
    values ('master:' || tg_table_name, 'all', 1)
    on conflict (scope, period) do update set last_value = cs.last_value + 1
    returning last_value into v;
    candidate := prefix || lpad(v::text, greatest(3, length(v::text)), '0');
    execute format('select exists (select 1 from %I.%I where code = $1)', tg_table_schema, tg_table_name)
      into taken using candidate;
    exit when not taken;
  end loop;
  new.code := candidate;
  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('vehicles', 'XE'), ('drivers', 'TX'), ('customers', 'KH'), ('suppliers', 'NCC'),
    ('locations', 'DD'), ('routes', 'TD'), ('transport_price_lists', 'BG'),
    ('expense_categories', 'CP'), ('vehicle_types', 'LX'), ('company_entities', 'DV')
  ) as t(tbl, prefix) loop
    execute format('alter table public.%I alter column code set default %L', r.tbl, '');
    execute format(
      'create trigger trg_%s_code before insert on public.%I for each row execute function private.fill_master_code(%L)',
      r.tbl, r.tbl, r.prefix);
  end loop;
end $$;

-- custom_fields luôn là object JSON
do $$
declare t text;
begin
  foreach t in array array['vehicles', 'drivers', 'customers', 'suppliers', 'locations', 'transport_orders', 'shipments'] loop
    execute format('alter table public.%I add constraint %I check (jsonb_typeof(custom_fields) = ''object'')', t, t || '_custom_fields_object');
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Cấu hình bảng theo người dùng
-- -----------------------------------------------------------------------------
create or replace function public.save_table_view(p_table_key text, p_config jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'Tài khoản chưa được cấp quyền' using errcode = '42501';
  end if;
  if jsonb_typeof(p_config) <> 'object' then
    raise exception 'Cấu hình bảng không hợp lệ' using errcode = '22023';
  end if;
  update public.table_view_preferences
     set config = p_config
   where table_key = p_table_key and scope = 'user' and user_id = auth.uid() and name = 'Mặc định';
  if not found then
    insert into public.table_view_preferences (table_key, scope, user_id, name, is_default, config)
    values (p_table_key, 'user', auth.uid(), 'Mặc định', true, p_config);
  end if;
end;
$$;
revoke all on function public.save_table_view(text, jsonb) from public, anon;
grant execute on function public.save_table_view(text, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Trường dữ liệu động
-- -----------------------------------------------------------------------------
-- Các module được phép thêm trường động và bảng tương ứng
create or replace function private.custom_field_table(p_module text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_module
    when 'vehicles' then 'vehicles'
    when 'drivers' then 'drivers'
    when 'customers' then 'customers'
    when 'suppliers' then 'suppliers'
    when 'locations' then 'locations'
    when 'shipments' then 'shipments'
    when 'transport_orders' then 'transport_orders'
  end;
$$;

-- Số bản ghi đang có giá trị cho một trường động
create or replace function private.custom_field_usage(p_module text, p_field_key text)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  tbl text := private.custom_field_table(p_module);
  n bigint;
begin
  if tbl is null then return 0; end if;
  execute format(
    'select count(*) from public.%I where custom_fields ? $1 and custom_fields -> $1 not in (''null''::jsonb, ''""''::jsonb, ''[]''::jsonb)',
    tbl) into n using p_field_key;
  return n;
end;
$$;

alter table public.field_definitions
  add constraint field_definitions_module_allowed check (private.custom_field_table(module) is not null);

create or replace function private.guard_field_definitions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  used bigint;
begin
  if tg_op = 'DELETE' then
    if old.field_kind = 'system' then
      raise exception 'Không được xóa trường hệ thống' using errcode = '42501';
    end if;
    used := private.custom_field_usage(old.module, old.field_key);
    if used > 0 then
      raise exception 'Trường "%" đang có dữ liệu ở % bản ghi. Hãy chuyển sang Ngừng sử dụng thay vì xóa.', old.label, used
        using errcode = '42501';
    end if;
    if exists (select 1 from public.field_definitions f
               where f.module = old.module and f.id <> old.id and f.status = 'active'
                 and f.formula ~ ('\m' || old.field_key || '\M')) then
      raise exception 'Trường "%" đang được dùng trong công thức của trường khác.', old.label using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if new.module <> old.module or new.field_key <> old.field_key then
      raise exception 'Không được đổi module hoặc mã trường sau khi tạo' using errcode = '42501';
    end if;
    if new.field_kind = 'system' or old.field_kind = 'system' then
      if new.data_type <> old.data_type or new.field_kind <> old.field_kind then
        raise exception 'Không được đổi kiểu của trường hệ thống' using errcode = '42501';
      end if;
    end if;
    if new.data_type <> old.data_type then
      used := private.custom_field_usage(old.module, old.field_key);
      if used > 0 then
        raise exception 'Không thể đổi kiểu dữ liệu: trường "%" đang có dữ liệu ở % bản ghi.', old.label, used
          using errcode = '42501';
      end if;
    end if;
    if (to_jsonb(new) - array['updated_at', 'updated_by', 'version']) is distinct from (to_jsonb(old) - array['updated_at', 'updated_by', 'version']) then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
  end if;
  return new;
end;
$$;
-- Thay thế trigger của 0006 (thêm kiểm tra dữ liệu đang dùng, chỉ tăng phiên bản khi nội dung đổi)
drop trigger if exists trg_field_definitions_guard on public.field_definitions;
drop trigger if exists trg_field_definitions_version on public.field_definitions;
drop function if exists private.version_field_definitions();
create trigger trg_field_definitions_guard before update or delete on public.field_definitions
for each row execute function private.guard_field_definitions();

-- Lưu ảnh chụp mỗi phiên bản (bảng phiên bản không mở ghi cho người dùng)
create or replace function private.snapshot_field_definition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.version <> old.version then
    insert into public.field_definition_versions (field_id, version, snapshot, change_note, changed_by)
    values (new.id, new.version, to_jsonb(new) - array['created_at', 'updated_at', 'created_by', 'updated_by'],
            nullif(current_setting('gha.change_note', true), ''), auth.uid());
  end if;
  return null;
end;
$$;
create trigger trg_field_definitions_snapshot after insert or update on public.field_definitions
for each row execute function private.snapshot_field_definition();

-- Ghi chú thay đổi cho phiên bản (đặt trong cùng transaction với câu lệnh sửa)
create or replace function public.save_field_definition(p_id uuid, p_values jsonb, p_change_note text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.has_perm('fields.configure') then
    raise exception 'Bạn không có quyền cấu hình trường dữ liệu' using errcode = '42501';
  end if;
  perform set_config('gha.change_note', coalesce(p_change_note, ''), true);
  if p_id is null then
    insert into public.field_definitions (
      module, field_key, label, description, field_kind, data_type, is_required, is_editable, is_visible,
      is_searchable, is_filterable, is_sortable, default_value, display_format, sort_order,
      view_permission, edit_permission, validation, formula, options, reference_target, status)
    select r.module, r.field_key, r.label, r.description, coalesce(r.field_kind, 'business'), r.data_type,
           coalesce(r.is_required, false), coalesce(r.is_editable, true), coalesce(r.is_visible, true),
           coalesce(r.is_searchable, false), coalesce(r.is_filterable, false), coalesce(r.is_sortable, false),
           r.default_value, r.display_format, coalesce(r.sort_order, 0), r.view_permission, r.edit_permission,
           coalesce(r.validation, '{}'::jsonb), r.formula, coalesce(r.options, '[]'::jsonb), r.reference_target,
           coalesce(r.status, 'active')
    from jsonb_populate_record(null::public.field_definitions, p_values) r
    returning id into v_id;
  else
    update public.field_definitions f set
      label = r.label, description = r.description, data_type = r.data_type,
      is_required = coalesce(r.is_required, false), is_editable = coalesce(r.is_editable, true),
      is_visible = coalesce(r.is_visible, true), is_searchable = coalesce(r.is_searchable, false),
      is_filterable = coalesce(r.is_filterable, false), is_sortable = coalesce(r.is_sortable, false),
      default_value = r.default_value, display_format = r.display_format, sort_order = coalesce(r.sort_order, 0),
      view_permission = r.view_permission, edit_permission = r.edit_permission,
      validation = coalesce(r.validation, '{}'::jsonb), formula = r.formula, options = coalesce(r.options, '[]'::jsonb),
      reference_target = r.reference_target, status = coalesce(r.status, 'active')
    from jsonb_populate_record(null::public.field_definitions, p_values) r
    where f.id = p_id
    returning f.id into v_id;
    if v_id is null then
      raise exception 'Không tìm thấy trường dữ liệu' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.save_field_definition(uuid, jsonb, text) from public, anon;
grant execute on function public.save_field_definition(uuid, jsonb, text) to authenticated;

-- Phân tích ảnh hưởng trước khi sửa/ngừng/xóa trường
create or replace function public.field_impact(p_field_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  f public.field_definitions;
begin
  if not (private.has_perm('fields.view') or private.has_perm('fields.configure')) then
    raise exception 'Bạn không có quyền xem trường dữ liệu' using errcode = '42501';
  end if;
  select * into f from public.field_definitions where id = p_field_id;
  if not found then
    raise exception 'Không tìm thấy trường dữ liệu' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'records_with_value', private.custom_field_usage(f.module, f.field_key),
    'used_in_formulas', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'field_key', o.field_key) order by o.label)
      from public.field_definitions o
      where o.module = f.module and o.id <> f.id and o.formula ~ ('\m' || f.field_key || '\M')
    ), '[]'::jsonb),
    'used_in_visibility', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.label)
      from public.field_definitions o
      where o.module = f.module and o.id <> f.id and o.visibility_condition ~ ('\m' || f.field_key || '\M')
    ), '[]'::jsonb),
    -- Báo cáo và quy trình dùng trường động sẽ được kiểm tra khi các module đó hoàn thiện (GĐ6-7)
    'versions', (select count(*) from public.field_definition_versions v where v.field_id = f.id)
  );
end;
$$;
revoke all on function public.field_impact(uuid) from public, anon;
grant execute on function public.field_impact(uuid) to authenticated;

-- Khôi phục một phiên bản cũ (tạo phiên bản mới với nội dung cũ)
create or replace function public.restore_field_version(p_field_id uuid, p_version integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  snap jsonb;
begin
  if not private.has_perm('fields.configure') then
    raise exception 'Bạn không có quyền cấu hình trường dữ liệu' using errcode = '42501';
  end if;
  select snapshot into snap from public.field_definition_versions where field_id = p_field_id and version = p_version;
  if snap is null then
    raise exception 'Không tìm thấy phiên bản' using errcode = 'P0002';
  end if;
  perform public.save_field_definition(p_field_id, snap, 'Khôi phục phiên bản ' || p_version);
end;
$$;
revoke all on function public.restore_field_version(uuid, integer) from public, anon;
grant execute on function public.restore_field_version(uuid, integer) to authenticated;

-- >>> 20261021000012_dashboard_stats.sql
-- =============================================================================
-- Số liệu biểu đồ trang Tổng quan, tính trực tiếp từ bảng chuyến (không lưu bảng tổng hợp).
-- security invoker: RLS của shipments / transport_orders / customers vẫn áp dụng cho người gọi.
-- =============================================================================

create or replace function public.dashboard_shipment_stats(p_today date default (now() at time zone 'Asia/Ho_Chi_Minh')::date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with s as (
    select sh.status,
           (sh.pickup_at at time zone 'Asia/Ho_Chi_Minh')::date as d,
           o.customer_id
    from public.shipments sh
    join public.transport_orders o on o.id = sh.order_id
    where sh.pickup_at >= ((date_trunc('month', p_today) - interval '5 months')::date)::timestamp at time zone 'Asia/Ho_Chi_Minh'
      and sh.pickup_at < ((p_today + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
  ),
  live as (select * from s where status <> 'cancelled'),
  month_start as (select date_trunc('month', p_today)::date as m),
  prev as (
    -- cùng kỳ tháng trước: từ ngày 1 đến cùng ngày (hoặc ngày cuối tháng nếu tháng trước ngắn hơn)
    select (date_trunc('month', p_today) - interval '1 month')::date as m0,
           least((date_trunc('month', p_today) - interval '1 month')::date + (extract(day from p_today)::int - 1),
                 (date_trunc('month', p_today) - interval '1 day')::date) as m1
  )
  select jsonb_build_object(
    'today', (select count(*) from live where d = p_today),
    'yesterday', (select count(*) from live where d = p_today - 1),
    'month_to_date', (select count(*) from live, month_start where d >= m),
    'prev_month_to_date', (select count(*) from live, prev where d between m0 and m1),
    'completed_mtd', (select count(*) from live, month_start where d >= m and status in ('driver_completed', 'closed')),
    'completed_prev_mtd', (select count(*) from live, prev where d between m0 and m1 and status in ('driver_completed', 'closed')),
    'daily', (
      select jsonb_agg(jsonb_build_object('date', g.ts::date, 'total', coalesce(c.n, 0)) order by g.ts)
      from generate_series((p_today - 13)::timestamp, p_today::timestamp, interval '1 day') as g(ts)
      left join (select d, count(*) as n from live group by d) c on c.d = g.ts::date
    ),
    'monthly', (
      select jsonb_agg(jsonb_build_object('month', to_char(g.m, 'YYYY-MM'), 'total', coalesce(c.n, 0), 'completed', coalesce(c.done, 0)) order by g.m)
      from generate_series(date_trunc('month', p_today::timestamp) - interval '5 months', date_trunc('month', p_today::timestamp), interval '1 month') as g(m)
      left join (
        select date_trunc('month', d::timestamp) as m, count(*) as n, count(*) filter (where status in ('driver_completed', 'closed')) as done
        from live group by 1
      ) c on c.m = g.m
    ),
    'by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
      from (select status, count(*) as n from s, month_start where d >= m group by status) x
    ),
    'top_customers', (
      select coalesce(jsonb_agg(jsonb_build_object('id', x.customer_id, 'name', coalesce(c.name, 'Khách hàng'), 'total', x.n) order by x.n desc, c.name), '[]'::jsonb)
      from (
        select customer_id, count(*) as n from live, month_start where d >= m group by customer_id order by n desc limit 5
      ) x
      left join public.customers c on c.id = x.customer_id
    )
  );
$$;

revoke all on function public.dashboard_shipment_stats(date) from public, anon;
grant execute on function public.dashboard_shipment_stats(date) to authenticated;

-- >>> 20261021000013_dispatch.sql
-- =============================================================================
-- KHÁNH HÀ TMS - 0013: Điều phối (Giai đoạn 4)
--   1. Bỏ khái niệm "tài xế từ chối chuyến" (Khánh Hà xác nhận 2026-10-21)
--   2. Tự tính tiền hỗ trợ dầu từ tham số đã chụp trên chuyến
--   3. Hàm nghiệp vụ: tạo đơn hàng nhiều chuyến, phân công, gỡ phân công, hủy chuyến
--   4. View danh sách chuyến cho bảng điều phối / bảng tổng hợp
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Bỏ trạng thái từ chối
-- -----------------------------------------------------------------------------
update public.shipments set status = 'assigned' where status = 'rejected';
update public.shipment_assignments set response = 'superseded' where response = 'rejected';

alter table public.shipments drop constraint shipments_status_check;
alter table public.shipments add constraint shipments_status_check
  check (status in ('draft', 'assigned', 'accepted', 'in_transit', 'driver_completed', 'closed', 'cancelled'));

alter table public.shipment_assignments drop constraint shipment_assignments_check;
alter table public.shipment_assignments drop constraint shipment_assignments_response_check;
alter table public.shipment_assignments add constraint shipment_assignments_response_check
  check (response in ('pending', 'accepted', 'superseded'));
alter table public.shipment_assignments drop column reject_reason;

create or replace function private.shipment_transition_allowed(from_s text, to_s text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select from_s = to_s or (from_s, to_s) in (
    ('draft', 'assigned'), ('draft', 'cancelled'),
    ('assigned', 'accepted'), ('assigned', 'draft'), ('assigned', 'cancelled'),
    ('accepted', 'in_transit'), ('accepted', 'assigned'), ('accepted', 'draft'), ('accepted', 'cancelled'),
    ('in_transit', 'driver_completed'), ('in_transit', 'cancelled'),
    ('driver_completed', 'in_transit'), ('driver_completed', 'closed'),
    ('closed', 'driver_completed')
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. Tiền hỗ trợ dầu = tỷ lệ × cơ sở tính, tính lại mỗi khi giá/số lượng đổi.
--    Cơ sở 'fuel_norm' / 'formula' giữ nguyên số tiền đã tính lúc tạo chuyến.
-- -----------------------------------------------------------------------------
create or replace function private.shipments_fuel_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fuel_support_rate is not null and new.fuel_support_base in ('freight_revenue', 'unit_price', 'total_revenue') then
    new.fuel_support_amount := round(
      case new.fuel_support_base
        when 'freight_revenue' then round(new.unit_price * new.quantity, 0)
        when 'unit_price' then new.unit_price
        else round(new.unit_price * new.quantity, 0) + new.surcharge_amount
      end * new.fuel_support_rate / 100, 0);
  end if;
  return new;
end;
$$;
create trigger trg_shipments_pricing before insert or update on public.shipments
for each row execute function private.shipments_fuel_amount();

-- -----------------------------------------------------------------------------
-- 3. Hàm nghiệp vụ
-- -----------------------------------------------------------------------------

-- Bảng giá ứng viên (đọc với quyền hệ thống: người tạo chuyến không cần quyền xem bảng giá)
create or replace function private.price_candidates(
  p_customer_id uuid, p_pickup uuid, p_delivery uuid, p_vehicle_type uuid, p_on date
)
returns table (
  id uuid, code text, unit_price numeric, pricing_unit text, pricing_unit_label text,
  fuel_support_rate numeric, surcharge_amount numeric, specificity integer, priority integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select pl.id, pl.code, pl.unit_price, pl.pricing_unit, pl.pricing_unit_label, pl.fuel_support_rate, pl.surcharge_amount,
         ((pl.customer_id is not null)::int * 8 + (pl.pickup_location_id is not null)::int * 2
          + (pl.delivery_location_id is not null)::int * 2 + (pl.vehicle_type_id is not null)::int * 4),
         pl.priority
  from public.transport_price_lists pl
  where pl.status = 'active'
    and p_on between pl.effective_from and coalesce(pl.effective_to, 'infinity'::date)
    and (pl.customer_id is null or pl.customer_id = p_customer_id)
    and (pl.pickup_location_id is null or pl.pickup_location_id = p_pickup)
    and (pl.delivery_location_id is null or pl.delivery_location_id = p_delivery)
    and (pl.vehicle_type_id is null or pl.vehicle_type_id = p_vehicle_type)
  order by 8 desc, pl.priority desc, pl.effective_from desc;
$$;
revoke all on function private.price_candidates(uuid, uuid, uuid, uuid, date) from public;
grant execute on function private.price_candidates(uuid, uuid, uuid, uuid, date) to authenticated;

-- Quy tắc hỗ trợ dầu theo thứ tự ưu tiên: khách hàng + tuyến > tuyến > khách hàng > loại xe > mặc định
create or replace function private.fuel_rule_for(p_customer_id uuid, p_route_id uuid, p_vehicle_type uuid, p_on date)
returns public.fuel_support_rules
language sql
stable
security definer
set search_path = ''
as $$
  select r.* from public.fuel_support_rules r
  where r.is_active
    and p_on between r.effective_from and coalesce(r.effective_to, 'infinity'::date)
    and (
      (r.scope_type = 'customer_route' and r.customer_id = p_customer_id and r.route_id = p_route_id)
      or (r.scope_type = 'route' and r.route_id = p_route_id)
      or (r.scope_type = 'customer' and r.customer_id = p_customer_id)
      or (r.scope_type = 'vehicle_type' and r.vehicle_type_id = p_vehicle_type)
      or r.scope_type = 'default'
    )
  order by case r.scope_type when 'customer_route' then 1 when 'route' then 2 when 'customer' then 3 when 'vehicle_type' then 4 else 5 end
  limit 1;
$$;
revoke all on function private.fuel_rule_for(uuid, uuid, uuid, date) from public;
grant execute on function private.fuel_rule_for(uuid, uuid, uuid, date) to authenticated;

-- Báo giá cho một chuyến (dùng ở màn hình tạo đơn để hiển thị trước khi lưu)
create or replace function public.quote_shipment(
  p_customer_id uuid, p_pickup uuid, p_delivery uuid, p_vehicle_type uuid, p_on date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_route public.routes;
  v_rule public.fuel_support_rules;
  v_candidates jsonb;
begin
  if not (private.has_perm('dispatch.create') or private.has_perm('dispatch.update')) then
    raise exception 'Bạn không có quyền tạo chuyến' using errcode = '42501';
  end if;
  select * into v_route from public.routes r
  where r.pickup_location_id = p_pickup and r.delivery_location_id = p_delivery and r.is_active;
  v_rule := private.fuel_rule_for(p_customer_id, v_route.id, p_vehicle_type, p_on);
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_candidates
  from private.price_candidates(p_customer_id, p_pickup, p_delivery, p_vehicle_type, p_on) c;
  return jsonb_build_object(
    'route', case when v_route.id is null then null else jsonb_build_object('id', v_route.id, 'name', v_route.name, 'distance_km', v_route.distance_km) end,
    'candidates', v_candidates,
    'fuel_rule', case when v_rule.id is null then null else jsonb_build_object(
      'id', v_rule.id, 'scope_type', v_rule.scope_type, 'rate_percent', v_rule.rate_percent, 'calculation_base', v_rule.calculation_base) end
  );
end;
$$;
revoke all on function public.quote_shipment(uuid, uuid, uuid, uuid, date) from public, anon;
grant execute on function public.quote_shipment(uuid, uuid, uuid, uuid, date) to authenticated;

-- Phân công / đổi / gỡ phân công (p_driver_id null = gỡ, chuyến về Nháp)
create or replace function public.assign_shipment(p_shipment_id uuid, p_driver_id uuid, p_vehicle_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.shipments;
  a public.shipment_assignments;
  v_driver_status text;
begin
  if not private.has_perm('dispatch.update') then
    raise exception 'Bạn không có quyền phân công chuyến' using errcode = '42501';
  end if;
  select * into s from public.shipments where id = p_shipment_id for update;
  if s.id is null then
    raise exception 'Không tìm thấy chuyến' using errcode = 'P0001';
  end if;
  if s.status not in ('draft', 'assigned', 'accepted') then
    raise exception 'Chỉ phân công được chuyến chưa chạy (Nháp, Chờ tài xế nhận, Tài xế đã nhận)' using errcode = '22023';
  end if;
  if p_driver_id is not null then
    select status into v_driver_status from public.drivers where id = p_driver_id and archived_at is null;
    if v_driver_status is null then
      raise exception 'Tài xế không tồn tại hoặc đã lưu trữ' using errcode = 'P0001';
    end if;
    if v_driver_status <> 'active' then
      raise exception 'Tài xế không ở trạng thái đang làm việc' using errcode = '22023';
    end if;
  end if;
  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id = p_vehicle_id and v.archived_at is null and v.status in ('active', 'maintenance')
  ) then
    raise exception 'Xe không tồn tại hoặc đã ngừng hoạt động' using errcode = 'P0001';
  end if;

  select * into a from public.shipment_assignments where shipment_id = s.id and response in ('pending', 'accepted');

  -- Cùng tài xế: chỉ đổi xe, giữ phân công
  if p_driver_id is not null and a.id is not null and a.driver_id = p_driver_id then
    update public.shipment_assignments set vehicle_id = p_vehicle_id where id = a.id;
    update public.shipments set vehicle_id = p_vehicle_id, driver_id = p_driver_id,
      status = case when status = 'draft' then 'assigned' else status end
    where id = s.id;
    return;
  end if;

  if a.id is not null then
    update public.shipment_assignments set response = 'superseded', responded_at = now() where id = a.id;
  end if;

  if p_driver_id is null then
    update public.shipments set driver_id = null, vehicle_id = p_vehicle_id, status = 'draft' where id = s.id;
  else
    insert into public.shipment_assignments (shipment_id, driver_id, vehicle_id, assigned_by)
    values (s.id, p_driver_id, p_vehicle_id, auth.uid());
    update public.shipments set driver_id = p_driver_id, vehicle_id = p_vehicle_id, status = 'assigned' where id = s.id;
  end if;
end;
$$;
revoke all on function public.assign_shipment(uuid, uuid, uuid) from public, anon;
grant execute on function public.assign_shipment(uuid, uuid, uuid) to authenticated;

-- Hủy chuyến (bắt buộc lý do, không xóa)
create or replace function public.cancel_shipment(p_shipment_id uuid, p_reason text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
begin
  if not (private.has_perm('dispatch.delete') or private.has_perm('shipments.delete')) then
    raise exception 'Bạn không có quyền hủy chuyến' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'Vui lòng nhập lý do hủy chuyến' using errcode = '22023';
  end if;
  select status into v_status from public.shipments where id = p_shipment_id for update;
  if v_status is null then
    raise exception 'Không tìm thấy chuyến' using errcode = 'P0001';
  end if;
  if v_status not in ('draft', 'assigned', 'accepted', 'in_transit') then
    raise exception 'Chuyến đã hoàn thành, đã đóng hoặc đã hủy, không hủy được' using errcode = '22023';
  end if;
  update public.shipment_assignments set response = 'superseded', responded_at = now()
  where shipment_id = p_shipment_id and response in ('pending', 'accepted');
  update public.shipments set status = 'cancelled', cancel_reason = trim(p_reason) where id = p_shipment_id;
end;
$$;
revoke all on function public.cancel_shipment(uuid, text) from public, anon;
grant execute on function public.cancel_shipment(uuid, text) to authenticated;

-- Tạo đơn hàng gồm nhiều chuyến (hoặc thêm chuyến vào đơn đang mở khi p_order có "id").
-- Giá và hỗ trợ dầu được xác định ở máy chủ và chụp lại trên từng chuyến.
create or replace function public.create_transport_order(p_order jsonb, p_shipments jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  o public.transport_orders;
  item jsonb;
  v_seq integer;
  v_pickup_at timestamptz;
  v_on date;
  v_pickup uuid;
  v_delivery uuid;
  v_vtype uuid;
  v_route public.routes;
  v_pl record;
  v_top record;
  v_n integer;
  v_tied boolean;
  v_unit_price numeric;
  v_pricing_unit text;
  v_surcharge numeric;
  v_rate numeric;
  v_base text;
  v_fuel_amount numeric;
  v_rule public.fuel_support_rules;
  v_rule_id uuid;
  v_fuel_source text;
  v_norm numeric;
  v_snapshot jsonb;
  v_new public.shipments;
  v_driver uuid;
  v_vehicle uuid;
  v_out jsonb := '[]'::jsonb;
  v_idx integer := 0;
begin
  if not private.has_perm('dispatch.create') then
    raise exception 'Bạn không có quyền tạo đơn hàng' using errcode = '42501';
  end if;
  if jsonb_typeof(p_shipments) <> 'array' or jsonb_array_length(p_shipments) = 0 then
    raise exception 'Đơn hàng phải có ít nhất một chuyến' using errcode = '22023';
  end if;
  if jsonb_array_length(p_shipments) > 100 then
    raise exception 'Mỗi lần chỉ tạo tối đa 100 chuyến' using errcode = '22023';
  end if;

  if p_order ? 'id' then
    select * into o from public.transport_orders where id = (p_order ->> 'id')::uuid for update;
    if o.id is null then
      raise exception 'Không tìm thấy đơn hàng' using errcode = 'P0001';
    end if;
    if o.status <> 'open' then
      raise exception 'Đơn hàng đã hoàn thành hoặc đã hủy, không thêm chuyến được' using errcode = '22023';
    end if;
  else
    insert into public.transport_orders (order_date, company_entity_id, customer_id, payer_customer_id, dispatcher_id, notes)
    values (
      coalesce((p_order ->> 'order_date')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
      nullif(p_order ->> 'company_entity_id', '')::uuid,
      (p_order ->> 'customer_id')::uuid,
      coalesce(nullif(p_order ->> 'payer_customer_id', '')::uuid, (p_order ->> 'customer_id')::uuid),
      auth.uid(),
      nullif(trim(p_order ->> 'notes'), '')
    )
    returning * into o;
  end if;

  select coalesce(max(sequence_in_order), 0) into v_seq from public.shipments where order_id = o.id;

  for item in select * from jsonb_array_elements(p_shipments) loop
    v_idx := v_idx + 1;
    v_seq := v_seq + 1;
    v_pickup_at := (item ->> 'pickup_at')::timestamptz;
    if v_pickup_at is null then
      raise exception 'Chuyến %: chưa nhập thời gian nhận hàng', v_idx using errcode = '22023';
    end if;
    v_on := (v_pickup_at at time zone 'Asia/Ho_Chi_Minh')::date;
    v_pickup := nullif(item ->> 'pickup_location_id', '')::uuid;
    v_delivery := nullif(item ->> 'delivery_location_id', '')::uuid;
    v_vtype := nullif(item ->> 'vehicle_type_id', '')::uuid;
    if v_pickup is null or v_delivery is null then
      raise exception 'Chuyến %: chưa chọn điểm nhận hoặc điểm giao', v_idx using errcode = '22023';
    end if;
    select * into v_route from public.routes r
    where r.pickup_location_id = v_pickup and r.delivery_location_id = v_delivery and r.is_active;

    -- Bảng giá: ứng viên tốt nhất; nếu hai dòng đầu ngang nhau thì người dùng phải chọn
    select count(*) into v_n from private.price_candidates(o.customer_id, v_pickup, v_delivery, v_vtype, v_on);
    select * into v_top from private.price_candidates(o.customer_id, v_pickup, v_delivery, v_vtype, v_on) limit 1;
    select count(*) > 1 into v_tied from private.price_candidates(o.customer_id, v_pickup, v_delivery, v_vtype, v_on) c
    where c.specificity = v_top.specificity and c.priority = v_top.priority;

    select * into v_pl from private.price_candidates(o.customer_id, v_pickup, v_delivery, v_vtype, v_on) c where false;
    if nullif(item ->> 'price_list_id', '') is not null then
      select * into v_pl from private.price_candidates(o.customer_id, v_pickup, v_delivery, v_vtype, v_on) c
      where c.id = (item ->> 'price_list_id')::uuid;
      if v_pl.id is null then
        raise exception 'Chuyến %: bảng giá đã chọn không áp dụng cho chuyến này', v_idx using errcode = '22023';
      end if;
    elsif v_n > 0 then
      if v_tied then
        raise exception 'Chuyến %: có nhiều bảng giá ngang nhau, vui lòng chọn một bảng giá', v_idx using errcode = '22023';
      end if;
      v_pl := v_top;
    end if;

    if v_pl.id is not null then
      v_unit_price := v_pl.unit_price;
      v_pricing_unit := v_pl.pricing_unit;
      v_surcharge := coalesce(nullif(item ->> 'surcharge_amount', '')::numeric, v_pl.surcharge_amount, 0);
    else
      -- Không có bảng giá: điều phối nhập giá thủ công
      v_unit_price := nullif(item ->> 'unit_price', '')::numeric;
      if v_unit_price is null then
        raise exception 'Chuyến %: không có bảng giá phù hợp, vui lòng nhập đơn giá', v_idx using errcode = '22023';
      end if;
      v_pricing_unit := coalesce(nullif(item ->> 'pricing_unit', ''), 'trip');
      v_surcharge := coalesce(nullif(item ->> 'surcharge_amount', '')::numeric, 0);
    end if;

    -- Hỗ trợ dầu: nhập tay trên chuyến > bảng giá > quy tắc
    v_rule_id := null;
    v_fuel_amount := 0;
    if nullif(item ->> 'fuel_support_rate', '') is not null then
      v_rate := (item ->> 'fuel_support_rate')::numeric;
      v_base := 'freight_revenue';
      v_fuel_source := 'manual';
    elsif v_pl.id is not null and v_pl.fuel_support_rate is not null then
      v_rate := v_pl.fuel_support_rate;
      v_base := 'freight_revenue';
      v_fuel_source := 'price_list';
    else
      v_rule := private.fuel_rule_for(o.customer_id, v_route.id, v_vtype, v_on);
      if v_rule.id is null then
        v_rate := null;
        v_base := null;
        v_fuel_source := 'none';
      else
        v_rule_id := v_rule.id;
        v_rate := v_rule.rate_percent;
        v_base := v_rule.calculation_base;
        v_fuel_source := 'rule:' || v_rule.scope_type;
        if v_base = 'fuel_norm' then
          -- Định mức xe (nếu đã chọn xe) hoặc của quy tắc × quãng đường tuyến × giá dầu tham chiếu
          select coalesce(v.fuel_norm_l_per_100km, v_rule.fuel_norm_l_per_100km) into v_norm
          from (select 1) x left join public.vehicles v on v.id = nullif(item ->> 'vehicle_id', '')::uuid;
          v_fuel_amount := coalesce(round(v_route.distance_km * v_norm / 100 * v_rule.reference_fuel_price, 0), 0);
        end if;
      end if;
    end if;

    v_snapshot := jsonb_build_object(
      'quoted_at', now(),
      'price_source', case when v_pl.id is null then 'manual' else 'price_list' end,
      'price_list_code', v_pl.code,
      'price_specificity', v_pl.specificity,
      'price_priority', v_pl.priority,
      'route_name', v_route.name,
      'route_distance_km', v_route.distance_km,
      'fuel_source', v_fuel_source,
      'fuel_rate', v_rate,
      'fuel_base', v_base
    );

    v_driver := nullif(item ->> 'driver_id', '')::uuid;
    v_vehicle := nullif(item ->> 'vehicle_id', '')::uuid;

    insert into public.shipments (
      order_id, sequence_in_order, pickup_at, expected_delivery_at, pickup_location_id, delivery_location_id,
      route_id, vehicle_type_id, vehicle_id, price_list_id, unit_price, pricing_unit, quantity, surcharge_amount,
      fuel_support_rate, fuel_support_base, fuel_support_amount, fuel_support_rule_id, pricing_snapshot, notes
    ) values (
      o.id, v_seq, v_pickup_at, nullif(item ->> 'expected_delivery_at', '')::timestamptz, v_pickup, v_delivery,
      v_route.id, v_vtype, v_vehicle, v_pl.id, v_unit_price, v_pricing_unit,
      coalesce(nullif(item ->> 'quantity', '')::numeric, 1), v_surcharge,
      v_rate, v_base, v_fuel_amount, v_rule_id, v_snapshot, nullif(trim(item ->> 'notes'), '')
    )
    returning * into v_new;

    if v_driver is not null then
      perform public.assign_shipment(v_new.id, v_driver, v_vehicle);
    end if;

    v_out := v_out || jsonb_build_object('id', v_new.id, 'shipment_code', v_new.shipment_code);
  end loop;

  return jsonb_build_object('order_id', o.id, 'order_code', o.order_code, 'shipments', v_out);
end;
$$;
revoke all on function public.create_transport_order(jsonb, jsonb) from public, anon;
grant execute on function public.create_transport_order(jsonb, jsonb) to authenticated;

-- Thông báo cho tài xế khi được phân công (bảng notifications không cho người dùng tự ghi)
create or replace function private.notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_code text;
begin
  select d.profile_id into v_profile from public.drivers d where d.id = new.driver_id;
  if v_profile is null then
    return new;
  end if;
  select s.shipment_code into v_code from public.shipments s where s.id = new.shipment_id;
  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, link)
  values (v_profile, 'shipment_assigned', 'Bạn được phân công chuyến ' || v_code,
          'Mở ứng dụng tài xế để xem điểm nhận, điểm giao và giờ nhận hàng.', 'shipment', new.shipment_id, '/tx');
  return new;
end;
$$;
create trigger trg_assignment_notify after insert on public.shipment_assignments
for each row execute function private.notify_assignment();

-- -----------------------------------------------------------------------------
-- 4. View danh sách chuyến (security invoker: RLS của từng bảng vẫn áp dụng)
-- -----------------------------------------------------------------------------
create view public.shipment_list with (security_invoker = true) as
select
  s.id, s.shipment_code, s.order_id, o.order_code, s.sequence_in_order,
  o.customer_id, c.name as customer_name, c.code as customer_code,
  s.pickup_at, s.expected_delivery_at,
  s.pickup_location_id, pl.name as pickup_name,
  s.delivery_location_id, dl.name as delivery_name,
  s.vehicle_type_id, vt.name as vehicle_type_name,
  s.vehicle_id, v.plate_number,
  s.driver_id, d.full_name as driver_name, d.code as driver_code,
  s.price_list_id, s.unit_price, s.pricing_unit, s.quantity, s.freight_amount, s.surcharge_amount,
  s.fuel_support_rate, s.fuel_support_base, s.fuel_support_amount,
  s.freight_amount + s.surcharge_amount + s.fuel_support_amount as total_revenue,
  s.status, s.document_status, s.settlement_status,
  s.notes, s.version, s.created_at, s.updated_at
from public.shipments s
join public.transport_orders o on o.id = s.order_id
left join public.customers c on c.id = o.customer_id
left join public.locations pl on pl.id = s.pickup_location_id
left join public.locations dl on dl.id = s.delivery_location_id
left join public.vehicle_types vt on vt.id = s.vehicle_type_id
left join public.vehicles v on v.id = s.vehicle_id
left join public.drivers d on d.id = s.driver_id;
revoke all on public.shipment_list from anon;
grant select on public.shipment_list to authenticated;

-- Tên hiển thị của người thao tác (lịch sử chuyến, người tạo đơn) cho người không có quyền xem danh sách người dùng.
-- Chỉ trả họ tên (hoặc phần trước @ của email), không trả email/điện thoại.
create or replace function public.user_display_names(p_ids uuid[])
returns table (id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1))
  from public.profiles p
  where private.is_active_user() and p.id = any (p_ids[1:200]);
$$;
revoke all on function public.user_display_names(uuid[]) from public, anon;
grant execute on function public.user_display_names(uuid[]) to authenticated;

-- Tổng hợp theo bộ lọc của bảng chuyến: số chuyến theo trạng thái và tổng tiền (không tính chuyến hủy).
-- security invoker: chỉ cộng các chuyến người gọi được xem.
create or replace function public.shipment_list_summary(p_from timestamptz, p_to timestamptz, p_customer_id uuid default null, p_q text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with f as (
    select l.* from public.shipment_list l
    where l.pickup_at >= p_from and l.pickup_at < p_to
      and (p_customer_id is null or l.customer_id = p_customer_id)
      and (coalesce(p_q, '') = '' or concat_ws(' ', l.shipment_code, l.order_code, l.customer_name, l.plate_number, l.driver_name, l.pickup_name, l.delivery_name) ilike '%' || p_q || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'by_status', (select coalesce(jsonb_object_agg(status, jsonb_build_object(
        'count', n, 'freight', freight, 'surcharge', surcharge, 'fuel', fuel, 'revenue', revenue)), '{}'::jsonb)
      from (select status, count(*) as n, sum(freight_amount) as freight, sum(surcharge_amount) as surcharge,
                   sum(fuel_support_amount) as fuel, sum(total_revenue) as revenue
            from f group by status) x)
  );
$$;
revoke all on function public.shipment_list_summary(timestamptz, timestamptz, uuid, text) from public, anon;
grant execute on function public.shipment_list_summary(timestamptz, timestamptz, uuid, text) to authenticated;

-- Lịch sử thay đổi các trường tiền/khối lượng của một chuyến (trích từ nhật ký hệ thống),
-- cho người xem được chuyến mà không cần quyền xem toàn bộ nhật ký.
create or replace function public.shipment_change_history(p_shipment_id uuid)
returns table (occurred_at timestamptz, actor_name text, field text, old_value text, new_value text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.occurred_at,
         coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)),
         f.field, a.old_data ->> f.field, a.new_data ->> f.field
  from public.audit_logs a
  cross join lateral unnest(a.changed_fields) as f(field)
  left join public.profiles p on p.id = a.actor_id
  where (private.has_perm('shipments.view') or private.has_perm('dispatch.view'))
    and a.entity_type = 'shipments' and a.entity_id = p_shipment_id::text and a.action = 'update'
    and f.field in ('unit_price', 'quantity', 'surcharge_amount', 'fuel_support_rate', 'fuel_support_amount', 'price_list_id',
                    'pricing_unit', 'vehicle_id', 'driver_id', 'pickup_at', 'expected_delivery_at', 'notes')
  order by a.occurred_at desc, f.field
  limit 300;
$$;
revoke all on function public.shipment_change_history(uuid) from public, anon;
grant execute on function public.shipment_change_history(uuid) to authenticated;

-- >>> 20261021000014_driver_link.sql
-- =============================================================================
-- KHÁNH HÀ TMS - 0014: Tài xế nhận chuyến qua link, không cần tài khoản
-- Tài xế mở link /tx và nhập biển số xe (khách hàng đã chọn chỉ cần số xe,
-- chấp nhận rằng ai biết biển số cũng xem và nhận được chuyến của xe đó).
-- Máy được nhớ 30 ngày bằng một mã phiên ngẫu nhiên (cookie httpOnly); CSDL chỉ
-- lưu mã băm SHA-256. Hàm chỉ trả về chuyến của đúng xe trong phiên, không có giá/doanh thu.
-- =============================================================================

create table private.driver_link_sessions (
  token_hash bytea primary key,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index driver_link_sessions_vehicle_idx on private.driver_link_sessions (vehicle_id);

create or replace function private.plate_key(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- Phiên hợp lệ -> vehicle_id; không hợp lệ -> không có dòng nào
create or replace function private.driver_link_session(p_token text)
returns table (vehicle_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash bytea;
begin
  if p_token is null or length(p_token) < 32 then
    return;
  end if;
  v_hash := sha256(convert_to(p_token, 'UTF8'));
  return query
    update private.driver_link_sessions s
       set last_seen_at = now()
     where s.token_hash = v_hash and s.revoked_at is null and s.expires_at > now()
       and exists (select 1 from public.vehicles v where v.id = s.vehicle_id and v.archived_at is null)
    returning s.vehicle_id;
end;
$$;

-- Chuyến mà xe trong phiên được thấy: chuyến chạy bằng xe này, hoặc chuyến
-- giao cho tài xế mặc định của xe (khi điều phối chưa chọn xe).
create or replace function private.driver_link_visible(p_vehicle_id uuid, p_shipment public.shipments)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_shipment.driver_id is not null and (
    p_shipment.vehicle_id = p_vehicle_id
    or (p_shipment.vehicle_id is null and p_shipment.driver_id =
          (select v.assigned_driver_id from public.vehicles v where v.id = p_vehicle_id))), false);
$$;

-- -----------------------------------------------------------------------------
-- Mở bằng biển số xe. Trả về jsonb {ok, token, plate} hoặc {ok:false, error}
-- -----------------------------------------------------------------------------
create or replace function public.driver_link_login(p_plate text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := private.plate_key(p_plate);
  v_vehicle public.vehicles;
  v_token text;
begin
  if length(v_key) < 5 then
    return jsonb_build_object('ok', false, 'error', 'Nhập đủ biển số xe, ví dụ 51C-123.45.');
  end if;
  select * into v_vehicle from public.vehicles v
   where private.plate_key(v.plate_number) = v_key and v.archived_at is null;
  if v_vehicle.id is null then
    return jsonb_build_object('ok', false, 'error', 'Không tìm thấy xe có biển số này. Kiểm tra lại hoặc gọi điều phối.');
  end if;

  delete from private.driver_link_sessions where expires_at < now() - interval '30 days';
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into private.driver_link_sessions (token_hash, vehicle_id, expires_at)
  values (sha256(convert_to(v_token, 'UTF8')), v_vehicle.id, now() + interval '30 days');
  return jsonb_build_object('ok', true, 'token', v_token, 'plate', v_vehicle.plate_number);
end;
$$;

create or replace function public.driver_link_me(p_token text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object('plate', v.plate_number, 'driver_name', d.full_name)
  from private.driver_link_session(p_token) s
  join public.vehicles v on v.id = s.vehicle_id
  left join public.drivers d on d.id = v.assigned_driver_id;
$$;

create or replace function public.driver_link_logout(p_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.driver_link_sessions set revoked_at = now()
   where p_token is not null and token_hash = sha256(convert_to(p_token, 'UTF8')) and revoked_at is null;
$$;

-- Chuyến của xe trong phiên: chờ nhận, đã nhận, đang chạy và chuyến xong trong 3 ngày gần nhất
create or replace function public.driver_link_trips(p_token text)
returns table (
  shipment_id uuid,
  shipment_code text,
  status text,
  pickup_at timestamptz,
  expected_delivery_at timestamptz,
  plate_number text,
  vehicle_type_name text,
  quantity numeric,
  notes text,
  pickup_name text,
  pickup_address text,
  pickup_contact text,
  pickup_phone text,
  pickup_maps_url text,
  pickup_gate_instructions text,
  delivery_name text,
  delivery_address text,
  delivery_contact text,
  delivery_phone text,
  delivery_maps_url text,
  delivery_gate_instructions text,
  driver_name text,
  accepted_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select s.id, s.shipment_code, s.status, s.pickup_at, s.expected_delivery_at,
         v.plate_number, vt.name, s.quantity, s.notes,
         pl.name, pl.full_address, pl.contact_name, pl.phone,
         coalesce(pl.google_maps_url, case when pl.latitude is not null then
           'https://www.google.com/maps/search/?api=1&query=' || pl.latitude || ',' || pl.longitude end),
         pl.gate_instructions,
         dl.name, dl.full_address, dl.contact_name, dl.phone,
         coalesce(dl.google_maps_url, case when dl.latitude is not null then
           'https://www.google.com/maps/search/?api=1&query=' || dl.latitude || ',' || dl.longitude end),
         dl.gate_instructions,
         d.full_name, a.responded_at
  from private.driver_link_session(p_token) me
  join public.shipments s on private.driver_link_visible(me.vehicle_id, s)
  join public.drivers d on d.id = s.driver_id
  join public.locations pl on pl.id = s.pickup_location_id
  join public.locations dl on dl.id = s.delivery_location_id
  left join public.vehicles v on v.id = s.vehicle_id
  left join public.vehicle_types vt on vt.id = s.vehicle_type_id
  left join public.shipment_assignments a
    on a.shipment_id = s.id and a.driver_id = s.driver_id and a.response = 'accepted'
  where (s.status in ('assigned', 'accepted', 'in_transit')
     or (s.status in ('driver_completed', 'closed') and s.pickup_at > now() - interval '3 days'))
  order by (s.status = 'assigned') desc, s.pickup_at
  limit 100;
$$;

-- Tài xế bấm "Nhận đơn"
create or replace function public.driver_link_accept(p_token text, p_shipment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me record;
  v_s public.shipments;
  v_a public.shipment_assignments;
  v_name text;
begin
  select * into v_me from private.driver_link_session(p_token);
  if v_me.vehicle_id is null then
    return jsonb_build_object('ok', false, 'error', 'Phiên đã hết hạn. Vui lòng nhập lại số xe.', 'expired', true);
  end if;
  select * into v_s from public.shipments where id = p_shipment_id for update;
  if v_s.id is null or not private.driver_link_visible(v_me.vehicle_id, v_s) then
    return jsonb_build_object('ok', false, 'error', 'Chuyến này không còn được phân công cho xe của bạn. Tải lại trang để xem.');
  end if;
  if v_s.status = 'accepted' then
    return jsonb_build_object('ok', true);
  end if;
  if v_s.status <> 'assigned' then
    return jsonb_build_object('ok', false, 'error', 'Chuyến không còn ở trạng thái chờ nhận.');
  end if;
  select * into v_a from public.shipment_assignments
   where shipment_id = v_s.id and driver_id = v_s.driver_id and response = 'pending' for update;
  if v_a.id is null then
    return jsonb_build_object('ok', false, 'error', 'Chuyến không còn ở trạng thái chờ nhận.');
  end if;

  update public.shipment_assignments set response = 'accepted', responded_at = now() where id = v_a.id;
  update public.shipments set status = 'accepted' where id = v_s.id;

  select full_name into v_name from public.drivers where id = v_s.driver_id;
  update public.shipment_status_history h
     set note = v_name || ' nhận chuyến trên điện thoại'
   where h.id = (select max(id) from public.shipment_status_history
                  where shipment_id = v_s.id and status_field = 'status' and to_status = 'accepted');

  if v_a.assigned_by is not null then
    insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, link)
    values (v_a.assigned_by, 'shipment_accepted', 'Tài xế ' || v_name || ' đã nhận chuyến ' || v_s.shipment_code,
            null, 'shipment', v_s.id, '/chuyen-xe/' || v_s.id);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function private.driver_link_session(text) from public, anon, authenticated;
revoke all on function private.driver_link_visible(uuid, public.shipments) from public, anon, authenticated;
revoke all on function public.driver_link_login(text) from public;
revoke all on function public.driver_link_me(text) from public;
revoke all on function public.driver_link_logout(text) from public;
revoke all on function public.driver_link_trips(text) from public;
revoke all on function public.driver_link_accept(text, uuid) from public;
grant execute on function public.driver_link_login(text) to anon, authenticated;
grant execute on function public.driver_link_me(text) to anon, authenticated;
grant execute on function public.driver_link_logout(text) to anon, authenticated;
grant execute on function public.driver_link_trips(text) to anon, authenticated;
grant execute on function public.driver_link_accept(text, uuid) to anon, authenticated;

-- >>> 20261021000015_custom_fields_everywhere.sql
-- =============================================================================
-- KHÁNH HÀ TMS - 0015: Trường bổ sung cho mọi biểu mẫu danh mục
-- Người dùng tự thêm trường (kể cả trường công thức) cho mọi màn hình nhập liệu,
-- không chỉ xe, tài xế, khách hàng, nhà cung cấp, địa điểm, đơn hàng, chuyến.
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['vehicle_types', 'routes', 'transport_price_lists', 'fuel_support_rules', 'expense_categories',
                           'banks', 'payment_methods', 'company_entities', 'salary_rules', 'maintenance_records', 'catalog_items']
  loop
    execute format('alter table public.%I add column if not exists custom_fields jsonb not null default ''{}''::jsonb', t);
    execute format('alter table public.%I add constraint %I check (jsonb_typeof(custom_fields) = ''object'')', t, t || '_custom_fields_object');
  end loop;
end $$;

create or replace function private.custom_field_table(p_module text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_module
    when 'vehicles' then 'vehicles'
    when 'drivers' then 'drivers'
    when 'customers' then 'customers'
    when 'suppliers' then 'suppliers'
    when 'locations' then 'locations'
    when 'shipments' then 'shipments'
    when 'transport_orders' then 'transport_orders'
    when 'vehicle_types' then 'vehicle_types'
    when 'routes' then 'routes'
    when 'price_lists' then 'transport_price_lists'
    when 'fuel_rules' then 'fuel_support_rules'
    when 'expense_categories' then 'expense_categories'
    when 'banks' then 'banks'
    when 'payment_methods' then 'payment_methods'
    when 'company_entities' then 'company_entities'
    when 'salary_rules' then 'salary_rules'
    when 'maintenance_records' then 'maintenance_records'
    when 'catalog_items' then 'catalog_items'
  end;
$$;

-- -----------------------------------------------------------------------------
-- Đơn hàng và chuyến: nhận trường bổ sung ngay khi tạo; danh sách chuyến trả về trường bổ sung
-- (thân hàm giống 0013, chỉ thêm cột custom_fields; giá trị đã được kiểm tra ở máy chủ ứng dụng)
-- -----------------------------------------------------------------------------
create or replace function public.create_transport_order(p_order jsonb, p_shipments jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  o public.transport_orders;
  item jsonb;
  v_seq integer;
  v_pickup_at timestamptz;
  v_on date;
  v_pickup uuid;
  v_delivery uuid;
  v_vtype uuid;
  v_route public.routes;
  v_pl record;
  v_top record;
  v_n integer;
  v_tied boolean;
  v_unit_price numeric;
  v_pricing_unit text;
  v_surcharge numeric;
  v_rate numeric;
  v_base text;
  v_fuel_amount numeric;
  v_rule public.fuel_support_rules;
  v_rule_id uuid;
  v_fuel_source text;
  v_norm numeric;
  v_snapshot jsonb;
  v_new public.shipments;
  v_driver uuid;
  v_vehicle uuid;
  v_out jsonb := '[]'::jsonb;
  v_idx integer := 0;
begin
  if not private.has_perm('dispatch.create') then
    raise exception 'Bạn không có quyền tạo đơn hàng' using errcode = '42501';
  end if;
  if jsonb_typeof(p_shipments) <> 'array' or jsonb_array_length(p_shipments) = 0 then
    raise exception 'Đơn hàng phải có ít nhất một chuyến' using errcode = '22023';
  end if;
  if jsonb_array_length(p_shipments) > 100 then
    raise exception 'Mỗi lần chỉ tạo tối đa 100 chuyến' using errcode = '22023';
  end if;

  if p_order ? 'id' then
    select * into o from public.transport_orders where id = (p_order ->> 'id')::uuid for update;
    if o.id is null then
      raise exception 'Không tìm thấy đơn hàng' using errcode = 'P0001';
    end if;
    if o.status <> 'open' then
      raise exception 'Đơn hàng đã hoàn thành hoặc đã hủy, không thêm chuyến được' using errcode = '22023';
    end if;
  else
    insert into public.transport_orders (order_date, company_entity_id, customer_id, payer_customer_id, dispatcher_id, notes, custom_fields)
    values (
      coalesce((p_order ->> 'order_date')::date, (now() at time zone 'Asia/Ho_Chi_Minh')::date),
      nullif(p_order ->> 'company_entity_id', '')::uuid,
      (p_order ->> 'customer_id')::uuid,
      coalesce(nullif(p_order ->> 'payer_customer_id', '')::uuid, (p_order ->> 'customer_id')::uuid),
      auth.uid(),
      nullif(trim(p_order ->> 'notes'), ''),
      case when jsonb_typeof(p_order -> 'custom_fields') = 'object' then p_order -> 'custom_fields' else '{}'::jsonb end
    )
    returning * into o;
  end if;

  select coalesce(max(sequence_in_order), 0) into v_seq from public.shipments where order_id = o.id;

  for item in select * from jsonb_array_elements(p_shipments) loop
    v_idx := v_idx + 1;
    v_seq := v_seq + 1;
    v_pickup_at := (item ->> 'pickup_at')::timestamptz;
    if v_pickup_at is null then
      raise exception 'Chuyến %: chưa nhập thời gian nhận hàng', v_idx using errcode = '22023';
    end if;
    v_on := (v_pickup_at at time zone 'Asia/Ho_Chi_Minh')::date;
    v_pickup := nullif(item ->> 'pickup_location_id', '')::uuid;
    v_delivery := nullif(item ->> 'delivery_location_id', '')::uuid;
    v_vtype := nullif(item ->> 'vehicle_type_id', '')::uuid;
    if v_pickup is null or v_delivery is null then
      raise exception 'Chuyến %: chưa chọn điểm nhận hoặc điểm giao', v_idx using errcode = '22023';
    end if;
    select * into v_route from public.routes r
    where r.pickup_location_id = v_pickup and r.delivery_location_id = v_delivery and r.is_active;

    -- Bảng giá: ứng viên tốt nhất; nếu hai dòng đầu ngang nhau thì người dùng phải chọn
    select count(*) into v_n from private.price_candidates(o.customer_id, v_pickup, v_delivery, v_vtype, v_on);
    select * into v_top from private.price_candidates(o.customer_id, v_pickup, v_delivery, v_vtype, v_on) limit 1;
    select count(*) > 1 into v_tied from private.price_candidates(o.customer_id, v_pickup, v_delivery, v_vtype, v_on) c
    where c.specificity = v_top.specificity and c.priority = v_top.priority;

    select * into v_pl from private.price_candidates(o.customer_id, v_pickup, v_delivery, v_vtype, v_on) c where false;
    if nullif(item ->> 'price_list_id', '') is not null then
      select * into v_pl from private.price_candidates(o.customer_id, v_pickup, v_delivery, v_vtype, v_on) c
      where c.id = (item ->> 'price_list_id')::uuid;
      if v_pl.id is null then
        raise exception 'Chuyến %: bảng giá đã chọn không áp dụng cho chuyến này', v_idx using errcode = '22023';
      end if;
    elsif v_n > 0 then
      if v_tied then
        raise exception 'Chuyến %: có nhiều bảng giá ngang nhau, vui lòng chọn một bảng giá', v_idx using errcode = '22023';
      end if;
      v_pl := v_top;
    end if;

    if v_pl.id is not null then
      v_unit_price := v_pl.unit_price;
      v_pricing_unit := v_pl.pricing_unit;
      v_surcharge := coalesce(nullif(item ->> 'surcharge_amount', '')::numeric, v_pl.surcharge_amount, 0);
    else
      -- Không có bảng giá: điều phối nhập giá thủ công
      v_unit_price := nullif(item ->> 'unit_price', '')::numeric;
      if v_unit_price is null then
        raise exception 'Chuyến %: không có bảng giá phù hợp, vui lòng nhập đơn giá', v_idx using errcode = '22023';
      end if;
      v_pricing_unit := coalesce(nullif(item ->> 'pricing_unit', ''), 'trip');
      v_surcharge := coalesce(nullif(item ->> 'surcharge_amount', '')::numeric, 0);
    end if;

    -- Hỗ trợ dầu: nhập tay trên chuyến > bảng giá > quy tắc
    v_rule_id := null;
    v_fuel_amount := 0;
    if nullif(item ->> 'fuel_support_rate', '') is not null then
      v_rate := (item ->> 'fuel_support_rate')::numeric;
      v_base := 'freight_revenue';
      v_fuel_source := 'manual';
    elsif v_pl.id is not null and v_pl.fuel_support_rate is not null then
      v_rate := v_pl.fuel_support_rate;
      v_base := 'freight_revenue';
      v_fuel_source := 'price_list';
    else
      v_rule := private.fuel_rule_for(o.customer_id, v_route.id, v_vtype, v_on);
      if v_rule.id is null then
        v_rate := null;
        v_base := null;
        v_fuel_source := 'none';
      else
        v_rule_id := v_rule.id;
        v_rate := v_rule.rate_percent;
        v_base := v_rule.calculation_base;
        v_fuel_source := 'rule:' || v_rule.scope_type;
        if v_base = 'fuel_norm' then
          -- Định mức xe (nếu đã chọn xe) hoặc của quy tắc × quãng đường tuyến × giá dầu tham chiếu
          select coalesce(v.fuel_norm_l_per_100km, v_rule.fuel_norm_l_per_100km) into v_norm
          from (select 1) x left join public.vehicles v on v.id = nullif(item ->> 'vehicle_id', '')::uuid;
          v_fuel_amount := coalesce(round(v_route.distance_km * v_norm / 100 * v_rule.reference_fuel_price, 0), 0);
        end if;
      end if;
    end if;

    v_snapshot := jsonb_build_object(
      'quoted_at', now(),
      'price_source', case when v_pl.id is null then 'manual' else 'price_list' end,
      'price_list_code', v_pl.code,
      'price_specificity', v_pl.specificity,
      'price_priority', v_pl.priority,
      'route_name', v_route.name,
      'route_distance_km', v_route.distance_km,
      'fuel_source', v_fuel_source,
      'fuel_rate', v_rate,
      'fuel_base', v_base
    );

    v_driver := nullif(item ->> 'driver_id', '')::uuid;
    v_vehicle := nullif(item ->> 'vehicle_id', '')::uuid;

    insert into public.shipments (
      order_id, sequence_in_order, pickup_at, expected_delivery_at, pickup_location_id, delivery_location_id,
      route_id, vehicle_type_id, vehicle_id, price_list_id, unit_price, pricing_unit, quantity, surcharge_amount,
      fuel_support_rate, fuel_support_base, fuel_support_amount, fuel_support_rule_id, pricing_snapshot, notes, custom_fields
    ) values (
      o.id, v_seq, v_pickup_at, nullif(item ->> 'expected_delivery_at', '')::timestamptz, v_pickup, v_delivery,
      v_route.id, v_vtype, v_vehicle, v_pl.id, v_unit_price, v_pricing_unit,
      coalesce(nullif(item ->> 'quantity', '')::numeric, 1), v_surcharge,
      v_rate, v_base, v_fuel_amount, v_rule_id, v_snapshot, nullif(trim(item ->> 'notes'), ''),
      case when jsonb_typeof(item -> 'custom_fields') = 'object' then item -> 'custom_fields' else '{}'::jsonb end
    )
    returning * into v_new;

    if v_driver is not null then
      perform public.assign_shipment(v_new.id, v_driver, v_vehicle);
    end if;

    v_out := v_out || jsonb_build_object('id', v_new.id, 'shipment_code', v_new.shipment_code);
  end loop;

  return jsonb_build_object('order_id', o.id, 'order_code', o.order_code, 'shipments', v_out);
end;
$$;

create or replace view public.shipment_list with (security_invoker = true) as
select
  s.id, s.shipment_code, s.order_id, o.order_code, s.sequence_in_order,
  o.customer_id, c.name as customer_name, c.code as customer_code,
  s.pickup_at, s.expected_delivery_at,
  s.pickup_location_id, pl.name as pickup_name,
  s.delivery_location_id, dl.name as delivery_name,
  s.vehicle_type_id, vt.name as vehicle_type_name,
  s.vehicle_id, v.plate_number,
  s.driver_id, d.full_name as driver_name, d.code as driver_code,
  s.price_list_id, s.unit_price, s.pricing_unit, s.quantity, s.freight_amount, s.surcharge_amount,
  s.fuel_support_rate, s.fuel_support_base, s.fuel_support_amount,
  s.freight_amount + s.surcharge_amount + s.fuel_support_amount as total_revenue,
  s.status, s.document_status, s.settlement_status,
  s.notes, s.version, s.created_at, s.updated_at,
  s.custom_fields, o.custom_fields as order_custom_fields
from public.shipments s
join public.transport_orders o on o.id = s.order_id
left join public.customers c on c.id = o.customer_id
left join public.locations pl on pl.id = s.pickup_location_id
left join public.locations dl on dl.id = s.delivery_location_id
left join public.vehicle_types vt on vt.id = s.vehicle_type_id
left join public.vehicles v on v.id = s.vehicle_id
left join public.drivers d on d.id = s.driver_id;

-- >>> 20261022000016_driver_progress_finance.sql
-- =============================================================================
-- KHÁNH HÀ TMS - 0016: Hoàn thiện Giai đoạn 5 và Giai đoạn 6
--   * Tài xế (qua link biển số): Bắt đầu chạy, Hoàn thành chuyến kèm ảnh giao hàng / phiếu ký nhận.
--   * Tải ảnh từ điện thoại không cần tài khoản: mỗi lần chụp xin một "vé tải lên" ngắn hạn,
--     Storage chỉ nhận tệp nằm trong thư mục tx/<vé>/ còn hạn (không dùng service role key).
--   * Ứng tiền và chi phí: tài xế gửi yêu cầu -> Giám đốc duyệt -> Kế toán chuyển tiền.
--     Chi phí tài xế tự trả được cộng lại khi đối soát lương cuối tháng (Giai đoạn 7).
--   * Có thể tắt duyệt cho từng loại chi phí (expense_categories.requires_approval).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Vé tải lên cho điện thoại tài xế
-- -----------------------------------------------------------------------------
create table private.driver_upload_tickets (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  shipment_id uuid references public.shipments (id) on delete cascade,
  purpose text not null check (purpose in ('delivery', 'expense')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '2 hours',
  used_at timestamptz
);
create index driver_upload_tickets_vehicle_idx on private.driver_upload_tickets (vehicle_id, created_at desc);

-- Tên tệp hợp lệ: tx/<vé>/<loại>-<uuid>.<đuôi>
create or replace function private.driver_upload_name_ok(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_name ~ '^tx/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(photo|delivery_note|receipt|invoice)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|heic|pdf)$', false);
$$;

-- Storage gọi hàm này khi điện thoại (vai trò anon) tải tệp lên: vé phải còn hạn, chưa dùng, tối đa 10 tệp/vé.
create or replace function private.driver_upload_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ticket uuid;
  n int := 0;
begin
  if not private.driver_upload_name_ok(p_name) then
    return false;
  end if;
  v_ticket := split_part(p_name, '/', 2)::uuid;
  if not exists (select 1 from private.driver_upload_tickets t where t.id = v_ticket and t.used_at is null and t.expires_at > now()) then
    return false;
  end if;
  if to_regclass('storage.objects') is not null then
    execute 'select count(*) from storage.objects where bucket_id = ''documents'' and name like $1'
      into n using 'tx/' || v_ticket::text || '/%';
  end if;
  return n < 10;
end;
$$;
revoke all on function private.driver_upload_ok(text) from public;
grant usage on schema private to anon;
grant execute on function private.driver_upload_ok(text) to anon, authenticated;

do $outer$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Bỏ qua chính sách Storage cho điện thoại tài xế: không có schema storage.';
    return;
  end if;
  execute 'drop policy if exists documents_driver_link_insert on storage.objects';
  execute $p$
    create policy documents_driver_link_insert on storage.objects for insert to anon, authenticated
    with check (bucket_id = 'documents' and private.driver_upload_ok(name))
  $p$;
end
$outer$;

-- Ghi các tệp đã tải lên theo vé thành chứng từ của bản ghi; trả về số tệp theo từng loại
create or replace function private.driver_attach_uploads(
  p_ticket uuid, p_vehicle_id uuid, p_entity_type text, p_entity_id uuid, p_allowed text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t private.driver_upload_tickets;
  o record;
  v_type text;
  v_mime text;
  v_counts jsonb := '{}'::jsonb;
begin
  if p_ticket is null then
    return v_counts;
  end if;
  select * into t from private.driver_upload_tickets where id = p_ticket and vehicle_id = p_vehicle_id for update;
  if t.id is null or t.used_at is not null then
    raise exception 'Ảnh đã gửi hết hạn. Vui lòng chụp lại.' using errcode = '22023';
  end if;
  if to_regclass('storage.objects') is not null then
    for o in execute 'select name, metadata from storage.objects where bucket_id = ''documents'' and name like $1 order by created_at'
      using 'tx/' || p_ticket::text || '/%'
    loop
      if not private.driver_upload_name_ok(o.name) then continue; end if;
      v_type := split_part(split_part(o.name, '/', 3), '-', 1);
      if not v_type = any (p_allowed) then continue; end if;
      v_mime := coalesce(o.metadata ->> 'mimetype', case when o.name like '%.pdf' then 'application/pdf' else 'image/jpeg' end);
      if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf') then continue; end if;
      insert into public.documents (bucket, storage_path, file_name, mime_type, size_bytes, entity_type, entity_id, doc_type)
      values ('documents', o.name, split_part(o.name, '/', 3), v_mime,
              greatest(1, least(10485760, coalesce((o.metadata ->> 'size')::bigint, 1))), p_entity_type, p_entity_id, v_type)
      on conflict (bucket, storage_path) do nothing;
      v_counts := jsonb_set(v_counts, array[v_type], to_jsonb(coalesce((v_counts ->> v_type)::int, 0) + 1));
    end loop;
  end if;
  update private.driver_upload_tickets set used_at = now() where id = t.id;
  return v_counts;
end;
$$;
revoke all on function private.driver_attach_uploads(uuid, uuid, text, uuid, text[]) from public, anon, authenticated;

create or replace function public.driver_link_upload_ticket(p_token text, p_shipment_id uuid, p_purpose text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me record;
  v_s public.shipments;
  v_id uuid;
begin
  select * into v_me from private.driver_link_session(p_token);
  if v_me.vehicle_id is null then
    return jsonb_build_object('ok', false, 'error', 'Phiên đã hết hạn. Vui lòng nhập lại số xe.', 'expired', true);
  end if;
  if p_purpose not in ('delivery', 'expense') then
    return jsonb_build_object('ok', false, 'error', 'Loại ảnh không hợp lệ.');
  end if;
  if p_shipment_id is not null then
    select * into v_s from public.shipments where id = p_shipment_id;
    if v_s.id is null or not private.driver_link_visible(v_me.vehicle_id, v_s) then
      return jsonb_build_object('ok', false, 'error', 'Chuyến này không thuộc xe của bạn.');
    end if;
  end if;
  if (select count(*) from private.driver_upload_tickets
       where vehicle_id = v_me.vehicle_id and created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'error', 'Gửi ảnh quá nhiều lần. Vui lòng thử lại sau ít phút.');
  end if;
  delete from private.driver_upload_tickets where expires_at < now() - interval '7 days';
  insert into private.driver_upload_tickets (vehicle_id, shipment_id, purpose)
  values (v_me.vehicle_id, p_shipment_id, p_purpose) returning id into v_id;
  return jsonb_build_object('ok', true, 'ticket', v_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 2. Tài xế: Bắt đầu chạy, Hoàn thành chuyến
-- -----------------------------------------------------------------------------
create or replace function private.driver_link_note(p_shipment_id uuid, p_status text, p_note text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.shipment_status_history h set note = p_note
   where h.id = (select max(id) from public.shipment_status_history
                  where shipment_id = p_shipment_id and status_field = 'status' and to_status = p_status);
$$;
revoke all on function private.driver_link_note(uuid, text, text) from public, anon, authenticated;

create or replace function private.notify_dispatcher(p_shipment_id uuid, p_type text, p_title text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (recipient_id, type, title, entity_type, entity_id, link)
  select a.assigned_by, p_type, p_title, 'shipment', p_shipment_id, '/chuyen-xe/' || p_shipment_id
  from public.shipment_assignments a
  where a.shipment_id = p_shipment_id and a.response = 'accepted' and a.assigned_by is not null
  limit 1;
$$;
revoke all on function private.notify_dispatcher(uuid, text, text) from public, anon, authenticated;

create or replace function public.driver_link_start(p_token text, p_shipment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me record;
  v_s public.shipments;
  v_name text;
begin
  select * into v_me from private.driver_link_session(p_token);
  if v_me.vehicle_id is null then
    return jsonb_build_object('ok', false, 'error', 'Phiên đã hết hạn. Vui lòng nhập lại số xe.', 'expired', true);
  end if;
  select * into v_s from public.shipments where id = p_shipment_id for update;
  if v_s.id is null or not private.driver_link_visible(v_me.vehicle_id, v_s) then
    return jsonb_build_object('ok', false, 'error', 'Chuyến này không còn được phân công cho xe của bạn. Tải lại trang để xem.');
  end if;
  if v_s.status = 'in_transit' then
    return jsonb_build_object('ok', true);
  end if;
  if v_s.status <> 'accepted' then
    return jsonb_build_object('ok', false, 'error', 'Chỉ bắt đầu được chuyến đã nhận.');
  end if;
  update public.shipments
     set status = 'in_transit', departed_pickup_at = coalesce(departed_pickup_at, now())
   where id = v_s.id;
  select full_name into v_name from public.drivers where id = v_s.driver_id;
  perform private.driver_link_note(v_s.id, 'in_transit', v_name || ' bắt đầu chạy trên điện thoại');
  perform private.notify_dispatcher(v_s.id, 'shipment_started', 'Tài xế ' || v_name || ' đã bắt đầu chạy chuyến ' || v_s.shipment_code);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.driver_link_complete(
  p_token text, p_shipment_id uuid, p_ticket uuid, p_result text default 'full', p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me record;
  v_s public.shipments;
  v_name text;
  v_counts jsonb;
  v_photos int;
begin
  select * into v_me from private.driver_link_session(p_token);
  if v_me.vehicle_id is null then
    return jsonb_build_object('ok', false, 'error', 'Phiên đã hết hạn. Vui lòng nhập lại số xe.', 'expired', true);
  end if;
  select * into v_s from public.shipments where id = p_shipment_id for update;
  if v_s.id is null or not private.driver_link_visible(v_me.vehicle_id, v_s) then
    return jsonb_build_object('ok', false, 'error', 'Chuyến này không còn được phân công cho xe của bạn. Tải lại trang để xem.');
  end if;
  if v_s.status = 'driver_completed' then
    return jsonb_build_object('ok', true);
  end if;
  if v_s.status <> 'in_transit' then
    return jsonb_build_object('ok', false, 'error', 'Bấm "Bắt đầu chạy" trước khi hoàn thành chuyến.');
  end if;
  if coalesce(p_result, '') not in ('full', 'partial', 'failed') then
    return jsonb_build_object('ok', false, 'error', 'Chọn kết quả giao hàng.');
  end if;
  if p_result <> 'full' and length(trim(coalesce(p_note, ''))) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Giao thiếu hoặc không giao được: vui lòng ghi lý do.');
  end if;

  begin
    v_counts := private.driver_attach_uploads(p_ticket, v_me.vehicle_id, 'shipment', v_s.id, array['photo', 'delivery_note']);
  exception when sqlstate '22023' then
    return jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
  v_photos := coalesce((v_counts ->> 'photo')::int, 0) + coalesce((v_counts ->> 'delivery_note')::int, 0);
  if v_photos = 0 then
    raise exception 'Cần ít nhất 1 ảnh giao hàng hoặc phiếu ký nhận' using errcode = '22023';
  end if;

  update public.shipments
     set status = 'driver_completed',
         completed_at = now(),
         arrived_delivery_at = coalesce(arrived_delivery_at, now()),
         delivery_result = p_result,
         completion_note = nullif(trim(coalesce(p_note, '')), ''),
         document_status = case when document_status in ('missing', 'rejected') then 'submitted' else document_status end
   where id = v_s.id;
  select full_name into v_name from public.drivers where id = v_s.driver_id;
  perform private.driver_link_note(v_s.id, 'driver_completed', v_name || ' hoàn thành chuyến trên điện thoại (' || v_photos || ' ảnh)');
  perform private.notify_dispatcher(v_s.id, 'shipment_completed', 'Tài xế ' || v_name || ' đã hoàn thành chuyến ' || v_s.shipment_code);
  return jsonb_build_object('ok', true, 'photos', v_photos);
exception when sqlstate '22023' then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

-- Chuyến trả về cho điện thoại: thêm giờ bắt đầu, giờ hoàn thành, số ảnh đã gửi
drop function public.driver_link_trips(text);
create function public.driver_link_trips(p_token text)
returns table (
  shipment_id uuid,
  shipment_code text,
  status text,
  pickup_at timestamptz,
  expected_delivery_at timestamptz,
  plate_number text,
  vehicle_type_name text,
  quantity numeric,
  notes text,
  pickup_name text,
  pickup_address text,
  pickup_contact text,
  pickup_phone text,
  pickup_maps_url text,
  pickup_gate_instructions text,
  delivery_name text,
  delivery_address text,
  delivery_contact text,
  delivery_phone text,
  delivery_maps_url text,
  delivery_gate_instructions text,
  driver_name text,
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  delivery_result text,
  photo_count bigint
)
language sql
security definer
set search_path = ''
as $$
  select s.id, s.shipment_code, s.status, s.pickup_at, s.expected_delivery_at,
         v.plate_number, vt.name, s.quantity, s.notes,
         pl.name, pl.full_address, pl.contact_name, pl.phone,
         coalesce(pl.google_maps_url, case when pl.latitude is not null then
           'https://www.google.com/maps/search/?api=1&query=' || pl.latitude || ',' || pl.longitude end),
         pl.gate_instructions,
         dl.name, dl.full_address, dl.contact_name, dl.phone,
         coalesce(dl.google_maps_url, case when dl.latitude is not null then
           'https://www.google.com/maps/search/?api=1&query=' || dl.latitude || ',' || dl.longitude end),
         dl.gate_instructions,
         d.full_name, a.responded_at, s.departed_pickup_at, s.completed_at, s.delivery_result,
         (select count(*) from public.documents doc
           where doc.entity_type = 'shipment' and doc.entity_id = s.id and doc.archived_at is null)
  from private.driver_link_session(p_token) me
  join public.shipments s on private.driver_link_visible(me.vehicle_id, s)
  join public.drivers d on d.id = s.driver_id
  join public.locations pl on pl.id = s.pickup_location_id
  join public.locations dl on dl.id = s.delivery_location_id
  left join public.vehicles v on v.id = s.vehicle_id
  left join public.vehicle_types vt on vt.id = s.vehicle_type_id
  left join public.shipment_assignments a
    on a.shipment_id = s.id and a.driver_id = s.driver_id and a.response = 'accepted'
  where (s.status in ('assigned', 'accepted', 'in_transit')
     or (s.status in ('driver_completed', 'closed') and s.pickup_at > now() - interval '3 days'))
  order by (s.status = 'assigned') desc, (s.status = 'in_transit') desc, s.pickup_at
  limit 100;
$$;

-- -----------------------------------------------------------------------------
-- 3. Phê duyệt: người gửi có thể là tài xế (không có tài khoản); cấp duyệt theo quy tắc
-- -----------------------------------------------------------------------------
alter table public.approval_requests alter column requested_by drop not null;
alter table public.approval_requests
  add column requested_driver_id uuid references public.drivers (id),
  add column levels integer[] not null default '{1}',
  add constraint approval_requests_requester_check check (requested_by is not null or requested_driver_id is not null);
alter table public.approval_steps alter column actor_id drop not null;
alter table public.approval_steps
  add column actor_label text,
  add constraint approval_steps_actor_check check (actor_id is not null or actor_label is not null);

-- Quy trình khách hàng chốt (22/10/2026): Ứng tiền và Chi phí do Giám đốc duyệt một cấp, Kế toán chuyển tiền.
update public.approval_rules set is_active = false
 where approval_type_id in (select id from public.approval_types where code in ('advance', 'expense'));
insert into public.approval_rules (approval_type_id, level, approver_role_id, min_amount, max_amount)
select t.id, 1, (select id from public.roles where code = 'director'), 0, null
from public.approval_types t where t.code in ('advance', 'expense');

-- Sửa trigger chặn sửa số tiền đã duyệt: tách điều kiện theo bảng (bản cũ tham chiếu cột không có ở bảng kia)
create or replace function private.guard_approved_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'shipment_expenses' then
    if old.status = 'approved'
       and (new.amount, new.category_id, new.shipment_id) is distinct from (old.amount, old.category_id, old.shipment_id) then
      raise exception 'Chi phí đã duyệt: không được sửa trực tiếp số tiền/loại chi phí' using errcode = '42501';
    end if;
  elsif tg_table_name = 'advance_requests' then
    if old.status in ('approved', 'paid')
       and (new.amount_requested, new.amount_approved, new.driver_id) is distinct from (old.amount_requested, old.amount_approved, old.driver_id) then
      raise exception 'Yêu cầu ứng đã duyệt: không được sửa trực tiếp số tiền' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Ứng tiền / chi phí: trường bổ sung, mã chi phí, ai trả tiền
alter table public.advance_requests
  add column custom_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object');
alter table public.shipment_expenses
  add column code text unique,
  add column driver_id uuid references public.drivers (id),
  add column paid_by text not null default 'driver' check (paid_by in ('driver', 'company')),
  add column custom_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object');
create trigger trg_shipment_expenses_code before insert on public.shipment_expenses
for each row execute function private.fill_doc_code('CP');
create index shipment_expenses_driver_idx on public.shipment_expenses (driver_id, incurred_at desc);

create or replace function private.custom_field_table(p_module text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_module
    when 'vehicles' then 'vehicles'
    when 'drivers' then 'drivers'
    when 'customers' then 'customers'
    when 'suppliers' then 'suppliers'
    when 'locations' then 'locations'
    when 'shipments' then 'shipments'
    when 'transport_orders' then 'transport_orders'
    when 'vehicle_types' then 'vehicle_types'
    when 'routes' then 'routes'
    when 'price_lists' then 'transport_price_lists'
    when 'fuel_rules' then 'fuel_support_rules'
    when 'expense_categories' then 'expense_categories'
    when 'banks' then 'banks'
    when 'payment_methods' then 'payment_methods'
    when 'company_entities' then 'company_entities'
    when 'salary_rules' then 'salary_rules'
    when 'maintenance_records' then 'maintenance_records'
    when 'catalog_items' then 'catalog_items'
    when 'advances' then 'advance_requests'
    when 'expenses' then 'shipment_expenses'
  end;
$$;

-- Các cấp cần duyệt cho số tiền (theo quy tắc đang bật); không có quy tắc thì cấp 1 (chỉ Super Admin duyệt được)
create or replace function private.approval_levels(p_type_id uuid, p_amount numeric)
returns integer[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.level order by r.level), '{1}')
  from public.approval_rules r
  where r.approval_type_id = p_type_id and r.is_active
    and coalesce(p_amount, 0) >= r.min_amount and (r.max_amount is null or coalesce(p_amount, 0) <= r.max_amount);
$$;

-- Người dùng hiện tại có được duyệt cấp hiện tại của yêu cầu không (không tự duyệt khoản của mình)
create or replace function private.can_approve(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select r.status = 'pending'
      and private.has_perm('approvals.approve')
      and (t.allow_self_approval or (
        r.requested_by is distinct from auth.uid()
        and not exists (select 1 from public.drivers d where d.id = r.requested_driver_id and d.profile_id = auth.uid())))
      and (private.is_super_admin() or exists (
        select 1 from public.approval_rules ar
        where ar.approval_type_id = r.approval_type_id and ar.is_active and ar.level = r.current_level
          and coalesce(r.amount, 0) >= ar.min_amount and (ar.max_amount is null or coalesce(r.amount, 0) <= ar.max_amount)
          and (ar.approver_user_id = auth.uid()
               or exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role_id = ar.approver_role_id))))
    from public.approval_requests r
    join public.approval_types t on t.id = r.approval_type_id
    where r.id = p_request_id), false);
$$;
revoke all on function private.can_approve(uuid) from public, anon;
grant execute on function private.can_approve(uuid) to authenticated;

-- Thông báo cho người duyệt cấp hiện tại
create or replace function private.notify_approvers(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.approval_requests;
  v_type text;
  n int;
begin
  select * into r from public.approval_requests where id = p_request_id;
  select name into v_type from public.approval_types where id = r.approval_type_id;
  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, link)
  select distinct p.id, 'approval_pending', v_type || ' chờ duyệt: ' || to_char(coalesce(r.amount, 0), 'FM999G999G999G990') || ' đ',
         r.content, 'approval_request', r.id, '/phe-duyet'
  from public.approval_rules ar
  join public.profiles p on p.status = 'active' and (
    p.id = ar.approver_user_id
    or exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role_id = ar.approver_role_id))
  where ar.approval_type_id = r.approval_type_id and ar.is_active and ar.level = r.current_level
    and coalesce(r.amount, 0) >= ar.min_amount and (ar.max_amount is null or coalesce(r.amount, 0) <= ar.max_amount)
    and p.id is distinct from r.requested_by;
  get diagnostics n = row_count;
  if n = 0 then
    perform private.notify_permission_holders('approvals.approve', 'approval_pending', v_type || ' chờ duyệt', r.content, 'approval_request', r.id, '/phe-duyet');
  end if;
end;
$$;
revoke all on function private.notify_approvers(uuid) from public, anon, authenticated;

-- Tạo yêu cầu phê duyệt (gọi từ các hàm nghiệp vụ)
create or replace function private.submit_approval(
  p_type_code text, p_entity_type text, p_entity_id uuid, p_shipment_id uuid, p_amount numeric, p_content text,
  p_requested_by uuid, p_driver_id uuid, p_actor_label text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.approval_types;
  v_levels int[];
  v_id uuid;
begin
  select * into t from public.approval_types where code = p_type_code and is_active;
  if t.id is null then
    raise exception 'Chưa cấu hình loại phê duyệt %', p_type_code using errcode = 'P0001';
  end if;
  v_levels := private.approval_levels(t.id, p_amount);
  insert into public.approval_requests (approval_type_id, entity_type, entity_id, shipment_id, requested_by, requested_driver_id,
    amount, content, status, levels, current_level, required_levels, due_at)
  values (t.id, p_entity_type, p_entity_id, p_shipment_id, p_requested_by, p_driver_id,
    p_amount, p_content, 'pending', v_levels, v_levels[1], cardinality(v_levels),
    case when t.sla_hours is not null then now() + make_interval(hours => t.sla_hours) end)
  returning id into v_id;
  insert into public.approval_steps (request_id, level, action, actor_id, actor_label)
  values (v_id, 0, 'submit', p_requested_by, case when p_requested_by is null then p_actor_label end);
  perform private.notify_approvers(v_id);
  return v_id;
end;
$$;
revoke all on function private.submit_approval(text, text, uuid, uuid, numeric, text, uuid, uuid, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Ứng tiền và chi phí do nhân viên tạo (Kế toán / Điều phối)
-- -----------------------------------------------------------------------------
create or replace function public.create_advance_request(
  p_driver_id uuid, p_amount numeric, p_reason text, p_shipment_id uuid default null, p_note text default null,
  p_custom jsonb default '{}'::jsonb, p_client_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_driver text;
begin
  if not private.has_perm('advances.create') then
    raise exception 'Bạn không có quyền tạo yêu cầu ứng tiền' using errcode = '42501';
  end if;
  if p_client_request_id is not null then
    select id into v_id from public.advance_requests where client_request_id = p_client_request_id;
    if v_id is not null then return v_id; end if;
  end if;
  select full_name into v_driver from public.drivers where id = p_driver_id and archived_at is null;
  if v_driver is null then
    raise exception 'Chọn tài xế' using errcode = '22023';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Số tiền ứng phải lớn hơn 0' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Nhập lý do ứng tiền' using errcode = '22023';
  end if;
  insert into public.advance_requests (driver_id, shipment_id, amount_requested, reason, note, status, client_request_id, requested_by, custom_fields)
  values (p_driver_id, p_shipment_id, p_amount, trim(p_reason), nullif(trim(coalesce(p_note, '')), ''), 'pending', p_client_request_id, auth.uid(),
          coalesce(p_custom, '{}'::jsonb))
  returning id, code into v_id, v_code;
  update public.advance_requests set approval_request_id = private.submit_approval(
    'advance', 'advance_request', v_id, p_shipment_id, p_amount, 'Ứng tiền ' || v_code || ' cho ' || v_driver || ': ' || trim(p_reason),
    auth.uid(), p_driver_id, null)
  where id = v_id;
  return v_id;
end;
$$;

-- Trạng thái ban đầu của chi phí theo loại chi phí: cần duyệt -> chờ duyệt, không cần -> đã duyệt
create or replace function private.insert_expense(
  p_shipment public.shipments, p_category public.expense_categories, p_amount numeric, p_incurred_at timestamptz, p_note text,
  p_source text, p_paid_by text, p_driver_id uuid, p_entered_by uuid, p_custom jsonb, p_client_request_id uuid, p_actor_label text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_driver text;
begin
  insert into public.shipment_expenses (shipment_id, category_id, amount, incurred_at, note, source, paid_by, driver_id, status,
    client_request_id, entered_by, custom_fields)
  values (p_shipment.id, p_category.id, p_amount, coalesce(p_incurred_at, now()), nullif(trim(coalesce(p_note, '')), ''), p_source, p_paid_by,
    p_driver_id, case when p_category.requires_approval then 'pending' else 'approved' end,
    p_client_request_id, p_entered_by, coalesce(p_custom, '{}'::jsonb))
  returning id, code into v_id, v_code;
  if p_category.requires_approval then
    select full_name into v_driver from public.drivers where id = p_driver_id;
    update public.shipment_expenses set approval_request_id = private.submit_approval(
      'expense', 'shipment_expense', v_id, p_shipment.id, p_amount,
      p_category.name || ' ' || v_code || ' chuyến ' || p_shipment.shipment_code || coalesce(' (' || v_driver || ')', ''),
      p_entered_by, p_driver_id, p_actor_label)
    where id = v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function private.insert_expense(public.shipments, public.expense_categories, numeric, timestamptz, text, text, text, uuid, uuid, jsonb, uuid, text)
  from public, anon, authenticated;

create or replace function public.add_shipment_expense(
  p_shipment_id uuid, p_category_id uuid, p_amount numeric, p_incurred_at timestamptz default null, p_note text default null,
  p_paid_by text default 'company', p_driver_id uuid default null, p_custom jsonb default '{}'::jsonb, p_client_request_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.shipments;
  c public.expense_categories;
  v_id uuid;
begin
  if not private.has_perm('expenses.create') then
    raise exception 'Bạn không có quyền nhập chi phí' using errcode = '42501';
  end if;
  if p_client_request_id is not null then
    select id into v_id from public.shipment_expenses where client_request_id = p_client_request_id;
    if v_id is not null then return v_id; end if;
  end if;
  select * into s from public.shipments where id = p_shipment_id;
  if s.id is null then
    raise exception 'Chọn chuyến xe' using errcode = '22023';
  end if;
  if s.status = 'cancelled' then
    raise exception 'Chuyến đã hủy, không nhập chi phí' using errcode = '22023';
  end if;
  select * into c from public.expense_categories where id = p_category_id and is_active;
  if c.id is null then
    raise exception 'Chọn loại chi phí' using errcode = '22023';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Số tiền phải lớn hơn 0' using errcode = '22023';
  end if;
  if coalesce(p_paid_by, '') not in ('driver', 'company') then
    raise exception 'Chọn người trả tiền' using errcode = '22023';
  end if;
  return private.insert_expense(s, c, p_amount, p_incurred_at, p_note, 'admin', p_paid_by,
    coalesce(p_driver_id, s.driver_id), auth.uid(), p_custom, p_client_request_id, null);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Duyệt / từ chối (Giám đốc) và chuyển tiền ứng (Kế toán)
-- -----------------------------------------------------------------------------
create or replace function public.approval_decide(p_request_id uuid, p_action text, p_comment text default null, p_amount numeric default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.approval_requests;
  v_type text;
  v_next int;
  v_amount numeric;
begin
  select * into r from public.approval_requests where id = p_request_id for update;
  if r.id is null then
    raise exception 'Không tìm thấy yêu cầu' using errcode = 'P0001';
  end if;
  if r.status <> 'pending' then
    raise exception 'Yêu cầu không còn chờ duyệt' using errcode = '22023';
  end if;
  if not private.can_approve(r.id) then
    raise exception 'Bạn không được duyệt yêu cầu này (không đúng cấp duyệt hoặc là khoản của chính bạn)' using errcode = '42501';
  end if;
  select code into v_type from public.approval_types where id = r.approval_type_id;

  if p_action = 'reject' then
    if length(trim(coalesce(p_comment, ''))) = 0 then
      raise exception 'Nhập lý do từ chối' using errcode = '22023';
    end if;
    insert into public.approval_steps (request_id, level, action, actor_id, comment) values (r.id, r.current_level, 'reject', auth.uid(), trim(p_comment));
    update public.approval_requests set status = 'rejected', reject_reason = trim(p_comment), decided_at = now() where id = r.id;
    if r.entity_type = 'advance_request' then
      update public.advance_requests set status = 'rejected' where id = r.entity_id;
    elsif r.entity_type = 'shipment_expense' then
      update public.shipment_expenses set status = 'rejected' where id = r.entity_id;
    end if;
    if r.requested_by is not null then
      insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, link)
      values (r.requested_by, 'approval_rejected', 'Bị từ chối: ' || r.content, trim(p_comment), 'approval_request', r.id, '/phe-duyet');
    end if;
    return jsonb_build_object('ok', true, 'status', 'rejected');
  end if;

  if p_action <> 'approve' then
    raise exception 'Thao tác không hợp lệ' using errcode = '22023';
  end if;

  v_amount := r.amount;
  if p_amount is not null then
    if r.entity_type <> 'advance_request' then
      raise exception 'Chỉ được sửa số tiền khi duyệt ứng tiền' using errcode = '22023';
    end if;
    if p_amount <= 0 or p_amount > r.amount then
      raise exception 'Số tiền duyệt phải lớn hơn 0 và không vượt số tiền xin ứng' using errcode = '22023';
    end if;
    v_amount := p_amount;
  end if;

  insert into public.approval_steps (request_id, level, action, actor_id, comment)
  values (r.id, r.current_level, 'approve', auth.uid(),
          nullif(trim(coalesce(p_comment, '')), '') || case when v_amount <> r.amount then ' (duyệt ' || to_char(v_amount, 'FM999G999G999G990') || ' đ)' else '' end);
  select min(l) into v_next from unnest(r.levels) l where l > r.current_level;
  if v_next is not null then
    update public.approval_requests set current_level = v_next where id = r.id;
    if r.entity_type = 'advance_request' and v_amount <> r.amount then
      update public.advance_requests set amount_approved = v_amount where id = r.entity_id;
    end if;
    perform private.notify_approvers(r.id);
    return jsonb_build_object('ok', true, 'status', 'pending', 'level', v_next);
  end if;

  update public.approval_requests set status = 'approved', decided_at = now() where id = r.id;
  if r.entity_type = 'advance_request' then
    update public.advance_requests
       set status = 'approved', amount_approved = least(coalesce(amount_approved, v_amount), v_amount)
     where id = r.entity_id;
    perform private.notify_permission_holders('advances.pay', 'advance_to_pay', 'Chờ chuyển tiền: ' || r.content, null,
      'advance_request', r.entity_id, '/chi-phi?tab=advances&f_status=approved');
  elsif r.entity_type = 'shipment_expense' then
    update public.shipment_expenses set status = 'approved' where id = r.entity_id;
  end if;
  if r.requested_by is not null then
    insert into public.notifications (recipient_id, type, title, entity_type, entity_id, link)
    values (r.requested_by, 'approval_approved', 'Đã duyệt: ' || r.content, 'approval_request', r.id, '/phe-duyet');
  end if;
  return jsonb_build_object('ok', true, 'status', 'approved');
end;
$$;

create or replace function public.pay_advance(
  p_advance_id uuid, p_payment_method_id uuid default null, p_company_bank_account_id uuid default null,
  p_reference_no text default null, p_paid_at timestamptz default null, p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.advance_requests;
  p public.payments;
  v_amount numeric;
begin
  if not private.has_perm('advances.pay') then
    raise exception 'Bạn không có quyền chuyển tiền ứng' using errcode = '42501';
  end if;
  select * into a from public.advance_requests where id = p_advance_id for update;
  if a.id is null then
    raise exception 'Không tìm thấy yêu cầu ứng tiền' using errcode = 'P0001';
  end if;
  if a.status = 'paid' then
    raise exception 'Yêu cầu này đã chuyển tiền' using errcode = '22023';
  end if;
  if a.status <> 'approved' then
    raise exception 'Chỉ chuyển tiền cho yêu cầu đã được duyệt' using errcode = '22023';
  end if;
  v_amount := coalesce(a.amount_approved, a.amount_requested);
  insert into public.payments (direction, purpose, payment_method_id, company_bank_account_id, amount, paid_at, driver_id, shipment_id,
    approval_request_id, advance_request_id, reference_no, note)
  values ('out', 'advance', p_payment_method_id, p_company_bank_account_id, v_amount, coalesce(p_paid_at, now()), a.driver_id, a.shipment_id,
    a.approval_request_id, a.id, nullif(trim(coalesce(p_reference_no, '')), ''), nullif(trim(coalesce(p_note, '')), ''))
  returning * into p;
  insert into public.advance_transactions (driver_id, shipment_id, advance_request_id, payment_id, txn_type, amount, occurred_at, note)
  values (a.driver_id, a.shipment_id, a.id, p.id, 'disbursement', v_amount, p.paid_at, 'Chuyển tiền ứng ' || a.code);
  update public.advance_requests set status = 'paid', payment_method_id = p_payment_method_id where id = a.id;
  if a.approval_request_id is not null then
    update public.approval_requests set status = 'paid' where id = a.approval_request_id;
    insert into public.approval_steps (request_id, level, action, actor_id, comment)
    values (a.approval_request_id, 99, 'mark_paid', auth.uid(), 'Chuyển tiền ' || p.code);
  end if;
  if a.requested_by is not null then
    insert into public.notifications (recipient_id, type, title, entity_type, entity_id, link)
    values (a.requested_by, 'advance_paid', 'Đã chuyển tiền ứng ' || a.code || ': ' || to_char(v_amount, 'FM999G999G999G990') || ' đ',
            'advance_request', a.id, '/chi-phi?tab=advances');
  end if;
  return p.code;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Tài xế (qua link): xin ứng tiền, nhập chi phí, xem và hủy yêu cầu
-- -----------------------------------------------------------------------------
create or replace function private.driver_link_driver(p_vehicle_id uuid)
returns public.drivers
language sql
stable
security definer
set search_path = ''
as $$
  select d.* from public.vehicles v join public.drivers d on d.id = v.assigned_driver_id
  where v.id = p_vehicle_id and d.archived_at is null;
$$;
revoke all on function private.driver_link_driver(uuid) from public, anon, authenticated;

create or replace function public.driver_link_finance(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me record;
  d public.drivers;
  v_month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh';
begin
  select * into v_me from private.driver_link_session(p_token);
  if v_me.vehicle_id is null then
    return jsonb_build_object('ok', false, 'expired', true);
  end if;
  d := private.driver_link_driver(v_me.vehicle_id);
  return jsonb_build_object(
    'ok', true,
    'driver_id', d.id,
    'driver_name', d.full_name,
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'group', c.group_name, 'requires_image', c.requires_image,
                                          'requires_approval', c.requires_approval) order by c.sort_order, c.name)
      from public.expense_categories c where c.is_active and 'driver' = any (c.allowed_role_codes)), '[]'::jsonb),
    'advances', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'code', a.code, 'amount', a.amount_requested, 'approved', a.amount_approved,
                                          'reason', a.reason, 'status', a.status, 'created_at', a.created_at,
                                          'shipment_code', s.shipment_code, 'reject_reason', ar.reject_reason) order by a.created_at desc)
      from public.advance_requests a
      left join public.shipments s on s.id = a.shipment_id
      left join public.approval_requests ar on ar.id = a.approval_request_id
      where a.driver_id = d.id and a.created_at > now() - interval '62 days'), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'code', e.code, 'amount', e.amount, 'category', c.name, 'note', e.note,
                                          'status', e.status, 'incurred_at', e.incurred_at, 'shipment_code', s.shipment_code,
                                          'reject_reason', ar.reject_reason,
                                          'files', (select count(*) from public.documents doc where doc.entity_type = 'shipment_expense' and doc.entity_id = e.id))
                        order by e.incurred_at desc)
      from public.shipment_expenses e
      join public.expense_categories c on c.id = e.category_id
      join public.shipments s on s.id = e.shipment_id
      left join public.approval_requests ar on ar.id = e.approval_request_id
      where e.driver_id = d.id and e.source = 'driver' and e.incurred_at > now() - interval '62 days'), '[]'::jsonb),
    'month', jsonb_build_object(
      'advance_paid', (select coalesce(sum(t.amount), 0) from public.advance_transactions t
                        where t.driver_id = d.id and t.txn_type = 'disbursement' and t.occurred_at >= v_month_start),
      'expense_approved', (select coalesce(sum(e.amount), 0) from public.shipment_expenses e
                            where e.driver_id = d.id and e.paid_by = 'driver' and e.status = 'approved' and e.incurred_at >= v_month_start),
      'expense_pending', (select coalesce(sum(e.amount), 0) from public.shipment_expenses e
                           where e.driver_id = d.id and e.paid_by = 'driver' and e.status = 'pending' and e.incurred_at >= v_month_start))
  );
end;
$$;

create or replace function public.driver_link_request_advance(
  p_token text, p_amount numeric, p_reason text, p_shipment_id uuid default null, p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me record;
  d public.drivers;
  v_s public.shipments;
  v_id uuid;
  v_code text;
begin
  select * into v_me from private.driver_link_session(p_token);
  if v_me.vehicle_id is null then
    return jsonb_build_object('ok', false, 'error', 'Phiên đã hết hạn. Vui lòng nhập lại số xe.', 'expired', true);
  end if;
  if p_client_request_id is not null and exists (select 1 from public.advance_requests where client_request_id = p_client_request_id) then
    return jsonb_build_object('ok', true);
  end if;
  if p_shipment_id is not null then
    select * into v_s from public.shipments where id = p_shipment_id;
    if v_s.id is null or not private.driver_link_visible(v_me.vehicle_id, v_s) then
      return jsonb_build_object('ok', false, 'error', 'Chuyến này không thuộc xe của bạn.');
    end if;
    select * into d from public.drivers where id = v_s.driver_id;
  else
    d := private.driver_link_driver(v_me.vehicle_id);
  end if;
  if d.id is null then
    return jsonb_build_object('ok', false, 'error', 'Xe chưa được gán tài xế. Vui lòng gọi điều phối.');
  end if;
  if coalesce(p_amount, 0) <= 0 or p_amount > 1000000000 then
    return jsonb_build_object('ok', false, 'error', 'Nhập số tiền cần ứng.');
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Nhập lý do ứng tiền.');
  end if;
  insert into public.advance_requests (driver_id, shipment_id, amount_requested, reason, status, client_request_id)
  values (d.id, p_shipment_id, round(p_amount), left(trim(p_reason), 500), 'pending', p_client_request_id)
  returning id, code into v_id, v_code;
  update public.advance_requests set approval_request_id = private.submit_approval(
    'advance', 'advance_request', v_id, p_shipment_id, round(p_amount),
    'Ứng tiền ' || v_code || ' – ' || d.full_name || ': ' || left(trim(p_reason), 200), null, d.id, d.full_name || ' (điện thoại)')
  where id = v_id;
  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;

create or replace function public.driver_link_add_expense(
  p_token text, p_shipment_id uuid, p_category_id uuid, p_amount numeric, p_note text default null,
  p_ticket uuid default null, p_client_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me record;
  v_s public.shipments;
  c public.expense_categories;
  v_id uuid;
  v_counts jsonb;
  v_files int;
begin
  select * into v_me from private.driver_link_session(p_token);
  if v_me.vehicle_id is null then
    return jsonb_build_object('ok', false, 'error', 'Phiên đã hết hạn. Vui lòng nhập lại số xe.', 'expired', true);
  end if;
  if p_client_request_id is not null and exists (select 1 from public.shipment_expenses where client_request_id = p_client_request_id) then
    return jsonb_build_object('ok', true);
  end if;
  select * into v_s from public.shipments where id = p_shipment_id;
  if v_s.id is null or not private.driver_link_visible(v_me.vehicle_id, v_s) then
    return jsonb_build_object('ok', false, 'error', 'Chọn chuyến của xe bạn.');
  end if;
  if v_s.status not in ('accepted', 'in_transit', 'driver_completed', 'closed') then
    return jsonb_build_object('ok', false, 'error', 'Chỉ nhập chi phí cho chuyến đã nhận.');
  end if;
  select * into c from public.expense_categories
   where id = p_category_id and is_active and 'driver' = any (allowed_role_codes);
  if c.id is null then
    return jsonb_build_object('ok', false, 'error', 'Chọn loại chi phí.');
  end if;
  if coalesce(p_amount, 0) <= 0 or p_amount > 1000000000 then
    return jsonb_build_object('ok', false, 'error', 'Nhập số tiền.');
  end if;

  v_id := private.insert_expense(v_s, c, round(p_amount), now(), left(p_note, 500), 'driver', 'driver', v_s.driver_id, null,
    '{}'::jsonb, p_client_request_id, (select full_name from public.drivers where id = v_s.driver_id) || ' (điện thoại)');
  v_counts := private.driver_attach_uploads(p_ticket, v_me.vehicle_id, 'shipment_expense', v_id, array['receipt', 'invoice', 'photo']);
  v_files := coalesce((select sum(value::int) from jsonb_each_text(v_counts)), 0);
  if c.requires_image and v_files = 0 then
    raise exception 'Loại chi phí "%" cần ảnh hóa đơn/biên lai', c.name using errcode = '22023';
  end if;
  return jsonb_build_object('ok', true, 'code', (select code from public.shipment_expenses where id = v_id),
                            'needs_approval', c.requires_approval);
exception when sqlstate '22023' then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$$;

create or replace function public.driver_link_cancel(p_token text, p_kind text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me record;
  d public.drivers;
  v_req uuid;
  v_hit boolean := false;
begin
  select * into v_me from private.driver_link_session(p_token);
  if v_me.vehicle_id is null then
    return jsonb_build_object('ok', false, 'error', 'Phiên đã hết hạn. Vui lòng nhập lại số xe.', 'expired', true);
  end if;
  d := private.driver_link_driver(v_me.vehicle_id);
  if p_kind = 'advance' then
    update public.advance_requests set status = 'cancelled'
     where id = p_id and driver_id = d.id and status = 'pending' returning approval_request_id into v_req;
    v_hit := found;
  elsif p_kind = 'expense' then
    update public.shipment_expenses set status = 'cancelled'
     where id = p_id and driver_id = d.id and source = 'driver' and status = 'pending' returning approval_request_id into v_req;
    v_hit := found;
  end if;
  if not v_hit then
    return jsonb_build_object('ok', false, 'error', 'Chỉ hủy được yêu cầu đang chờ duyệt.');
  end if;
  if v_req is not null then
    update public.approval_requests set status = 'cancelled', decided_at = now() where id = v_req and status = 'pending';
    insert into public.approval_steps (request_id, level, action, actor_label) values (v_req, 0, 'cancel', d.full_name || ' (điện thoại)');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Danh sách cho màn hình quản lý (theo RLS của người xem)
-- -----------------------------------------------------------------------------
create or replace function private.requester_name(p_profile uuid, p_driver uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select coalesce(nullif(trim(p.full_name), ''), split_part(p.email, '@', 1)) from public.profiles p where p.id = p_profile),
    (select d.full_name || ' (tài xế)' from public.drivers d where d.id = p_driver));
$$;
revoke all on function private.requester_name(uuid, uuid) from public, anon;
grant execute on function private.requester_name(uuid, uuid) to authenticated;

create or replace view public.approval_list with (security_invoker = true) as
select r.id, r.code, r.approval_type_id, t.name as type_name, t.code as type_code,
       r.entity_type, r.entity_id, r.shipment_id, s.shipment_code,
       r.requested_driver_id as driver_id, d.full_name as driver_name,
       private.requester_name(r.requested_by, r.requested_driver_id) as requester_name,
       r.requested_at, r.amount, r.content, r.status, r.current_level, r.required_levels, r.reject_reason,
       r.decided_at, r.due_at, (r.status = 'pending' and r.due_at < now()) as overdue,
       private.can_approve(r.id) as can_approve,
       (select string_agg(coalesce(ro.name, private.requester_name(ar.approver_user_id, null)), ', ')
          from public.approval_rules ar left join public.roles ro on ro.id = ar.approver_role_id
         where ar.approval_type_id = r.approval_type_id and ar.is_active and ar.level = r.current_level
           and coalesce(r.amount, 0) >= ar.min_amount and (ar.max_amount is null or coalesce(r.amount, 0) <= ar.max_amount)) as approver_label,
       coalesce(a.amount_approved, r.amount) as amount_approved,
       (select count(*) from public.documents doc where doc.archived_at is null
          and doc.entity_type = r.entity_type and doc.entity_id = r.entity_id) as file_count
from public.approval_requests r
join public.approval_types t on t.id = r.approval_type_id
left join public.shipments s on s.id = r.shipment_id
left join public.drivers d on d.id = r.requested_driver_id
left join public.advance_requests a on r.entity_type = 'advance_request' and a.id = r.entity_id;

create or replace view public.advance_list with (security_invoker = true) as
select a.id, a.code, a.driver_id, d.full_name as driver_name, d.code as driver_code, a.shipment_id, s.shipment_code,
       a.amount_requested, a.amount_approved, coalesce(a.amount_approved, a.amount_requested) as amount_to_pay,
       a.reason, a.note, a.status, a.created_at, a.approval_request_id,
       private.requester_name(a.requested_by, case when a.requested_by is null then a.driver_id end) as requester_name,
       ar.reject_reason, ar.decided_at, p.code as payment_code, p.paid_at, p.reference_no,
       (a.status = 'approved' and private.has_perm('advances.pay')) as can_pay,
       a.custom_fields
from public.advance_requests a
join public.drivers d on d.id = a.driver_id
left join public.shipments s on s.id = a.shipment_id
left join public.approval_requests ar on ar.id = a.approval_request_id
left join public.payments p on p.advance_request_id = a.id and p.status = 'posted' and p.purpose = 'advance';

create or replace view public.expense_list with (security_invoker = true) as
select e.id, e.code, e.shipment_id, s.shipment_code, e.category_id, c.name as category_name, c.report_bucket,
       e.amount, e.incurred_at, e.note, e.source, e.paid_by, e.driver_id, d.full_name as driver_name,
       v.plate_number, e.status, e.created_at, e.approval_request_id, ar.reject_reason,
       private.requester_name(e.entered_by, case when e.entered_by is null then e.driver_id end) as entered_by_name,
       (select count(*) from public.documents doc where doc.entity_type = 'shipment_expense' and doc.entity_id = e.id and doc.archived_at is null) as file_count,
       e.custom_fields
from public.shipment_expenses e
join public.shipments s on s.id = e.shipment_id
join public.expense_categories c on c.id = e.category_id
left join public.drivers d on d.id = e.driver_id
left join public.vehicles v on v.id = s.vehicle_id
left join public.approval_requests ar on ar.id = e.approval_request_id;

-- -----------------------------------------------------------------------------
-- 8. Quyền gọi hàm
-- -----------------------------------------------------------------------------
revoke all on function public.driver_link_upload_ticket(text, uuid, text) from public;
revoke all on function public.driver_link_start(text, uuid) from public;
revoke all on function public.driver_link_complete(text, uuid, uuid, text, text) from public;
revoke all on function public.driver_link_trips(text) from public;
revoke all on function public.driver_link_finance(text) from public;
revoke all on function public.driver_link_request_advance(text, numeric, text, uuid, uuid) from public;
revoke all on function public.driver_link_add_expense(text, uuid, uuid, numeric, text, uuid, uuid) from public;
revoke all on function public.driver_link_cancel(text, text, uuid) from public;
grant execute on function public.driver_link_upload_ticket(text, uuid, text) to anon, authenticated;
grant execute on function public.driver_link_start(text, uuid) to anon, authenticated;
grant execute on function public.driver_link_complete(text, uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.driver_link_trips(text) to anon, authenticated;
grant execute on function public.driver_link_finance(text) to anon, authenticated;
grant execute on function public.driver_link_request_advance(text, numeric, text, uuid, uuid) to anon, authenticated;
grant execute on function public.driver_link_add_expense(text, uuid, uuid, numeric, text, uuid, uuid) to anon, authenticated;
grant execute on function public.driver_link_cancel(text, text, uuid) to anon, authenticated;

revoke all on function public.create_advance_request(uuid, numeric, text, uuid, text, jsonb, uuid) from public, anon;
revoke all on function public.add_shipment_expense(uuid, uuid, numeric, timestamptz, text, text, uuid, jsonb, uuid) from public, anon;
revoke all on function public.approval_decide(uuid, text, text, numeric) from public, anon;
revoke all on function public.pay_advance(uuid, uuid, uuid, text, timestamptz, text) from public, anon;
grant execute on function public.create_advance_request(uuid, numeric, text, uuid, text, jsonb, uuid) to authenticated;
grant execute on function public.add_shipment_expense(uuid, uuid, numeric, timestamptz, text, text, uuid, jsonb, uuid) to authenticated;
grant execute on function public.approval_decide(uuid, text, text, numeric) to authenticated;
grant execute on function public.pay_advance(uuid, uuid, uuid, text, timestamptz, text) to authenticated;

revoke all on public.approval_list, public.advance_list, public.expense_list from anon;
grant select on public.approval_list, public.advance_list, public.expense_list to authenticated;

commit;
