-- =============================================================================
-- KHÁNH HÀ TMS – NÂNG CẤP CƠ SỞ DỮ LIỆU: Sửa tên lựa chọn ngay tại ô chọn (nút bút chì)
-- Dán toàn bộ tệp vào Supabase → SQL Editor → Run. Chạy MỘT LẦN trên CSDL đang dùng.
-- Không xóa và không thêm dữ liệu nghiệp vụ. Tệp được ghép tự động – không sửa tay.
-- =============================================================================
begin;

do $$ begin
  if to_regprocedure('public.rename_field_option(uuid,text,text)') is not null then
    raise exception 'CSDL đã được nâng cấp Sửa tên lựa chọn ngay tại ô chọn (nút bút chì) trước đó, không cần chạy lại.';
  end if;
end $$;

-- >>> 20261120000075_rename_field_option.sql
-- =============================================================================
-- KHÁNH HÀ TMS - 0075: Sửa tên lựa chọn ngay tại ô chọn (20/11/2026)
--   Mỗi mục trong ô chọn của trường bổ sung có nút bút chì: sửa TÊN hiển thị của lựa chọn.
--   Mã lựa chọn (giá trị đã lưu trong đơn/chuyến/danh mục) giữ nguyên nên dữ liệu cũ tự hiện tên mới.
--   Cùng nhóm người được thêm lựa chọn (0048): người có quyền "Cấu hình trường" hoặc người nhập liệu.
--   Mỗi lần sửa tạo một phiên bản mới của trường (xem/khôi phục ở Quản lý trường dữ liệu).
-- =============================================================================

create or replace function public.rename_field_option(p_field_id uuid, p_value text, p_label text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_label text := btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g'));
  v_type text;
  v_options jsonb;
  v_old text;
  v_idx int;
begin
  if not (
    private.has_perm('fields.configure')
    or exists (select 1 from public.permissions p where p.action in ('create', 'update') and p.module not in ('driver_app', 'documents') and private.has_perm(p.code))
  ) then
    raise exception 'Bạn không có quyền sửa lựa chọn' using errcode = '42501';
  end if;
  if v_label = '' then
    raise exception 'Nhập tên lựa chọn' using errcode = '22023';
  end if;
  if length(v_label) > 200 then
    raise exception 'Tên lựa chọn tối đa 200 ký tự' using errcode = '22023';
  end if;

  select f.data_type, coalesce(f.options, '[]'::jsonb) into v_type, v_options
  from public.field_definitions f
  where f.id = p_field_id and f.status = 'active'
  for update;
  if not found then
    raise exception 'Không tìm thấy trường dữ liệu' using errcode = 'P0002';
  end if;
  if v_type not in ('single_select', 'multi_select') then
    raise exception 'Trường này không phải danh sách chọn' using errcode = '22023';
  end if;

  select t.ord - 1, case when jsonb_typeof(t.o) = 'string' then t.o #>> '{}' else t.o ->> 'label' end
    into v_idx, v_old
  from jsonb_array_elements(v_options) with ordinality t(o, ord)
  where (case when jsonb_typeof(t.o) = 'string' then t.o #>> '{}' else t.o ->> 'value' end) = p_value
  limit 1;
  if v_idx is null then
    raise exception 'Không tìm thấy lựa chọn cần sửa (có thể vừa bị xóa)' using errcode = 'P0002';
  end if;

  -- Không trùng tên/mã với lựa chọn khác (không phân biệt hoa thường)
  if exists (
    select 1 from jsonb_array_elements(v_options) with ordinality t(o, ord)
    where t.ord - 1 <> v_idx
      and (lower(case when jsonb_typeof(t.o) = 'string' then t.o #>> '{}' else t.o ->> 'value' end) = lower(v_label)
        or lower(case when jsonb_typeof(t.o) = 'string' then t.o #>> '{}' else t.o ->> 'label' end) = lower(v_label))
  ) then
    raise exception 'Đã có lựa chọn “%” trong danh sách', v_label using errcode = '23505';
  end if;

  if v_old is distinct from v_label then
    perform set_config('gha.change_note', 'Sửa lựa chọn "' || coalesce(v_old, p_value) || '" thành "' || v_label || '" ngay tại biểu mẫu', true);
    update public.field_definitions
    set options = jsonb_set(v_options, array[v_idx::text], jsonb_build_object('value', p_value, 'label', v_label))
    where id = p_field_id;
  end if;
  return jsonb_build_object('value', p_value, 'label', v_label);
end;
$$;
revoke all on function public.rename_field_option(uuid, text, text) from public, anon;
grant execute on function public.rename_field_option(uuid, text, text) to authenticated;

commit;
