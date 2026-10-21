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
};

/** Chuyến đang trễ: quá giờ giao dự kiến mà chưa giao xong */
export function isLate(r: Pick<ShipmentListRow, "status" | "expected_delivery_at">, now = Date.now()): boolean {
  return Boolean(r.expected_delivery_at) && ["assigned", "accepted", "in_transit"].includes(r.status) && Date.parse(r.expected_delivery_at!) < now;
}
