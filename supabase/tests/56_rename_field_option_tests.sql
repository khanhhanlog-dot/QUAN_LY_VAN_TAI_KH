-- =============================================================================
-- Kiểm thử 0075: bút chì sửa tên lựa chọn ngay tại ô chọn của trường bổ sung
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
reset role;

select tests.login('00000000-0000-0000-0000-0000000000a2'); -- admin
set role authenticated;
select public.save_field_definition(null, '{"module":"transport_orders","field_key":"diem_lay_rong_x","label":"Điểm lấy rỗng X","data_type":"single_select","options":[{"value":"tan_cang","label":"Tân Cảng"},"SSIT DEPOT","ICD Sóng Thần"]}'::jsonb);
select public.save_field_definition(null, '{"module":"transport_orders","field_key":"ghi_chu_y","label":"Ghi chú Y","data_type":"short_text"}'::jsonb);
reset role;

select tests.login('00000000-0000-0000-0000-0000000000d1'); -- điều phối
set role authenticated;
select tests.assert((public.rename_field_option((select id from public.field_definitions where field_key = 'diem_lay_rong_x'), 'tan_cang', '  Tân Cảng   Depot ') ->> 'label') = 'Tân Cảng Depot',
  'Điều phối sửa được tên lựa chọn, tên được gọn khoảng trắng');
select tests.assert((public.rename_field_option((select id from public.field_definitions where field_key = 'diem_lay_rong_x'), 'SSIT DEPOT', 'SSIT Cái Mép') ->> 'value') = 'SSIT DEPOT',
  'Lựa chọn dạng chuỗi cũ: giữ nguyên mã, đổi tên');
select tests.assert_fails($$select public.rename_field_option((select id from public.field_definitions where field_key = 'diem_lay_rong_x'), 'tan_cang', 'icd sóng thần')$$,
  'Không cho trùng tên lựa chọn khác');
select tests.assert_fails($$select public.rename_field_option((select id from public.field_definitions where field_key = 'diem_lay_rong_x'), 'khong_co', 'ABC')$$,
  'Lựa chọn không tồn tại bị chặn');
select tests.assert_fails($$select public.rename_field_option((select id from public.field_definitions where field_key = 'diem_lay_rong_x'), 'tan_cang', '  ')$$,
  'Tên trống bị chặn');
select tests.assert_fails($$select public.rename_field_option((select id from public.field_definitions where field_key = 'ghi_chu_y'), 'a', 'B')$$,
  'Không sửa lựa chọn của trường không phải danh sách chọn');
reset role;
select tests.assert((select options from public.field_definitions where field_key = 'diem_lay_rong_x')
  = '[{"value":"tan_cang","label":"Tân Cảng Depot"},{"value":"SSIT DEPOT","label":"SSIT Cái Mép"},"ICD Sóng Thần"]'::jsonb,
  'Chỉ đổi tên đúng lựa chọn, giữ nguyên mã và thứ tự');
select tests.assert(exists (select 1 from public.field_definition_versions v join public.field_definitions f on f.id = v.field_id
  where f.field_key = 'diem_lay_rong_x' and v.change_note like 'Sửa lựa chọn "Tân Cảng" thành "Tân Cảng Depot"%' and v.changed_by = '00000000-0000-0000-0000-0000000000d1'),
  'Có phiên bản mới ghi người sửa');

select tests.login('00000000-0000-0000-0000-0000000000b1'); -- tài xế
set role authenticated;
select tests.assert_fails($$select public.rename_field_option((select id from public.field_definitions where field_key = 'diem_lay_rong_x'), 'tan_cang', 'Tài xế sửa')$$,
  'Tài xế không sửa được lựa chọn');
reset role;
select tests.login('00000000-0000-0000-0000-0000000000f1'); -- chỉ xem báo cáo
set role authenticated;
select tests.assert_fails($$select public.rename_field_option((select id from public.field_definitions where field_key = 'diem_lay_rong_x'), 'tan_cang', 'Người xem sửa')$$,
  'Người chỉ xem không sửa được lựa chọn');
reset role;

delete from public.field_definitions where module = 'transport_orders' and field_key in ('diem_lay_rong_x', 'ghi_chu_y');
\o
\echo 'SỬA TÊN LỰA CHỌN NGAY TẠI Ô CHỌN ĐẠT'
