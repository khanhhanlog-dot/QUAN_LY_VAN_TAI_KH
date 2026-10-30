-- Mã khách hàng trong các báo cáo: bảng báo cáo hiện mã khách cho gọn, tên khách vẫn chọn hiện được
-- Cột mới thêm vào cuối từng view (create or replace view chỉ cho phép thêm cột ở cuối)

create or replace view public.report_shipment_profit as
select s.id, s.shipment_code, o.order_code,
       (coalesce(s.completed_at, s.pickup_at) at time zone 'Asia/Ho_Chi_Minh')::date as report_date,
       date_trunc('month', coalesce(s.completed_at, s.pickup_at) at time zone 'Asia/Ho_Chi_Minh')::date as report_month,
       o.payer_customer_id as customer_id, c.name as customer_name,
       s.vehicle_id, v.plate_number, s.driver_id, d.full_name as driver_name,
       pl.name as pickup_name, dl.name as delivery_name, s.status,
       s.freight_amount, s.surcharge_amount, s.fuel_support_amount,
       s.freight_amount + s.surcharge_amount + s.fuel_support_amount + s.extra_fee_amount as revenue,
       coalesce(x.cost, 0) as cost,
       s.freight_amount + s.surcharge_amount + s.fuel_support_amount + s.extra_fee_amount - coalesce(x.cost, 0) as profit,
       case when s.freight_amount + s.surcharge_amount + s.fuel_support_amount + s.extra_fee_amount > 0
            then round((s.freight_amount + s.surcharge_amount + s.fuel_support_amount + s.extra_fee_amount - coalesce(x.cost, 0)) * 100
                       / (s.freight_amount + s.surcharge_amount + s.fuel_support_amount + s.extra_fee_amount), 1) end as margin_percent,
       (s.receivable_id is not null) as billed,
       s.extra_fee_amount, s.pass_through_amount,
       s.freight_amount + s.surcharge_amount + s.fuel_support_amount + s.extra_fee_amount + s.pass_through_amount as amount_due,
       s.quantity, s.pricing_unit, s.unit_price,
       s.freight_amount + s.surcharge_amount + s.fuel_support_amount as freight_total,
       vt.name as vehicle_type_name, to_char(date_trunc('month', coalesce(s.completed_at, s.pickup_at) at time zone 'Asia/Ho_Chi_Minh'), 'MM/YYYY') as month_label,
       c.code as customer_code
from public.shipments s
join public.transport_orders o on o.id = s.order_id
left join public.customers c on c.id = o.payer_customer_id
left join public.vehicles v on v.id = s.vehicle_id
left join public.drivers d on d.id = s.driver_id
left join public.locations pl on pl.id = s.pickup_location_id
left join public.locations dl on dl.id = s.delivery_location_id
left join public.vehicle_types vt on vt.id = s.vehicle_type_id
left join lateral (select sum(e.amount) as cost from public.shipment_expenses e where e.shipment_id = s.id and e.status = 'approved') x on true
where s.status in ('in_transit', 'driver_completed', 'closed') and private.has_perm('reports.view');

create or replace view public.report_by_customer as
select to_char(r.report_month, 'YYYY-MM') || ':' || coalesce(r.customer_id::text, '-') as id, r.report_month, to_char(r.report_month, 'MM/YYYY') as month_label, r.customer_id, r.customer_name,
       count(*) as trips, sum(r.revenue) as revenue, sum(r.cost) as cost, sum(r.profit) as profit,
       r.customer_code
from public.report_shipment_profit r group by r.report_month, r.customer_id, r.customer_name, r.customer_code;

create or replace view public.report_fee_lines as
select r.id || ':' || f.kind_key as id, r.id as shipment_id, r.shipment_code, r.order_code, r.report_date, r.report_month,
       to_char(r.report_month, 'MM/YYYY') as month_label, r.customer_id, r.customer_name, r.plate_number, r.driver_name,
       r.pickup_name, r.delivery_name, f.fee_name, f.fee_kind, f.sort_order, f.amount, f.note,
       r.customer_code
