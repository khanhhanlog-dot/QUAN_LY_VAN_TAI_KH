-- =============================================================================
-- Kiểm thử 0074: lương chuyến do điều phối nhập từng chuyến
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
reset role;

create temp table t_tp (k text primary key, v text);
grant all on t_tp to authenticated;
insert into t_tp values ('drv', '40000000-0000-0000-0000-000000000001');
-- Hai chuyến cùng tuyến của tài xế nội bộ; ngày hoàn thành đưa về tháng chưa có bảng lương
insert into t_tp select 'a', s.id::text from public.shipments s
where s.driver_id = '40000000-0000-0000-0000-000000000001' and s.status not in ('cancelled', 'draft') and not private.shipment_is_3pl(s.vehicle_id)
  and s.pickup_location_id <> s.delivery_location_id order by s.shipment_code limit 1;
insert into t_tp select 'b', s.id::text from public.shipments s
where s.driver_id = '40000000-0000-0000-0000-000000000001' and s.status not in ('cancelled', 'draft') and not private.shipment_is_3pl(s.vehicle_id)
  and s.id <> (select v::uuid from t_tp where k = 'a') order by s.shipment_code limit 1;
update public.shipments set pickup_location_id = x.delivery_location_id, delivery_location_id = x.pickup_location_id
from (select pickup_location_id, delivery_location_id from public.shipments where id = (select v::uuid from t_tp where k = 'a')) x
where id = (select v::uuid from t_tp where k = 'b');
update public.shipments set pickup_at = now() - interval '3 days', expected_delivery_at = null,
  completed_at = case when completed_at is null then null else now() - interval '700 days' end, driver_pay_override = null
where id in ((select v::uuid from t_tp where k = 'a'), (select v::uuid from t_tp where k = 'b'));
update public.drivers set per_trip_salary = 0, pay_type = 'base_and_trip' where id = (select v::uuid from t_tp where k = 'drv');

-- Điều phối thấy chuyến chưa nhập lương, nhập lương
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
select tests.assert((select count(*) from public.trips_missing_driver_pay(current_date - 10, current_date, true) t
  where t.id in ((select v::uuid from t_tp where k = 'a'), (select v::uuid from t_tp where k = 'b'))) = 2, 'Hai chuyến chưa nhập lương');
select tests.assert(public.trip_pay_missing_count() >= 2, 'Cảnh báo chuyến chưa nhập lương');
select tests.assert((select source from public.shipment_driver_pay(array[(select v::uuid from t_tp where k = 'a')])) = 'missing', 'Cột Lương chuyến: chưa nhập');
select public.set_shipment_driver_pay((select v::uuid from t_tp where k = 'a'), 850000, null);
select tests.assert((select amount from public.shipment_driver_pay(array[(select v::uuid from t_tp where k = 'a')])) = 850000
  and (select source from public.shipment_driver_pay(array[(select v::uuid from t_tp where k = 'a')])) = 'manual', 'Điều phối nhập lương chuyến (không cần ghi chú)');
-- Gợi ý chuyến cùng tuyến (chiều ngược) = số đã nhập lần trước
select tests.assert((select suggested from public.trips_missing_driver_pay(current_date - 10, current_date, true) t where t.id = (select v::uuid from t_tp where k = 'b')) = 850000,
  'Gợi ý số đã nhập cho cùng tuyến');
select tests.assert(public.save_shipment_driver_pays(jsonb_build_array(
  jsonb_build_object('id', (select v from t_tp where k = 'b'), 'amount', 850000),
  jsonb_build_object('id', (select v from t_tp where k = 'a'), 'amount', ''))) = 1, 'Lưu nhiều chuyến, bỏ dòng trống');
select tests.assert(not exists (select 1 from public.trips_missing_driver_pay(current_date - 10, current_date, true) t
  where t.id in ((select v::uuid from t_tp where k = 'a'), (select v::uuid from t_tp where k = 'b'))), 'Đã nhập: hết trong danh sách chưa nhập');
select tests.assert_fails($$select public.set_shipment_driver_pay((select v::uuid from t_tp where k = 'a'), -1, null)$$, 'Số âm bị chặn');
reset role;
-- Tài xế không nhập được
select tests.login('00000000-0000-0000-0000-0000000000b1');
set role authenticated;
select tests.assert_fails($$select public.set_shipment_driver_pay((select v::uuid from t_tp where k = 'a'), 1, null)$$, 'Tài xế không nhập lương chuyến');
reset role;
-- Bảng lương cộng số đã nhập; bảng giá cố định không dùng
insert into public.trip_pay_rates (name, amount) values ('Mặc định cũ', 999999);
update public.shipments set status = 'driver_completed', completed_at = date_trunc('month', now() - interval '700 days') + interval '5 days'
where id = (select v::uuid from t_tp where k = 'a') and status not in ('driver_completed', 'closed');
update public.shipments set completed_at = date_trunc('month', now() - interval '700 days') + interval '5 days' where id = (select v::uuid from t_tp where k = 'a');
update public.shipments set completed_at = case when completed_at is null then null else now() - interval '900 days' end where id = (select v::uuid from t_tp where k = 'b');
select tests.assert((private.payroll_compute((select v::uuid from t_tp where k = 'drv'), date_trunc('month', now() - interval '700 days')::date, 0, 0, '{}'::jsonb, null)
  ->> 'trip_salary')::numeric = 850000, 'Bảng lương: lương chuyến = số điều phối nhập');
delete from public.trip_pay_rates;
update public.drivers set per_trip_salary = 300000 where id = (select v::uuid from t_tp where k = 'drv');

\o
\echo 'TẤT CẢ KIỂM THỬ NHẬP LƯƠNG CHUYẾN ĐỀU ĐẠT'
