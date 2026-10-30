import type { Tone } from "@/lib/tones";

export type StatusOption = { value: string; label: string; tone: Tone };

/** Trạng thái chuyến (shipments.status), dùng chung cho Tổng quan, điều phối và ứng dụng tài xế */
export const SHIPMENT_STATUS: StatusOption[] = [
  { value: "draft", label: "Nháp – chưa phân công", tone: "gray" },
  { value: "assigned", label: "Chờ tài xế nhận", tone: "amber" },
  { value: "accepted", label: "Tài xế đã nhận", tone: "blue" },
  { value: "in_transit", label: "Đang vận chuyển", tone: "purple" },
  { value: "driver_completed", label: "Đã giao – chờ quyết toán", tone: "teal" },
  { value: "closed", label: "Đã đóng", tone: "green" },
  { value: "cancelled", label: "Đã hủy", tone: "pink" },
];

export const DOCUMENT_STATUS: StatusOption[] = [
  { value: "missing", label: "Chưa có chứng từ", tone: "gray" },
  { value: "submitted", label: "Đã nộp", tone: "blue" },
  { value: "verified", label: "Đã xác nhận", tone: "green" },
  { value: "rejected", label: "Yêu cầu nộp lại", tone: "red" },
];

export const SETTLEMENT_STATUS: StatusOption[] = [
  { value: "unsettled", label: "Chưa quyết toán", tone: "gray" },
  { value: "pending_approval", label: "Chờ duyệt quyết toán", tone: "amber" },
  { value: "settled", label: "Đã quyết toán", tone: "green" },
  { value: "reopened", label: "Mở lại", tone: "red" },
];

/** Trạng thái cho phép điều phối phân công / đổi tài xế */
export const ASSIGNABLE_STATUSES = ["draft", "assigned", "accepted"];
/** Trạng thái cho phép hủy chuyến */
export const CANCELLABLE_STATUSES = ["draft", "assigned", "accepted", "in_transit"];
/** Trạng thái đã khóa giá */
/** Chuyến đã hủy thì khóa sửa; chuyến đã đóng vẫn sửa được khi chưa lập công nợ (CSDL chặn chuyến đã lập công nợ) */
export const LOCKED_STATUSES = ["cancelled"];

export const PRICING_UNITS: Record<string, string> = { trip: "chuyến", km: "km", ton: "tấn", other: "khác" };

const find = (list: StatusOption[], v: string): StatusOption => list.find((s) => s.value === v) ?? { value: v, label: v, tone: "gray" };
export const shipmentStatus = (v: string) => find(SHIPMENT_STATUS, v);
export const documentStatus = (v: string) => find(DOCUMENT_STATUS, v);
export const settlementStatus = (v: string) => find(SETTLEMENT_STATUS, v);
