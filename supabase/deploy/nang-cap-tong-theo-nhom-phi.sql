-- =============================================================================
-- KHÁNH HÀ TMS – NÂNG CẤP CƠ SỞ DỮ LIỆU: Thẻ tổng Quản lý chuyến theo nhóm phí (vận chuyển, chi hộ, tờ khai, bốc xếp)
-- Dán toàn bộ tệp vào Supabase → SQL Editor → Run. Chạy MỘT LẦN trên CSDL đang dùng.
-- Không xóa và không thêm dữ liệu nghiệp vụ. Tệp được ghép tự động – không sửa tay.
-- =============================================================================
begin;

do $$ begin
  if to_regclass('public.shipment_fee_role_totals') is not null then
    raise exception 'CSDL đã được nâng cấp Thẻ tổng Quản lý chuyến theo nhóm phí (vận chuyển, chi hộ, tờ khai, bốc xếp) trước đó, không cần chạy lại.';
  end if;
end $$;

-- >>> 20261101000037_shipment_fee_role_totals.sql
-- =============================================================================
-- 0037: Thẻ tổng ở Quản lý chuyến xe theo nhóm phí (yêu cầu người dùng 01/11/2026):
--   Phí vận chuyển = cước (đơn giá × số lượng) + phụ phí + hỗ trợ dầu + phí thuộc nhóm vai trò freight
--                    (phụ thu vé, hạ rỗng xa + BOT, neo xe)
--   Phí chi hộ, Phí tờ khai, Phí bốc xếp, Phí khác = tổng các dòng phí thuộc nhóm tương ứng.
-- =============================================================================

-- Tổng phí từng chuyến theo vai trò nhóm (theo quyền xem chuyến của người gọi)
create or replace view public.shipment_fee_role_totals with (security_invoker = true) as
select s.id as shipment_id,
       s.freight_amount + s.surcharge_amount + s.fuel_support_amount
         + coalesce(sum(sf.amount) filter (where g.report_role = 'freight'), 0) as transport_fee,
       coalesce(sum(sf.amount) filter (where g.report_role = 'pass_through'), 0) as pass_through_fee,
       coalesce(sum(sf.amount) filter (where g.report_role = 'declaration'), 0) as declaration_fee,
       coalesce(sum(sf.amount) filter (where g.report_role = 'loading'), 0) as loading_fee,
       coalesce(sum(sf.amount) filter (where sf.id is not null and coalesce(g.report_role, 'other') = 'other'), 0) as other_fee
from public.shipments s
left join public.shipment_fees sf on sf.shipment_id = s.id
left join public.fee_types ft on ft.id = sf.fee_type_id
left join public.fee_groups g on g.id = ft.fee_group_id
group by s.id;
revoke all on public.shipment_fee_role_totals from anon;
grant select on public.shipment_fee_role_totals to authenticated;

create or replace function public.shipment_list_summary(p_from timestamptz, p_to timestamptz, p_customer_id uuid default null, p_q text default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with f as (
    select l.*, t.transport_fee, t.pass_through_fee, t.declaration_fee, t.loading_fee, t.other_fee
    from public.shipment_list l
    left join public.shipment_fee_role_totals t on t.shipment_id = l.id
    where l.pickup_at >= p_from and l.pickup_at < p_to
      and (p_customer_id is null or l.customer_id = p_customer_id)
      and (coalesce(p_q, '') = '' or concat_ws(' ', l.shipment_code, l.order_code, l.customer_name, l.plate_number, l.driver_name, l.pickup_name, l.delivery_name) ilike '%' || p_q || '%')
  )
  select jsonb_build_object(
    'total', (select count(*) from f),
    'by_status', (select coalesce(jsonb_object_agg(status, jsonb_build_object(
        'count', n, 'freight', freight, 'surcharge', surcharge, 'fuel', fuel, 'revenue', revenue,
        'transport', transport, 'pass_through', pass_through, 'declaration', declaration, 'loading', loading, 'other', other)), '{}'::jsonb)
      from (select status, count(*) as n, sum(freight_amount) as freight, sum(surcharge_amount) as surcharge,
                   sum(fuel_support_amount) as fuel, sum(total_revenue) as revenue,
                   coalesce(sum(transport_fee), 0) as transport, coalesce(sum(pass_through_fee), 0) as pass_through,
                   coalesce(sum(declaration_fee), 0) as declaration, coalesce(sum(loading_fee), 0) as loading,
                   coalesce(sum(other_fee), 0) as other
            from f group by status) x)
  );
$$;
revoke all on function public.shipment_list_summary(timestamptz, timestamptz, uuid, text) from public, anon;
grant execute on function public.shipment_list_summary(timestamptz, timestamptz, uuid, text) to authenticated;

commit;
