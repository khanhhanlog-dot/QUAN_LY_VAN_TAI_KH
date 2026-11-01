-- =============================================================================
-- Kiểm thử 0035: nhóm phí, loại tờ khai, tổng cước gồm phí nhóm Cước vận chuyển, báo cáo theo nhóm.
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
reset role;
select tests.assert((select count(*) from public.fee_groups where code in ('CUOC', 'CHIHO', 'TOKHAI', 'BOCXEP')) = 4, 'Có sẵn 4 nhóm phí');
select tests.assert((select count(*) from public.declaration_types where name in ('Xanh', 'Vàng', 'Đỏ')) = 3, 'Có sẵn loại tờ khai Xanh, Vàng, Đỏ');
select tests.assert((select bool_and(is_loading) from public.fee_types f join public.fee_groups g on g.id = f.fee_group_id where g.code = 'BOCXEP'), 'Loại phí nhóm Bốc xếp tự bật thuộc nhóm bốc xếp');
select tests.assert((select g.code from public.fee_types f join public.fee_groups g on g.id = f.fee_group_id where f.name = 'Phí neo xe') = 'CUOC', 'Phí neo xe thuộc nhóm Cước vận chuyển');

create temp table t_sp as
  select s.id, s.freight_amount + s.surcharge_amount + s.fuel_support_amount as base from public.shipments s
  where s.status in ('in_transit', 'driver_completed', 'closed') and s.receivable_id is null
  order by s.created_at desc limit 1;
grant select on t_sp to authenticated;
select tests.assert((select count(*) from t_sp) = 1, 'Có chuyến tính báo cáo để kiểm thử');

select tests.login('00000000-0000-0000-0000-0000000000a2');
set role authenticated;
select public.set_shipment_fees((select id from t_sp), jsonb_build_array(
  jsonb_build_object('fee_type_id', (select id from public.fee_types where name = 'Phí neo xe'), 'amount', 300000),
  jsonb_build_object('fee_type_id', (select id from public.fee_types where name = 'Phí nâng'), 'amount', 250000),
  jsonb_build_object('fee_type_id', (select id from public.fee_types where name = 'Phí tờ khai theo cont'), 'amount', 500000,
    'declaration_type_id', (select id from public.declaration_types where name = 'Đỏ')),
  jsonb_build_object('fee_type_id', (select id from public.fee_types where name = 'Bốc xếp bởi 3-PL'), 'amount', 400000)));
select tests.assert((select freight_total from public.report_shipment_profit where id = (select id from t_sp)) = (select base from t_sp) + 300000,
  'Tổng cước = cước + phụ phí + hỗ trợ dầu + phí nhóm Cước vận chuyển');
select tests.assert((select sum(amount) from public.report_fee_group_lines where shipment_id = (select id from t_sp) and group_role = 'freight') = (select base from t_sp) + 300000,
  'Báo cáo theo nhóm: nhóm Cước vận chuyển gồm cước, dầu và phí neo xe');
select tests.assert((select declaration_type_name from public.report_fee_group_lines where shipment_id = (select id from t_sp) and group_role = 'declaration') = 'Đỏ',
  'Báo cáo theo nhóm hiện loại tờ khai');
select tests.assert((select sum(amount) from public.report_fee_group_lines where shipment_id = (select id from t_sp) and group_role = 'loading') = 400000,
  'Nhóm bốc xếp có phí bốc xếp 3-PL');
select tests.assert((select loading_revenue from public.report_loading where id = (select id from t_sp)) = 400000, 'Báo cáo Bốc xếp vẫn nhận phí nhóm bốc xếp');
select tests.assert((select count(*) from public.report_pass_through_fees where shipment_id = (select id from t_sp)) = 1, 'Báo cáo chi hộ chỉ có phí nâng');
-- Chỉ chọn loại tờ khai, chưa có phí
select public.set_shipment_fees((select id from t_sp), jsonb_build_array(
  jsonb_build_object('fee_type_id', (select id from public.fee_types where name = 'Phí tờ khai theo cont'),
    'declaration_type_id', (select id from public.declaration_types where name = 'Xanh'))));
select tests.assert((select amount from public.shipment_fees where shipment_id = (select id from t_sp)) = 0, 'Chỉ chọn loại tờ khai vẫn lưu được (0 đ)');
select public.set_shipment_fees((select id from t_sp), '[]'::jsonb);
select tests.assert((select count(*) from public.report_cost_lines) >= 0 and (select count(*) from public.report_cost_lines where cost_group is null) = 0, 'Báo cáo ứng tiền, chi bốc xếp đọc được');
reset role;
-- Đổi vai trò nhóm thì cập nhật cờ bốc xếp của loại phí
update public.fee_groups set report_role = 'other' where code = 'BOCXEP';
select tests.assert(not (select bool_or(is_loading) from public.fee_types f join public.fee_groups g on g.id = f.fee_group_id where g.code = 'BOCXEP'), 'Đổi vai trò nhóm tắt cờ bốc xếp');
update public.fee_groups set report_role = 'loading' where code = 'BOCXEP';

\o
\echo 'TẤT CẢ KIỂM THỬ NHÓM PHÍ ĐỀU ĐẠT'
