-- =============================================================================
-- Kiểm thử 0076: tự động sao lưu dữ liệu theo giờ
-- =============================================================================
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null
reset role;
delete from public.data_backups;

-- Quyền: kế toán, điều phối không xem / không sao lưu được
select tests.login('00000000-0000-0000-0000-0000000000c1');
set role authenticated;
select tests.assert_fails($$select public.create_data_backup()$$, 'Kế toán không bấm Sao lưu ngay được');
select tests.assert_fails($$select public.backup_overview()$$, 'Kế toán không xem được cấu hình sao lưu');
select tests.assert_fails($$select public.backup_tick()$$, 'Người dùng không gọi được hàm hẹn giờ');
select tests.assert_fails($$select public.set_backup_settings(true, '{9}', 30, '{}')$$, 'Kế toán không đổi được giờ sao lưu');
reset role;

-- Admin: sao lưu ngay
select tests.login('00000000-0000-0000-0000-0000000000a2');
set role authenticated;
select tests.assert((public.backup_overview() ->> 'enabled')::boolean, 'Mặc định bật tự động sao lưu');
select tests.assert(public.backup_overview() -> 'hours' = '[9, 14, 17]'::jsonb, 'Mặc định 9h, 14h, 17h');
select tests.assert((public.backup_overview() ->> 'keep_days')::int = 30, 'Mặc định giữ 30 ngày');
select tests.assert((public.backup_overview() -> 'tables') ? 'shipments' and not ((public.backup_overview() -> 'tables') ? 'audit_logs'),
  'Sao lưu bảng chuyến, không sao lưu nhật ký');
select tests.assert((public.create_data_backup() ->> 'status') = 'ok', 'Sao lưu ngay thành công');
select tests.assert_fails($$select public.create_data_backup()$$, 'Không bấm sao lưu 2 lần trong 1 phút');
select tests.assert((select count(*) from public.data_backups) = 1, 'Admin thấy bản sao lưu');
select tests.assert((select jsonb_array_length(data -> 'shipments') from public.data_backups) = (select count(*) from public.shipments),
  'Bản sao lưu đủ số chuyến');
select tests.assert((select (table_counts ->> 'customers')::int from public.data_backups) = (select count(*) from public.customers),
  'Đếm đúng số khách hàng');
select tests.assert((select data ? '_shipment_list' from public.data_backups), 'Có danh sách chuyến dễ đọc');
select tests.assert((select size_bytes > 0 and created_by = '00000000-0000-0000-0000-0000000000a2' and kind = 'manual' from public.data_backups), 'Ghi người sao lưu, dung lượng');
select tests.assert_fails($$delete from public.data_backups$$, 'Người dùng không xóa được bản sao lưu');
select tests.assert_fails($$select public.set_backup_settings(true, '{}', 30)$$, 'Bật tự động thì phải chọn ít nhất 1 giờ');
select tests.assert_fails($$select public.set_backup_settings(true, '{25}', 30)$$, 'Giờ phải từ 0 đến 23');
select tests.assert_fails($$select public.set_backup_settings(true, '{9}', 0)$$, 'Số ngày giữ từ 1');
select tests.assert_fails($$select public.set_backup_settings(true, '{9}', 30, '{khong-phai-email}')$$, 'Email sai định dạng bị từ chối');
select public.set_backup_settings(true, '{17, 9, 9}', 7, '{KeToan@Gmail.com, ketoan@gmail.com, giamdoc@khanhha.vn}');
select tests.assert(public.backup_overview() -> 'hours' = '[9, 17]'::jsonb, 'Lưu giờ đã sắp xếp, bỏ trùng');
select tests.assert(public.backup_overview() -> 'emails' = '["giamdoc@khanhha.vn", "ketoan@gmail.com"]'::jsonb, 'Lưu email chữ thường, bỏ trùng');
reset role;

-- Gửi email: sao lưu ngay kèm gửi email trả về mã dùng một lần
update public.data_backups set created_at = now() - interval '2 minutes';
select tests.login('00000000-0000-0000-0000-0000000000a2');
set role authenticated;
create temp table t_tok as select public.create_data_backup(true) ->> 'email_token' as tok;
reset role;
select tests.assert((select length(tok) >= 60 from t_tok), 'Có mã gửi email');
select tests.assert((select email_status = 'pending' and email_to = '{giamdoc@khanhha.vn,ketoan@gmail.com}' from public.data_backups order by created_at desc limit 1), 'Bản sao lưu chờ gửi email');
set role anon;
select tests.assert(not (public.backup_email_payload('sai-ma') ->> 'ok')::boolean, 'Mã sai không lấy được dữ liệu');
reset role;
create temp table t_pay as select public.backup_email_payload((select tok from t_tok)) p;
select tests.assert((select (p ->> 'ok')::boolean from t_pay), 'Đúng mã thì lấy được dữ liệu gửi email');
select tests.assert((select jsonb_array_length(p -> 'sheets' -> 'shipments') from t_pay) =
  (select count(*) from public.shipments where coalesce(pickup_at, created_at) >= private.backup_email_period_start(now())::timestamp at time zone 'Asia/Ho_Chi_Minh'),
  'Email chỉ có chuyến trong kỳ');
