// Sao lưu dữ liệu theo giờ (0076): hằng số và kiểu dùng chung (KHÔNG đặt trong tệp "use client").

export type BackupRow = {
  id: string;
  created_at: string;
  kind: "auto" | "manual";
  status: "ok" | "error";
  error: string | null;
  created_by_name: string | null;
  row_total: number;
  size_bytes: number;
  table_counts: Record<string, number>;
  email_status: "pending" | "sending" | "sent" | "error" | null;
  email_to: string[] | null;
  email_error: string | null;
  emailed_at: string | null;
};

export type BackupOverview = {
  enabled: boolean;
  hours: number[];
  keep_days: number;
  scheduler_ok: boolean;
  total_bytes: number;
  tables: string[];
  emails: string[];
};

export const BACKUP_LIST_COLS = "id, created_at, kind, status, error, created_by_name, row_total, size_bytes, table_counts, email_status, email_to, email_error, emailed_at";

/** Tên tiếng Việt của bảng (tên trang tính Excel tối đa 31 ký tự). Bảng chưa có tên thì dùng tên gốc. */
export const BACKUP_TABLE_LABELS: Record<string, string> = {
  _shipment_list: "Danh sách chuyến (dễ đọc)",
  transport_orders: "Đơn hàng",
  shipments: "Chuyến xe",
  shipment_assignments: "Phân công xe, tài xế",
  shipment_fees: "Phí thu khách theo chuyến",
  shipment_items: "Hàng hóa theo chuyến",
  shipment_expenses: "Chi phí chuyến",
  shipment_carrier_costs: "Chi phí 3PL theo chuyến",
  shipment_status_history: "Lịch sử trạng thái chuyến",
  transport_plans: "Kế hoạch vận chuyển",
  customers: "Khách hàng",
  suppliers: "Nhà cung cấp",
  locations: "Địa điểm",
  routes: "Tuyến đường",
  drivers: "Tài xế",
  driver_sensitive: "Tài xế - thông tin riêng",
  vehicles: "Xe",
  vehicle_types: "Loại xe",
  vehicle_financials: "Xe - tài chính",
  vehicle_fuel_months: "Dầu theo xe theo tháng",
  maintenance_records: "Bảo dưỡng xe",
  loan_schedules: "Lịch trả góp",
  transport_price_lists: "Bảng giá",
  fuel_support_rules: "Quy tắc hỗ trợ dầu",
  fee_groups: "Nhóm phí thu",
  fee_types: "Danh mục phí thu",
  expense_groups: "Nhóm chi phí",
  expense_categories: "Danh mục chi phí",
  advance_requests: "Đề nghị ứng tiền",
  advance_transactions: "Giao dịch ứng tiền",
  receivables: "Công nợ phải thu",
  payables: "Công nợ phải trả",
  payments: "Thanh toán",
  purchase_requests: "Đề nghị chi, mua sắm",
  purchase_request_types: "Loại đề nghị chi",
  driver_payrolls: "Bảng lương tài xế",
  driver_pay_components: "Khoản lương tài xế",
  driver_attendance: "Chấm công tài xế",
  attendance_reasons: "Lý do ngày công",
  attendance_locks: "Khóa chấm công",
  trip_pay_rates: "Giá lương chuyến",
  pay_components: "Khoản lương",
  pay_zones: "Vùng lương",
  pay_holidays: "Ngày lễ",
  salary_rules: "Quy tắc lương",
  leave_requests: "Xin nghỉ",
  leave_handovers: "Bàn giao khi nghỉ",
  tasks: "Giao việc",
  task_assignees: "Người nhận việc",
  task_comments: "Trao đổi giao việc",
  approval_requests: "Yêu cầu phê duyệt",
  approval_steps: "Bước phê duyệt",
  approval_rules: "Quy tắc phê duyệt",
  approval_types: "Loại phê duyệt",
  trip_approval_delegations: "Ủy quyền duyệt chuyến",
  documents: "Chứng từ (danh sách tệp)",
  banks: "Ngân hàng",
  bank_accounts: "Tài khoản ngân hàng",
  payment_methods: "Hình thức thanh toán",
  company_entities: "Pháp nhân công ty",
  declaration_types: "Loại tờ khai",
  catalogs: "Danh mục",
  catalog_items: "Mục danh mục",
  code_sequences: "Bộ đếm mã",
  field_definitions: "Trường dữ liệu",
  field_definition_versions: "Phiên bản trường dữ liệu",
  form_definitions: "Biểu mẫu",
  form_versions: "Phiên bản biểu mẫu",
  form_layouts: "Bố cục biểu mẫu",
  workflow_definitions: "Quy trình",
  workflow_versions: "Phiên bản quy trình",
  profiles: "Người dùng",
  roles: "Vai trò",
  permissions: "Quyền",
  role_permissions: "Quyền theo vai trò",
  user_roles: "Vai trò người dùng",
  user_permission_overrides: "Quyền riêng người dùng",
  user_invitations: "Lời mời người dùng",
  system_settings: "Cấu hình hệ thống",
};

/** Thứ tự trang tính: danh sách chuyến dễ đọc, các bảng nghiệp vụ chính, rồi các bảng còn lại theo tên */
export function orderBackupTables(names: string[]): string[] {
  const known = Object.keys(BACKUP_TABLE_LABELS);
  const rank = (n: string) => (known.includes(n) ? known.indexOf(n) : known.length);
  return [...names].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function backupTableLabel(name: string): string {
  return BACKUP_TABLE_LABELS[name] ?? name;
}

/** Tên tệp: sao-luu-KHANH-HA-2026-11-21-0900.xlsx (giờ Việt Nam) */
export function backupFileName(createdAt: string): string {
  const vn = new Date(new Date(createdAt).getTime() + 7 * 3600_000).toISOString();
  return `sao-luu-KHANH-HA-${vn.slice(0, 10)}-${vn.slice(11, 13)}${vn.slice(14, 16)}.xlsx`;
}

export function formatBytes(n: number): string {
  if (!n) return "0 KB";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024)).toLocaleString("en-US")} KB`;
  return `${(n / 1024 / 1024).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
}

/** Tên trang tính hợp lệ, không trùng (Excel: tối đa 31 ký tự, không có \ / ? * [ ] :) */
export function uniqueSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || "Sheet";
  let n = base;
  for (let i = 2; used.has(n.toLowerCase()); i++) n = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  used.add(n.toLowerCase());
  return n;
}

/** Giá trị một ô: số giữ số, đối tượng/mảng chuyển thành chữ JSON, chữ quá dài cắt bớt (Excel tối đa 32.767 ký tự) */
export function backupCellValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 32000 ? `${s.slice(0, 32000)}…` : s;
}
