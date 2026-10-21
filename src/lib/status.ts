import type { Tone } from "@/lib/tones";

export type StatusOption = { value: string; label: string; tone: Tone };

/** Trạng thái chuyến (shipments.status), dùng chung cho Tổng quan, điều phối và ứng dụng tài xế */
export const SHIPMENT_STATUS: StatusOption[] = [
  { value: "draft", label: "Nháp", tone: "gray" },
  { value: "assigned", label: "Chờ tài xế nhận", tone: "amber" },
  { value: "accepted", label: "Tài xế đã nhận", tone: "blue" },
  { value: "rejected", label: "Tài xế từ chối", tone: "red" },
  { value: "in_transit", label: "Đang vận chuyển", tone: "purple" },
  { value: "driver_completed", label: "Đã giao – chờ quyết toán", tone: "teal" },
  { value: "closed", label: "Đã đóng", tone: "green" },
  { value: "cancelled", label: "Đã hủy", tone: "pink" },
];

export const shipmentStatus = (v: string): StatusOption =>
  SHIPMENT_STATUS.find((s) => s.value === v) ?? { value: v, label: v, tone: "gray" };