select tests.assert((select p -> 'recipients' = '["giamdoc@khanhha.vn", "ketoan@gmail.com"]'::jsonb from t_pay), 'Gửi đúng danh sách email');
select tests.assert(not (public.backup_email_payload((select tok from t_tok)) ->> 'ok')::boolean, 'Mã chỉ dùng được một lần');
select public.backup_email_report((select tok from t_tok), true);
select tests.assert((select email_status = 'sent' and emailed_at is not null from public.data_backups order by created_at desc limit 1), 'Ghi đã gửi email');

-- Kỳ gửi email: đến ngày 15 kèm tháng trước, từ ngày 16 bỏ tháng trước
select tests.assert(private.backup_email_period_start('2026-12-10 09:00+07') = '2026-11-01', 'Ngày 10/12: gửi từ 01/11');
select tests.assert(private.backup_email_period_start('2026-12-15 17:00+07') = '2026-11-01', 'Ngày 15/12: vẫn gửi tháng 11');
select tests.assert(private.backup_email_period_start('2026-12-16 09:00+07') = '2026-12-01', 'Ngày 16/12: chỉ gửi tháng 12');
select tests.assert(private.backup_email_period_start('2026-01-05 09:00+07') = '2025-12-01', 'Tháng 1: kèm tháng 12 năm trước');

-- Điều phối không đọc được bản sao lưu
select tests.login('00000000-0000-0000-0000-0000000000d1');
set role authenticated;
select tests.assert((select count(*) from public.data_backups) = 0, 'Điều phối không thấy bản sao lưu');
reset role;

-- Hẹn giờ: đúng giờ đã chọn mới sao lưu, mỗi giờ một bản
update public.system_settings set value = to_jsonb(array[extract(hour from now() at time zone 'Asia/Ho_Chi_Minh')::int]) where key = 'backup.hours';
select tests.assert(public.backup_tick() = 'đã sao lưu', 'Đến giờ thì tự sao lưu');
select tests.assert(public.backup_tick() = 'đã sao lưu giờ này', 'Cùng giờ không sao lưu lần hai');
select tests.assert((select count(*) from public.data_backups where kind = 'auto' and status = 'ok' and created_by is null) = 1, 'Có 1 bản tự động');
select tests.assert((select email_status = 'error' and email_error like '%pg_net%' from public.data_backups where kind = 'auto'), 'Không có pg_net thì ghi lỗi gửi email (CSDL thử nghiệm)');
update public.system_settings set value = to_jsonb(array[(extract(hour from now() at time zone 'Asia/Ho_Chi_Minh')::int + 1) % 24]) where key = 'backup.hours';
select tests.assert(public.backup_tick() = 'chưa đến giờ', 'Chưa đến giờ thì không sao lưu');
update public.system_settings set value = 'false' where key = 'backup.enabled';
select tests.assert(public.backup_tick() = 'tắt', 'Tắt tự động thì không sao lưu');

-- Dọn bản cũ: quá số ngày giữ thì xóa, luôn chừa 3 bản thành công gần nhất
update public.data_backups set created_at = now() - interval '40 days';
select tests.assert((select count(*) from private.backup_email_jobs) > 0, 'Có việc gửi email');
insert into public.data_backups (kind, status, created_at) select 'auto', 'ok', now() - interval '50 days' - g * interval '1 hour' from generate_series(1, 5) g;
select private.make_data_backup('manual', null);
select tests.assert((select count(*) from public.data_backups) = 3, 'Xóa bản quá hạn, chừa 3 bản gần nhất');
select tests.assert((select count(*) from public.data_backups where created_at > now() - interval '1 minute') = 1, 'Bản mới vẫn còn');
select tests.assert((select count(*) from private.backup_email_jobs j where not exists (select 1 from public.data_backups b where b.id = j.backup_id)) = 0, 'Xóa bản sao lưu thì xóa việc gửi email');

-- Trả lại mặc định cho các tệp kiểm thử sau
update public.system_settings set value = 'true' where key = 'backup.enabled';
update public.system_settings set value = '[9, 14, 17]' where key = 'backup.hours';
update public.system_settings set value = '30' where key = 'backup.keep_days';
update public.system_settings set value = '[]' where key = 'backup.emails';
delete from public.data_backups;
\o
\echo 'TẤT CẢ KIỂM THỬ SAO LƯU DỮ LIỆU THEO GIỜ ĐỀU ĐẠT'
