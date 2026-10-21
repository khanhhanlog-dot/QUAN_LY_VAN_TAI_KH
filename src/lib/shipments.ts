import type { AdvField } from "@/lib/advanced-filter";
import { DOCUMENT_STATUS, PRICING_UNITS, SETTLEMENT_STATUS, SHIPMENT_STATUS } from "@/lib/status";

/** Một dòng của view public.shipment_list */
export type ShipmentListRow = {
  id: string;
  shipment_code: string;
  order_id: string;
  order_code: string;
  sequence_in_order: number;
  customer_id: string;
  customer_name: string | null;
  customer_code: string | null;
  pickup_at: string;
  expected_delivery_at: string | null;
  pickup_location_id: string;
  pickup_name: string | null;
  delivery_location_id: string;
  delivery_name: string | null;
  vehicle_type_id: string | null;
  vehicle_type_name: string | null;
  vehicle_id: string | null;
  plate_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_code: string | null;
  price_list_id: string | null;
  unit_price: number;
  pricing_unit: string;
  quantity: number;
  freight_amount: number;
  surcharge_amount: number;
  fuel_support_rate: number | null;
  fuel_support_base: string | null;
  fuel_support_amount: number;
  total_revenue: number;
  status: string;
  document_status: string;
  settlement_status: string;
  notes: string | null;
  version: number;
  custom_fields?: Record<string, unknown> | null;
  order_custom_fields?: Record<string, unknown> | null;
};

/** Chuyến đang trễ: quá giờ giao dự kiến mà chưa giao xong */
export function isLate(r: Pick<ShipmentListRow, "status" | "expected_delivery_at">, now = Date.now()): boolean {
  return Boolean(r.expected_delivery_at) && ["assigned", "accepted", "in_transit"].includes(r.status) && Date.parse(r.expected_delivery_at!) < now;
}

const opts = (list: { value: string; label: string }[]) => list.map(({ value, label }) => ({ value, label }));

/** Các trường dùng được trong tìm kiếm nâng cao của bảng chuyến (cột của view shipment_list) */
export const SHIPMENT_ADV_FIELDS: AdvField[] = [
  { key: "shipment_code", label: "Mã chuyến", kind: "text" },
  { key: "order_code", label: "Mã đơn hàng", kind: "text" },
  { key: "customer_id", label: "Khách hàng", kind: "reference", ref: "customers" },
  { key: "pickup_at", label: "Ngày nhận hàng", kind: "date" },
  { key: "expected_delivery_at", label: "Ngày giao dự kiến", kind: "date" },
  { key: "pickup_location_id", label: "Điểm nhận", kind: "reference", ref: "locations" },
  { key: "delivery_location_id", label: "Điểm giao", kind: "reference", ref: "locations" },
  { key: "vehicle_type_id", label: "Loại xe", kind: "reference", ref: "vehicle_types" },
  { key: "vehicle_id", label: "Xe", kind: "reference", ref: "vehicles" },
  { key: "plate_number", label: "Biển số", kind: "text" },
  { key: "driver_id", label: "Tài xế", kind: "reference", ref: "drivers" },
  { key: "quantity", label: "Số lượng", kind: "number" },
  { key: "pricing_unit", label: "Đơn vị tính", kind: "select", options: Object.entries(PRICING_UNITS).map(([value, label]) => ({ value, label })) },
  { key: "unit_price", label: "Đơn giá", kind: "number" },
  { key: "freight_amount", label: "Cước", kind: "number" },
  { key: "surcharge_amount", label: "Phụ phí", kind: "number" },
  { key: "fuel_support_rate", label: "% hỗ trợ dầu", kind: "number" },
  { key: "fuel_support_amount", label: "Hỗ trợ dầu", kind: "number" },
  { key: "total_revenue", label: "Tổng doanh thu", kind: "number" },
  { key: "status", label: "Trạng thái", kind: "select", options: opts(SHIPMENT_STATUS) },
  { key: "document_status", label: "Chứng từ", kind: "select", options: opts(DOCUMENT_STATUS) },
  { key: "settlement_status", label: "Quyết toán", kind: "select", options: opts(SETTLEMENT_STATUS) },
  { key: "notes", label: "Ghi chú", kind: "text" },
];

/** Trường bổ sung của chuyến dùng trong tìm kiếm nâng cao: khóa cf_<mã trường> */
export function shipmentCustomAdvFields(advFromDefs: AdvField[]): AdvField[] {
  return advFromDefs.map((f) => ({ ...f, key: `cf_${f.key}`, label: `${f.label} (bổ sung)` }));
}

/** Cột ngày giờ (so sánh theo ngày lịch Việt Nam) */
export const SHIPMENT_DATETIME_FIELDS = new Set(["pickup_at", "expected_delivery_at"]);
