-- =============================================================================
-- Kiểm thử 0018: chi phí tài xế gắn với bước Hoàn thành chuyến.
-- Chạy sau 07/08: chuyến s2 (Tài xế A, xe mặc định XE001) đang ở trạng thái Đã phân công.
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
reset role;

create temp table t_ex (k text primary key, v text);
grant all on t_ex to anon, authenticated;
insert into t_ex select 's2', id::text from public.shipments
 where vehicle_id is null and driver_id = '40000000-0000-0000-0000-000000000001' and status = 'assigned' order by created_at desc limit 1;
insert into t_ex select 'cat_' || code, id::text from public.expense_categories where code in ('TOLL', 'MEAL', 'WASH');
update public.expense_categories set requires_image = false where code = 'MEAL';

select set_config('request.jwt.claim.sub', '', false);
set role anon;
insert into t_ex select 'tok', public.driver_link_login('51C12345') ->> 'token';
select public.driver_link_accept((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 's2'));
select public.driver_link_start((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 's2'));
select tests.assert((public.driver_link_add_expense((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 's2'),
  (select v::uuid from t_ex where k = 'cat_MEAL'), 50000) ->> 'error') like '%Hoàn thành chuyến%', 'Chưa hoàn thành chuyến thì chưa nhập chi phí');
insert into t_ex select 'ticket', public.driver_link_upload_ticket((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 's2'), 'delivery') ->> 'ticket';
insert into storage.objects (bucket_id, name, metadata)
values ('documents', 'tx/' || (select v from t_ex where k = 'ticket') || '/photo-' || gen_random_uuid() || '.jpg', '{"mimetype":"image/jpeg","size":120000}');
select tests.assert((public.driver_link_complete((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 's2'),
  (select v::uuid from t_ex where k = 'ticket'), 'full', null) ->> 'ok')::boolean = false, 'Không khai chi phí thì không hoàn thành được');
select tests.assert((public.driver_link_complete((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 's2'),
  (select v::uuid from t_ex where k = 'ticket'), 'full', null, true) ->> 'ok')::boolean, 'Hoàn thành chuyến, xác nhận không phát sinh chi phí');
select tests.assert((select expense_declaration = 'none' and expense_count = 0 from public.driver_link_trips((select v from t_ex where k = 'tok'))
  where shipment_id = (select v::uuid from t_ex where k = 's2')), 'Thẻ chuyến hiện "không phát sinh chi phí"');
reset role;
select tests.assert(exists (select 1 from public.shipment_status_history where shipment_id = (select v::uuid from t_ex where k = 's2')
  and note like '%không phát sinh chi phí%'), 'Lịch sử chuyến ghi xác nhận không phát sinh chi phí');

-- Bổ sung chi phí sau khi đã xác nhận không có
set role anon;
insert into t_ex select 'e1', public.driver_link_add_expense((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 's2'),
  (select v::uuid from t_ex where k = 'cat_MEAL'), 50000, 'Cơm trưa') ->> 'code';
select tests.assert((select expense_declaration = 'has' and expense_count = 1 and expense_total = 50000 from public.driver_link_trips((select v from t_ex where k = 'tok'))
  where shipment_id = (select v::uuid from t_ex where k = 's2')), 'Bổ sung chi phí: thẻ chuyến chuyển sang có chi phí, đúng tổng');
reset role;
insert into t_ex select 'e1id', id::text from public.shipment_expenses where code = (select v from t_ex where k = 'e1');
set role anon;
select tests.assert((select (x ->> 'editable')::boolean from jsonb_array_elements(public.driver_link_finance((select v from t_ex where k = 'tok')) -> 'expenses') x
  where x ->> 'code' = (select v from t_ex where k = 'e1')), 'Khoản chờ duyệt hiện nút Sửa');

-- Sửa: hủy khoản cũ, tạo khoản mới
insert into t_ex select 'e2', public.driver_link_update_expense((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 'e1id'),
  (select v::uuid from t_ex where k = 'cat_MEAL'), 70000, 'Cơm trưa + nước') ->> 'code';
select tests.assert((select v from t_ex where k = 'e2') is not null, 'Sửa khoản chi phí thành công');
select tests.assert((select expense_count = 1 and expense_total = 70000 from public.driver_link_trips((select v from t_ex where k = 'tok'))
  where shipment_id = (select v::uuid from t_ex where k = 's2')), 'Sau khi sửa chỉ còn 1 khoản, số tiền mới');
select tests.assert((public.driver_link_update_expense((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 'e1id'),
  (select v::uuid from t_ex where k = 'cat_MEAL'), 10000) ->> 'ok')::boolean = false, 'Khoản đã sửa (đã hủy) không sửa lại được');
