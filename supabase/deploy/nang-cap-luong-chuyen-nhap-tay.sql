-- =============================================================================
-- KHÁNH HÀ TMS – NÂNG CẤP CƠ SỞ DỮ LIỆU: Lương chuyến do điều phối nhập theo từng chuyến (bỏ bảng giá cố định), lương cơ bản giữ như cũ
-- Dán toàn bộ tệp vào Supabase → SQL Editor → Run. Chạy MỘT LẦN trên CSDL đang dùng.
-- Không xóa và không thêm dữ liệu nghiệp vụ. Tệp được ghép tự động – không sửa tay.
-- =============================================================================
begin;

do $$ begin
  if to_regprocedure('public.save_shipment_driver_pays(jsonb)') is not null then
    raise exception 'CSDL đã được nâng cấp Lương chuyến do điều phối nhập theo từng chuyến (bỏ bảng giá cố định), lương cơ bản giữ như cũ trước đó, không cần chạy lại.';
  end if;
end $$;

-- >>> 20261118000074_trip_pay_entered.sql
-- =============================================================================
-- 0074 Lương chuyến do điều phối nhập từng chuyến (bỏ tính theo bảng giá cố định)
--   * Người dùng 2026-11-18: lương chuyến không thiết lập theo bảng cố định; điều phối nhập
--     lương của từng chuyến ngay ở Điều phối / Quản lý chuyến, bảng lương cộng các chuyến.
--   * shipments.driver_pay_override là "Lương chuyến" điều phối / kế toán nhập (ghi chú không bắt buộc).
--   * Chuyến chưa nhập: lấy Lương mỗi chuyến (cũ) trong hồ sơ tài xế nếu có, không có = "Chưa nhập lương" (tính 0, bảng lương cảnh báo). Lương cơ bản, phụ cấp giữ nguyên.
--   * Một lần: chuyến chưa có bảng lương mà bảng giá cũ tính được giá thì điền sẵn số đó (không mất số cũ).
--   * Bảng giá cố định (trip_pay_rates, vùng lương) giữ dữ liệu nhưng không dùng để tính nữa.
--   * Gợi ý khi nhập: số đã nhập lần gần nhất cho cùng tuyến (hai chiều).
-- =============================================================================

-- Điền sẵn số từ bảng giá cũ cho chuyến chưa nhập và chưa nằm trong bảng lương đã lập
update public.shipments s
set driver_pay_override = x.amount,
    driver_pay_note = coalesce(s.driver_pay_note, 'Lấy từ bảng giá cũ')
from (
  select s2.id, r.amount
  from public.shipments s2
  join public.drivers d on d.id = s2.driver_id and not coalesce(d.is_outsourced, false) and d.supplier_id is null and d.pay_type <> 'monthly_only'
  cross join lateral private.trip_pay_rate_for(s2.driver_id, s2.pickup_location_id, s2.delivery_location_id, s2.vehicle_type_id,
    coalesce((s2.completed_at at time zone 'Asia/Ho_Chi_Minh')::date, (s2.pickup_at at time zone 'Asia/Ho_Chi_Minh')::date)) r
  where s2.driver_pay_override is null and r.amount is not null
    and s2.status not in ('cancelled', 'draft')
    and not private.shipment_is_3pl(s2.vehicle_id)
    and not exists (select 1 from public.driver_payrolls p
                    where p.driver_id = s2.driver_id and p.status not in ('cancelled', 'rejected')
                      and s2.completed_at is not null
                      and p.period_month = date_trunc('month', (s2.completed_at at time zone 'Asia/Ho_Chi_Minh'))::date)
) x
where x.id = s.id;

