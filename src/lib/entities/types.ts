import type { ModuleKey } from "@/lib/permissions";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "datetime"
  | "select"
  | "multiselect"
  | "boolean"
  | "email"
  | "phone"
  | "url"
  | "reference"
  | "gps"
  | "formula"
  | "file";

import type { Tone } from "@/lib/tones";

/** tone: màu nhãn khi hiển thị trong bảng (trạng thái) */
export type Option = { value: string; label: string; tone?: Tone };

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Option[];
  /** Thực thể được tham chiếu (khóa trong ENTITIES) với type = reference */
  ref?: string;
  /** Hiển thị mặc định trong bảng */
  list?: boolean;
  /** Có bộ lọc nhanh trên bảng (select/boolean/reference) */
  filter?: boolean;
  /** Chỉ đọc (cột sinh tự động) */
  readOnly?: boolean;
  /** Không hiện trên biểu mẫu */
  hideInForm?: boolean;
  placeholder?: string;
  help?: string;
  /** Viết hoa, bỏ dấu cách và ký tự đặc biệt khi gõ (biển số xe: 61K31295) */
  compactUpper?: boolean;
  /** Gợi ý giá trị thường dùng (ô chữ vẫn cho nhập tự do) */
  suggestions?: string[];
  min?: number;
  max?: number;
  maxLength?: number;
  /** Số nguyên */
  integer?: boolean;
  /** Chỉ hiện khi trường khác có một trong các giá trị */
  showIf?: { field: string; in: string[] };
  /** Chiếm cả hàng trên biểu mẫu */
  wide?: boolean;
  /** Mặc định khi tạo mới */
  defaultValue?: unknown;
  /** Công thức (type = formula) */
  formula?: string;
  /** Trường động (lưu trong custom_fields) */
  custom?: boolean;
  /** Định dạng hiển thị (trường động) */
  displayFormat?: string;
};

export type EntityDef = {
  key: string;
  table: string;
  /** Tên hiển thị số nhiều / số ít */
  label: string;
  singular: string;
  /** Module quyền: view/create/update/delete/export */
  perm: ModuleKey;
  /** Có quyền xuất riêng (module có action export) */
  hasExport: boolean;
  /** Khóa chính (mặc định id) */
  pk?: string;
  fields: FieldDef[];
  /** Các cột tìm kiếm bằng ô tìm nhanh */
  search: string[];
  defaultSort: { key: string; desc?: boolean };
  /** Các cột tạo nhãn khi được tham chiếu */
  labelCols: string[];
  /** Hỗ trợ trường động (module trong field_definitions) */
  customModule?: string;
  /** Các trường hiện trong biểu mẫu tạo nhanh từ nút "+" */
  quickFields?: string[];
  /** Trang chi tiết (thay {id}) */
  detailPath?: string;
  /** Giá trị cố định khi ghi + điều kiện lọc khi đọc */
  fixed?: Record<string, string>;
  /** Thực thể con: cột khóa ngoại trỏ tới cha */
  parentKey?: string;
  /** Một bản ghi duy nhất theo cha (pk = parentKey) */
  singleton?: boolean;
  /** Mã tự sinh khi để trống */
  autoCode?: boolean;
  /** Điều kiện chỉ được chọn khi tham chiếu (ví dụ chỉ bản ghi đang hoạt động) */
  activeFilter?: { col: string; value: string | boolean };
  /** Trường select hiển thị thành dãy tab lọc (kèm số lượng) phía trên bảng */
  statusTabs?: string;
  /** Gợi ý hiển thị khi xóa bị chặn do đang được tham chiếu */
  archiveHint?: string;
  /** Dữ liệu nhạy cảm: cần thêm quyền {perm}.view_sensitive */
  sensitive?: boolean;
  /** Mọi thao tác ghi dùng quyền {perm}.update (bảng con, bản ghi đơn) */
  writeAsUpdate?: boolean;
  /** Không cho xóa (dùng trạng thái hủy) */
  noDelete?: boolean;
  /** Bảng đọc từ view: không sửa/xóa/nhập trực tiếp, thao tác qua nút nghiệp vụ */
  readOnlyRows?: boolean;
  /** Nút "Thêm mới" mở biểu mẫu nghiệp vụ riêng (khóa trong bảng đăng ký components/finance/registry) */
  createAction?: string;
  /** Nút thao tác trên từng dòng (khóa trong bảng đăng ký components/finance/registry) */
  rowActions?: string;
  /** Mọi thao tác ghi cần đúng một quyền này (ví dụ approvals.configure) */
  writePerm?: string;
};

/** Cấu hình hiển thị bảng lưu theo người dùng */
export type TableViewConfig = {
  hidden?: string[];
  order?: string[];
  widths?: Record<string, number>;
  pinned?: string[];
  density?: "compact" | "normal";
  /** Chiều cao dòng (px) do người dùng kéo giãn */
  rowHeight?: number | null;
  pageSize?: number;
};

/** Định nghĩa trường động đọc từ field_definitions (truyền được sang client) */
export type CustomFieldRow = {
  id: string;
  module: string;
  field_key: string;
  label: string;
  description: string | null;
  field_kind: string;
  data_type: string;
  is_required: boolean;
  is_editable: boolean;
  is_visible: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  default_value: unknown;
  display_format: string | null;
  sort_order: number;
  view_permission: string | null;
  edit_permission: string | null;
  validation: { min?: number; max?: number; maxLength?: number; pattern?: string } | null;
  formula: string | null;
  visibility_condition: string | null;
  options: Option[] | string[] | null;
  reference_target: string | null;
  status: string;
  version: number;
};