reset role;
select tests.assert((select status from public.shipment_expenses where code = (select v from t_ex where k = 'e1')) = 'cancelled', 'Khoản cũ giữ lại ở trạng thái Đã hủy');
select tests.assert((select note like '%(sửa từ ' || (select v from t_ex where k = 'e1') || ')' from public.shipment_expenses where code = (select v from t_ex where k = 'e2')),
  'Khoản mới ghi sửa từ khoản nào');
select tests.assert((select r.status from public.approval_requests r join public.shipment_expenses e on e.approval_request_id = r.id
  where e.code = (select v from t_ex where k = 'e1')) = 'cancelled', 'Yêu cầu duyệt của khoản cũ bị hủy');

-- Khoản đã được Giám đốc duyệt: không sửa, không hủy
select tests.login('00000000-0000-0000-0000-0000000000e1');
set role authenticated;
select public.approval_decide((select approval_request_id from public.shipment_expenses where code = (select v from t_ex where k = 'e2')), 'approve');
reset role;
insert into t_ex select 'e2id', id::text from public.shipment_expenses where code = (select v from t_ex where k = 'e2');
set role anon;
select tests.assert((public.driver_link_update_expense((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 'e2id'),
  (select v::uuid from t_ex where k = 'cat_MEAL'), 10000) ->> 'ok')::boolean = false, 'Khoản đã duyệt không sửa được');
select tests.assert((public.driver_link_cancel((select v from t_ex where k = 'tok'), 'expense', (select v::uuid from t_ex where k = 'e2id')) ->> 'ok')::boolean = false,
  'Khoản đã duyệt không hủy được');

-- Loại không cần duyệt: hủy được khi chưa vào bảng lương
insert into t_ex select 'e3', public.driver_link_add_expense((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 's2'),
  (select v::uuid from t_ex where k = 'cat_WASH'), 80000) ->> 'code';
reset role;
insert into t_ex select 'e3id', id::text from public.shipment_expenses where code = (select v from t_ex where k = 'e3');
set role anon;
select tests.assert((public.driver_link_cancel((select v from t_ex where k = 'tok'), 'expense', (select v::uuid from t_ex where k = 'e3id')) ->> 'ok')::boolean,
  'Hủy được khoản loại không cần duyệt');

-- Văn phòng đóng chuyến: không bổ sung, không sửa nữa
insert into t_ex select 'e4', public.driver_link_add_expense((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 's2'),
  (select v::uuid from t_ex where k = 'cat_MEAL'), 30000) ->> 'code';
reset role;
insert into t_ex select 'e4id', id::text from public.shipment_expenses where code = (select v from t_ex where k = 'e4');
update public.shipments set status = 'closed' where id = (select v::uuid from t_ex where k = 's2');
set role anon;
select tests.assert((public.driver_link_add_expense((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 's2'),
  (select v::uuid from t_ex where k = 'cat_MEAL'), 30000) ->> 'error') like '%đóng%', 'Chuyến đã đóng không bổ sung chi phí');
select tests.assert((public.driver_link_update_expense((select v from t_ex where k = 'tok'), (select v::uuid from t_ex where k = 'e4id'),
  (select v::uuid from t_ex where k = 'cat_MEAL'), 10000) ->> 'ok')::boolean = false, 'Chuyến đã đóng không sửa chi phí');
select tests.assert((public.driver_link_cancel((select v from t_ex where k = 'tok'), 'expense', (select v::uuid from t_ex where k = 'e4id')) ->> 'ok')::boolean = false,
  'Chuyến đã đóng không hủy chi phí');

-- Xe khác không sửa được chi phí của xe này
insert into t_ex select 'tok2', public.driver_link_login('99A00001') ->> 'token';
select tests.assert((public.driver_link_update_expense((select v from t_ex where k = 'tok2'), (select v::uuid from t_ex where k = 'e2id'),
  (select v::uuid from t_ex where k = 'cat_MEAL'), 10000) ->> 'ok')::boolean = false, 'Xe khác không sửa được chi phí');
select tests.assert((public.driver_link_update_expense('sai', (select v::uuid from t_ex where k = 'e2id'),
  (select v::uuid from t_ex where k = 'cat_MEAL'), 10000) ->> 'expired')::boolean, 'Phiên sai không sửa được');
reset role;

\o
\echo 'TẤT CẢ KIỂM THỬ CHI PHÍ KHI HOÀN THÀNH CHUYẾN ĐỀU ĐẠT'