from public.report_shipment_profit r
join public.shipments s on s.id = r.id
cross join lateral (
  select 'cuoc' as kind_key, 'Cước vận chuyển' as fee_name, 'revenue' as fee_kind, -3 as sort_order, s.freight_amount as amount, null::text as note
  where s.freight_amount > 0
  union all
  select 'phu-phi', 'Phụ phí', 'revenue', -2, s.surcharge_amount, null where s.surcharge_amount > 0
  union all
  select 'dau', 'Hỗ trợ dầu', 'revenue', -1, s.fuel_support_amount, null where s.fuel_support_amount > 0
  union all
  select 'phi-' || sf.line_no, ft.name, sf.fee_kind, ft.sort_order, sf.amount, sf.note
  from public.shipment_fees sf join public.fee_types ft on ft.id = sf.fee_type_id
  where sf.shipment_id = s.id
) f;

create or replace view public.report_by_fee_type as
select to_char(report_month, 'YYYY-MM') || ':' || coalesce(customer_id::text, '-') || ':' || fee_name as id,
       report_month, month_label, customer_id, customer_name, fee_name, fee_kind, min(sort_order) as sort_order,
       count(distinct shipment_id) as trips, sum(amount) as amount,
       customer_code
from public.report_fee_lines
group by report_month, month_label, customer_id, customer_name, fee_name, fee_kind, customer_code;

-- Báo cáo phí chi hộ lấy thêm cột mã khách của report_fee_lines
create or replace view public.report_pass_through_fees as
select * from public.report_fee_lines where fee_kind = 'pass_through';

create or replace view public.report_loading as
select r.id, r.shipment_code, r.order_code, r.report_date, r.report_month, r.month_label,
       r.customer_id, r.customer_name, r.plate_number, r.driver_id, r.driver_name, r.pickup_name, r.delivery_name,
       coalesce(fl.amount, 0) as loading_revenue,
       coalesce(ex.driver_paid, 0) as driver_paid,
       coalesce(ex.company_paid, 0) as company_paid,
       coalesce(ex.driver_paid, 0) + coalesce(ex.company_paid, 0) as loading_cost,
       coalesce(fl.amount, 0) - coalesce(ex.driver_paid, 0) - coalesce(ex.company_paid, 0) as loading_margin,
       coalesce(ex.pending, 0) as pending_cost,
       ex.contractors,
       r.customer_code
from public.report_shipment_profit r
left join lateral (
  select sum(sf.amount) as amount
  from public.shipment_fees sf join public.fee_types ft on ft.id = sf.fee_type_id
  where sf.shipment_id = r.id and ft.is_loading
) fl on true
left join lateral (
  select sum(e.amount) filter (where e.status = 'approved' and e.paid_by = 'driver') as driver_paid,
         sum(e.amount) filter (where e.status = 'approved' and e.paid_by = 'company') as company_paid,
         sum(e.amount) filter (where e.status = 'pending') as pending,
         string_agg(distinct sp.name, ', ') as contractors
  from public.shipment_expenses e
  join public.expense_categories c on c.id = e.category_id
  left join public.suppliers sp on sp.id = e.supplier_id
  where e.shipment_id = r.id and c.report_bucket = 'loading' and e.status in ('approved', 'pending')
) ex on true
where coalesce(fl.amount, 0) > 0 or coalesce(ex.driver_paid, 0) + coalesce(ex.company_paid, 0) + coalesce(ex.pending, 0) > 0;

revoke all on public.report_shipment_profit, public.report_by_customer, public.report_fee_lines, public.report_by_fee_type,
  public.report_pass_through_fees, public.report_loading from anon;
grant select on public.report_shipment_profit, public.report_by_customer, public.report_fee_lines, public.report_by_fee_type,
  public.report_pass_through_fees, public.report_loading to authenticated;