-- Gợi ý: số đã nhập gần nhất cho cùng tuyến (hai chiều)
create or replace function private.trip_pay_suggest(p_pickup uuid, p_delivery uuid, p_exclude uuid default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select s.driver_pay_override from public.shipments s
  where s.driver_pay_override is not null and s.status <> 'cancelled' and s.id is distinct from p_exclude
    and ((s.pickup_location_id = p_pickup and s.delivery_location_id = p_delivery)
      or (s.pickup_location_id = p_delivery and s.delivery_location_id = p_pickup))
  order by s.pickup_at desc limit 1;
$$;
revoke all on function private.trip_pay_suggest(uuid, uuid, uuid) from public, anon;
grant execute on function private.trip_pay_suggest(uuid, uuid, uuid) to authenticated;

-- Quyền nhập lương chuyến: điều phối hoặc kế toán
create or replace function private.can_enter_trip_pay()
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.has_perm('dispatch.update') or private.has_perm('settlements.update');
$$;
grant execute on function private.can_enter_trip_pay() to authenticated;

-- Lương chuyến của các chuyến đang xem (cột Lương chuyến ở Điều phối, Quản lý chuyến)
create or replace function public.shipment_driver_pay(p_ids uuid[])
returns table (id uuid, amount numeric, source text, override numeric, note text, can_override boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_perm('dispatch.view') or private.has_perm('settlements.view') or private.has_perm('settlements.update')) then
    return;
  end if;
  return query
  select s.id,
         case when d.pay_type = 'monthly_only' then 0::numeric else coalesce(s.driver_pay_override, nullif(d.per_trip_salary, 0)) end,
         case when d.pay_type = 'monthly_only' then 'monthly_only'
              when s.driver_pay_override is not null then 'manual'
              when coalesce(d.per_trip_salary, 0) > 0 then 'driver_legacy'
              else 'missing' end,
         case when s.driver_pay_override is null then private.trip_pay_suggest(s.pickup_location_id, s.delivery_location_id, s.id) end,
         s.driver_pay_note, private.can_enter_trip_pay()
  from public.shipments s
  join public.drivers d on d.id = s.driver_id and not coalesce(d.is_outsourced, false) and d.supplier_id is null
  where s.id = any(p_ids[1:2000]) and s.status <> 'cancelled' and not private.shipment_is_3pl(s.vehicle_id);
end;
$$;

-- Điều phối / kế toán nhập lương một chuyến (null = xóa số đã nhập)
create or replace function public.set_shipment_driver_pay(p_shipment_id uuid, p_amount numeric, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_enter_trip_pay() then
    raise exception 'Bạn không có quyền nhập lương chuyến' using errcode = '42501';
  end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 100000000) then
    raise exception 'Lương chuyến không hợp lệ' using errcode = '22023';
  end if;
  if exists (select 1 from public.driver_payrolls p
             join public.shipments s on s.driver_id = p.driver_id and s.id = p_shipment_id
             where p.status not in ('cancelled', 'rejected') and s.completed_at is not null
               and p.period_month = date_trunc('month', (s.completed_at at time zone 'Asia/Ho_Chi_Minh'))::date) then
    raise exception 'Tài xế đã có bảng lương tháng của chuyến này, hủy bảng lương đó trước khi sửa' using errcode = '22023';
  end if;
  update public.shipments
     set driver_pay_override = p_amount,
         driver_pay_note = case when p_amount is null then null else nullif(left(trim(coalesce(p_note, '')), 300), '') end,
         updated_by = auth.uid(), updated_at = now()
   where id = p_shipment_id and status <> 'cancelled';
  if not found then
    raise exception 'Không tìm thấy chuyến' using errcode = 'P0002';
  end if;
end;
$$;

-- Nhập nhiều chuyến một lần (trang Nhập lương chuyến)
create or replace function public.save_shipment_driver_pays(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  n int := 0;
begin
  if not private.can_enter_trip_pay() then
    raise exception 'Bạn không có quyền nhập lương chuyến' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Dữ liệu không hợp lệ' using errcode = '22023';
  end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    continue when nullif(r ->> 'amount', '') is null;
    perform public.set_shipment_driver_pay((r ->> 'id')::uuid, (r ->> 'amount')::numeric, r ->> 'note');
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.save_shipment_driver_pays(jsonb) from public, anon;
grant execute on function public.save_shipment_driver_pays(jsonb) to authenticated;

-- Chuyến chưa nhập lương (xe nội bộ, đã chỉ định tài xế, ngày nhận trong khoảng)
create or replace function public.trips_missing_driver_pay(p_from date, p_to date, p_only_missing boolean default true)
returns table (id uuid, shipment_code text, pickup_date date, status text, driver_id uuid, driver_name text, plate_number text,
               pickup_name text, delivery_name text, amount numeric, note text, suggested numeric, locked boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (private.has_perm('dispatch.view') or private.has_perm('settlements.view') or private.has_perm('settlements.update')) then
    raise exception 'Bạn không có quyền xem' using errcode = '42501';
  end if;
  if p_to - p_from > 400 then
    raise exception 'Khoảng ngày tối đa 400 ngày' using errcode = '22023';
  end if;
  return query
  select s.id, s.shipment_code, (s.pickup_at at time zone 'Asia/Ho_Chi_Minh')::date, s.status, s.driver_id, d.full_name, v.plate_number,
         pl.name, dl.name, s.driver_pay_override, s.driver_pay_note,
         case when s.driver_pay_override is null then private.trip_pay_suggest(s.pickup_location_id, s.delivery_location_id, s.id) end,
         exists (select 1 from public.driver_payrolls p where p.driver_id = s.driver_id and p.status not in ('cancelled', 'rejected')
                   and s.completed_at is not null
                   and p.period_month = date_trunc('month', (s.completed_at at time zone 'Asia/Ho_Chi_Minh'))::date)
  from public.shipments s
  join public.drivers d on d.id = s.driver_id and not coalesce(d.is_outsourced, false) and d.supplier_id is null and d.pay_type <> 'monthly_only'
  left join public.vehicles v on v.id = s.vehicle_id
  left join public.locations pl on pl.id = s.pickup_location_id
  left join public.locations dl on dl.id = s.delivery_location_id
  where s.status not in ('cancelled', 'draft')
    and (s.pickup_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
    and not private.shipment_is_3pl(s.vehicle_id)
    and (not p_only_missing or s.driver_pay_override is null)
  order by s.pickup_at, s.shipment_code
  limit 3000;
end;
$$;
revoke all on function public.trips_missing_driver_pay(date, date, boolean) from public, anon;
grant execute on function public.trips_missing_driver_pay(date, date, boolean) to authenticated;

-- Số chuyến đã tới ngày nhận (60 ngày gần đây) mà chưa nhập lương: cảnh báo trên Điều phối
create or replace function public.trip_pay_missing_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when private.has_perm('dispatch.view') or private.has_perm('settlements.view') or private.has_perm('settlements.update') then (
    select count(*)::int from public.shipments s
    join public.drivers d on d.id = s.driver_id and not coalesce(d.is_outsourced, false) and d.supplier_id is null and d.pay_type <> 'monthly_only'
    where s.status not in ('cancelled', 'draft') and s.driver_pay_override is null and coalesce(d.per_trip_salary, 0) = 0
      and (s.pickup_at at time zone 'Asia/Ho_Chi_Minh')::date between (now() at time zone 'Asia/Ho_Chi_Minh')::date - 60 and (now() at time zone 'Asia/Ho_Chi_Minh')::date
      and not private.shipment_is_3pl(s.vehicle_id))
  else 0 end;
$$;
revoke all on function public.trip_pay_missing_count() from public, anon;
grant execute on function public.trip_pay_missing_count() to authenticated;

-- Bảng giá cố định không còn nhắc trên Điều phối
create or replace function public.route_pay_gap_count()
returns integer
language sql
stable
set search_path = ''
as $$ select 0; $$;

-- Bảng kê lương chuyến: số điều phối nhập
create or replace view public.trip_pay_lines with (security_invoker = true) as
select s.id, s.shipment_code, s.driver_id, d.full_name as driver_name, d.code as driver_code, d.pay_type,
       (s.completed_at at time zone 'Asia/Ho_Chi_Minh')::date as trip_date,
       date_trunc('month', (s.completed_at at time zone 'Asia/Ho_Chi_Minh'))::date as period_month,
       to_char((s.completed_at at time zone 'Asia/Ho_Chi_Minh'), 'MM/YYYY') as period_label,
       s.pickup_location_id, s.delivery_location_id, s.empty_return_location_id, s.vehicle_type_id, s.vehicle_id,
       null::uuid as rate_id, null::text as rate_scope,
       case when d.pay_type = 'monthly_only' then 0::numeric else coalesce(s.driver_pay_override, nullif(d.per_trip_salary, 0)) end as pay_amount,
       case when d.pay_type = 'monthly_only' then 'monthly_only'
            when s.driver_pay_override is not null then 'manual'
            when coalesce(d.per_trip_salary, 0) > 0 then 'driver_legacy'
            else 'missing' end as pay_source,
       (d.pay_type <> 'monthly_only' and s.driver_pay_override is null and coalesce(d.per_trip_salary, 0) = 0) as missing_rate,
       s.status,
       null::text as trip_direction,
       null::numeric as return_percent,
       null::numeric(18, 2) as rate_amount,
       s.driver_pay_note as pay_note
from public.shipments s
join public.drivers d on d.id = s.driver_id and not coalesce(d.is_outsourced, false)
where s.status in ('driver_completed', 'closed') and s.completed_at is not null
  and not private.shipment_is_3pl(s.vehicle_id)
  and ((select private.has_perm('settlements.view')) or (select private.has_perm('settlements.update')));
grant select on public.trip_pay_lines to authenticated;
revoke all on public.trip_pay_lines from anon;

-- Bảng lương: lương chuyến = tổng số điều phối nhập của các chuyến hoàn thành trong tháng
create or replace function private.payroll_compute(p_driver_id uuid, p_month date, p_bonus numeric, p_deduction numeric, p_manual jsonb default '{}'::jsonb,
  p_offset_advance boolean default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d public.drivers;
  v_from date := date_trunc('month', p_month)::date;
  v_to date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_trips int;
  v_workdays int;
  v_missing int;
  v_exp_count int;
  v_exp numeric;
  v_balance numeric;
  v_trip_salary numeric;
  v_base numeric := 0;
  v_meal numeric := 0;
  v_other numeric := 0;
  v_comp_deduct numeric := 0;
  v_gross numeric;
  v_offset numeric;
  v_setup boolean;
  v_lines jsonb := '[]'::jsonb;
  c record;
  v_rate numeric;
  v_qty numeric;
  v_amt numeric;
  v_offday_trips int;
  v_do_offset boolean := coalesce(p_offset_advance, private.payroll_setting_bool('payroll.offset_advance', true));
  v_exp_lines jsonb;
  v_att record;
  v_standard int;
begin
  select * into d from public.drivers where id = p_driver_id;
  if d.id is null then
    raise exception 'Không tìm thấy tài xế' using errcode = 'P0001';
  end if;
  if coalesce(p_bonus, 0) < 0 or coalesce(p_deduction, 0) < 0 then
    raise exception 'Thưởng và khấu trừ không được âm' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_manual, '{}'::jsonb)) <> 'object' then
    raise exception 'Khoản nhập tay không hợp lệ' using errcode = '22023';
  end if;
  -- Chuyến hoàn thành trong tháng và đơn giá lương của từng chuyến
  select count(*), count(distinct trip_date), coalesce(sum(pay_amount), 0), count(*) filter (where missing_rate),
         count(*) filter (where private.is_pay_offday(trip_date))
    into v_trips, v_workdays, v_trip_salary, v_missing, v_offday_trips
  from (
    select (s.completed_at at time zone 'Asia/Ho_Chi_Minh')::date as trip_date,
           case when d.pay_type = 'monthly_only' then 0 else coalesce(s.driver_pay_override, d.per_trip_salary, 0) end as pay_amount,
           (d.pay_type <> 'monthly_only' and s.driver_pay_override is null and coalesce(d.per_trip_salary, 0) = 0) as missing_rate
    from public.shipments s
    where s.driver_id = d.id and s.status in ('driver_completed', 'closed')
      and not private.shipment_is_3pl(s.vehicle_id)
      and (s.completed_at at time zone 'Asia/Ho_Chi_Minh')::date between v_from and v_to
  ) t;
  select count(*), coalesce(sum(e.amount), 0) into v_exp_count, v_exp from public.shipment_expenses e
  where e.driver_id = d.id and e.paid_by = 'driver' and e.status = 'approved' and e.payroll_id is null
    and (e.incurred_at at time zone 'Asia/Ho_Chi_Minh')::date <= v_to;
  -- Ngày công theo bảng chấm công
  select count(*) filter (where a.status = 'work') as work,
         count(*) filter (where a.status = 'leave_paid') as leave_paid,
         count(*) filter (where a.status = 'sick') as sick,
         count(*) filter (where a.status = 'leave_unpaid') as leave_unpaid,
         count(*) filter (where a.status = 'absent') as absent,
         count(*) filter (where a.status = 'pending') as pending,
         count(*) filter (where a.status <> 'off' and not private.is_pay_offday(a.work_date)) as standard
    into v_att
  from private.attendance_rows(v_from, v_to, d.id) a;
  v_workdays := coalesce(v_att.work, 0);
  -- Công chuẩn = số ngày trong tháng trừ ngày nghỉ tuần, ngày lễ
  select count(*) into v_standard from generate_series(v_from, v_to, interval '1 day') g where not private.is_pay_offday(g::date);
  -- Hoàn chi phí tài xế tự trả, chia theo danh mục phí (bốc xếp, vá vỏ, vệ sinh cont...)
  select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'count', x.n, 'amount', x.amount) order by x.amount desc), '[]'::jsonb)
    into v_exp_lines
  from (
    select coalesce(ec.name, 'Khác') as name, count(*) as n, sum(e.amount) as amount
    from public.shipment_expenses e
    left join public.expense_categories ec on ec.id = e.category_id
    where e.driver_id = d.id and e.paid_by = 'driver' and e.status = 'approved' and e.payroll_id is null
      and (e.incurred_at at time zone 'Asia/Ho_Chi_Minh')::date <= v_to
    group by coalesce(ec.name, 'Khác')
  ) x;
  v_balance := greatest(private.driver_advance_balance(d.id), 0);

  -- Đã thiết lập lương theo khoản (có mức riêng hoặc khoản có mức mặc định) thì tính theo khoản; chưa thì như cũ
  v_setup := exists (select 1 from public.driver_pay_components x where x.driver_id = d.id and x.effective_from <= v_to)
          or exists (select 1 from public.pay_components x where x.is_active and coalesce(x.default_amount, 0) > 0);

  if not v_setup then
    v_base := case when d.pay_type = 'trip_only' then 0 else coalesce(d.base_salary, 0) end;
    v_meal := coalesce(d.meal_allowance, 0);
    v_other := coalesce(d.other_allowance, 0);
    v_lines := jsonb_build_array(
      jsonb_build_object('code', 'LCB', 'name', 'Lương cơ bản', 'kind', 'income', 'method', 'monthly', 'qty', 1, 'rate', v_base, 'amount', v_base),
      jsonb_build_object('code', 'LCHUYEN', 'name', 'Lương chuyến', 'kind', 'income', 'method', 'trip_rate', 'qty', v_trips, 'rate', null, 'amount', v_trip_salary),
      jsonb_build_object('code', 'PCAN', 'name', 'Phụ cấp ăn uống', 'kind', 'income', 'method', 'monthly', 'qty', 1, 'rate', v_meal, 'amount', v_meal),
      jsonb_build_object('code', 'PCKHAC', 'name', 'Phụ cấp khác', 'kind', 'income', 'method', 'monthly', 'qty', 1, 'rate', v_other, 'amount', v_other));
  else
    for c in select * from public.pay_components where is_active order by sort_order, code loop
      v_rate := private.driver_component_amount(d.id, c.id, v_to);
      v_qty := 1;
      if c.method = 'trip_rate' then
        v_rate := null; v_qty := v_trips; v_amt := v_trip_salary;
      elsif c.code = 'LCB' and d.pay_type = 'trip_only' then
        v_amt := 0;
      elsif c.code = 'LCB' and private.payroll_setting_bool('payroll.deduct_base_unpaid', true) and v_standard > 0
            and coalesce(v_att.leave_unpaid, 0) + coalesce(v_att.absent, 0) > 0 then
        -- Trừ lương cơ bản theo ngày nghỉ không lương / không báo: mức × (1 − ngày nghỉ / công chuẩn)
        v_qty := greatest(v_standard - v_att.leave_unpaid - v_att.absent, 0)::numeric / v_standard;
        v_amt := v_rate * v_qty;
      elsif c.method = 'monthly' then
        v_amt := v_rate;
      elsif c.method = 'per_workday' then
        v_qty := v_workdays; v_amt := v_rate * v_workdays;
      elsif c.method = 'per_trip' then
        v_qty := v_trips; v_amt := v_rate * v_trips;
      elsif c.method = 'per_trip_offday' then
        v_qty := v_offday_trips; v_amt := v_rate * v_offday_trips;
      elsif c.method = 'over_trips' then
        v_qty := greatest(v_trips - coalesce(c.threshold, 0), 0); v_amt := v_rate * v_qty;
      else -- nhập tay khi lập bảng lương
        v_amt := coalesce(nullif(p_manual ->> c.code, '')::numeric, 0);
        if v_amt < 0 then
          raise exception 'Số tiền "%" không được âm', c.name using errcode = '22023';
        end if;
        v_rate := null;
      end if;
      v_amt := round(coalesce(v_amt, 0), 0);
      continue when v_amt = 0 and c.method not in ('trip_rate') and c.code <> 'LCB';
      v_lines := v_lines || jsonb_build_object('code', c.code, 'name', c.name, 'kind', c.kind, 'method', c.method,
        'qty', v_qty, 'rate', v_rate, 'amount', v_amt);
      if c.kind = 'deduction' then
        v_comp_deduct := v_comp_deduct + v_amt;
      elsif c.code = 'LCB' then
        v_base := v_amt;
      elsif c.method = 'trip_rate' then
        null; -- đã nằm trong v_trip_salary
      elsif c.code = 'PCAN' then
        v_meal := v_meal + v_amt;
      else
        v_other := v_other + v_amt;
      end if;
    end loop;
  end if;

  v_gross := v_base + v_trip_salary + v_meal + v_other + coalesce(p_bonus, 0) - coalesce(p_deduction, 0) - v_comp_deduct + v_exp;
  -- Cấn trừ tối đa bằng số được nhận; phần còn lại chuyển sang tháng sau.
  -- Thiết lập "Không trừ tiền ứng vào lương": trả đủ lương, tạm ứng giữ nguyên để tài xế hoàn riêng
  v_offset := case when v_do_offset then least(v_balance, greatest(v_gross, 0)) else 0 end;
  return jsonb_build_object(
    'driver_id', d.id, 'driver_name', d.full_name, 'period_month', v_from, 'period_from', v_from, 'period_to', v_to,
    'pay_type', d.pay_type, 'setup', v_setup,
    'trip_count', v_trips, 'workdays', v_workdays, 'standard_days', v_standard,
    'attendance', jsonb_build_object('work', v_att.work, 'leave_paid', v_att.leave_paid, 'sick', v_att.sick,
      'leave_unpaid', v_att.leave_unpaid, 'absent', v_att.absent, 'pending', v_att.pending), 'trips_missing_rate', v_missing,
    'base_salary', v_base, 'per_trip_salary', coalesce(d.per_trip_salary, 0),
    'trip_salary', v_trip_salary, 'meal_allowance', v_meal, 'other_allowance', v_other,
    'bonus', coalesce(p_bonus, 0), 'deduction', coalesce(p_deduction, 0) + v_comp_deduct,
    'components', v_lines,
    'expense_count', v_exp_count, 'expense_reimbursement', v_exp, 'expense_lines', v_exp_lines,
    'offset_advance', v_do_offset, 'offday_trips', v_offday_trips,
    'advance_balance', v_balance, 'advance_offset', v_offset,
    'gross_amount', v_gross, 'net_amount', greatest(v_gross - v_offset, 0),
    'advance_carry', v_balance - v_offset,
    'existing', (select p.code from public.driver_payrolls p where p.driver_id = d.id and p.period_month = v_from
                   and p.status not in ('cancelled', 'rejected') limit 1));
end;
$$;
revoke all on function private.payroll_compute(uuid, date, numeric, numeric, jsonb, boolean) from public, anon, authenticated;

commit;
