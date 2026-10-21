"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ActionError, requirePermission, runAction, type ActionResult } from "@/lib/auth/action";
import { loadCustomFields, visibleCustomRows } from "@/lib/entities/server";
import { moduleCustomFields, splitCustom, validateRecord } from "@/lib/entities/record";
import type { FieldDef } from "@/lib/entities/types";

/** Kiểm tra và chuẩn hóa giá trị trường bổ sung (cùng quy tắc với biểu mẫu danh mục) */
function customValues(fields: FieldDef[], raw: Record<string, unknown> | undefined, prefix: string): Record<string, unknown> {
  const editable = fields.filter((f) => !f.readOnly && f.type !== "formula");
  if (!editable.length) return {};
  const { data, errors } = validateRecord(editable, raw ?? {});
  const first = Object.values(errors)[0];
  if (first) throw new ActionError(prefix + first);
  return splitCustom(editable, data).custom;
}

const uuid = z.uuid("Giá trị không hợp lệ");
const optUuid = uuid.optional().or(z.literal("").transform(() => undefined));
const optNum = (label: string, opts: { min?: number; max?: number; positive?: boolean } = {}) =>
  z
    .union([z.number(), z.string()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return undefined;
      const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: "custom", message: `${label} không hợp lệ` });
        return z.NEVER;
      }
      if ((opts.positive && n <= 0) || (opts.min !== undefined && n < opts.min) || (opts.max !== undefined && n > opts.max)) {
        ctx.addIssue({ code: "custom", message: `${label} nằm ngoài giới hạn cho phép` });
        return z.NEVER;
      }
      return n;
    });

export type QuoteResult = {
  route: { id: string; name: string; distance_km: number | null } | null;
  candidates: {
    id: string;
    code: string;
    unit_price: number;
    pricing_unit: string;
    pricing_unit_label: string | null;
    fuel_support_rate: number | null;
    surcharge_amount: number;
    specificity: number;
    priority: number;
  }[];
  fuel_rule: { id: string; scope_type: string; rate_percent: number | null; calculation_base: string } | null;
};

const quoteSchema = z.object({
  customerId: optUuid,
  pickupId: uuid,
  deliveryId: uuid,
  vehicleTypeId: optUuid,
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ"),
});

/** Báo giá cho một chuyến: bảng giá ứng viên, tuyến, quy tắc hỗ trợ dầu */
export async function quoteShipment(input: z.input<typeof quoteSchema>): Promise<ActionResult<QuoteResult>> {
  return runAction(async () => {
    await requirePermission("dispatch.create", "dispatch.update");
    const p = quoteSchema.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("quote_shipment", {
      p_customer_id: p.data.customerId ?? null,
      p_pickup: p.data.pickupId,
      p_delivery: p.data.deliveryId,
      p_vehicle_type: p.data.vehicleTypeId ?? null,
      p_on: p.data.onDate,
    });
    if (error) throw error;
    return data as QuoteResult;
  });
}

const dateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Thời gian không hợp lệ");

const shipmentSchema = z
  .object({
    pickupAt: dateTime,
    expectedDeliveryAt: dateTime.optional().or(z.literal("").transform(() => undefined)),
    pickupLocationId: uuid,
    deliveryLocationId: uuid,
    vehicleTypeId: optUuid,
    vehicleId: optUuid,
    driverId: optUuid,
    priceListId: optUuid,
    unitPrice: optNum("Đơn giá", { min: 0 }),
    pricingUnit: z.enum(["trip", "km", "ton"]).optional(),
    quantity: optNum("Số lượng", { positive: true }),
    surchargeAmount: optNum("Phụ phí", { min: 0 }),
    fuelSupportRate: optNum("Tỷ lệ hỗ trợ dầu", { min: 0, max: 100 }),
    notes: z.string().max(1000).optional(),
    custom: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((s) => s.pickupLocationId !== s.deliveryLocationId, { message: "Điểm nhận và điểm giao phải khác nhau" })
  .refine((s) => !s.expectedDeliveryAt || Date.parse(s.expectedDeliveryAt) >= Date.parse(s.pickupAt), {
    message: "Giờ giao dự kiến phải sau giờ nhận hàng",
  });

const orderSchema = z.object({
  orderId: optUuid,
  customerId: optUuid,
  payerCustomerId: optUuid,
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
  shipments: z.array(shipmentSchema).min(1, "Đơn hàng phải có ít nhất một chuyến").max(100, "Mỗi lần tạo tối đa 100 chuyến"),
});

export type CreateOrderInput = z.input<typeof orderSchema>;

/** Tạo đơn hàng gồm nhiều chuyến (hoặc thêm chuyến vào đơn có sẵn) trong một giao dịch */
export async function createOrder(input: CreateOrderInput): Promise<ActionResult<{ order_id: string; order_code: string; shipments: { id: string; shipment_code: string }[] }>> {
  return runAction(async () => {
    const me = await requirePermission("dispatch.create");
    const p = orderSchema.safeParse(input);
    if (!p.success) {
      const issue = p.error.issues[0];
      const idx = issue?.path[0] === "shipments" && typeof issue.path[1] === "number" ? `Chuyến ${issue.path[1] + 1}: ` : "";
      throw new ActionError(idx + (issue?.message ?? "Dữ liệu không hợp lệ"));
    }
    const d = p.data;
    if (!d.orderId && !d.customerId) throw new ActionError("Vui lòng chọn khách hàng.");
    const supabase = await createClient();
    const [orderRows, shipRows] = await Promise.all([loadCustomFields(supabase, "transport_orders"), loadCustomFields(supabase, "shipments")]);
    const orderCustom = d.orderId ? {} : customValues(moduleCustomFields("transport_orders", visibleCustomRows(orderRows, me.permissions), me.permissions), d.custom, "Đơn hàng: ");
    const shipFields = moduleCustomFields("shipments", visibleCustomRows(shipRows, me.permissions), me.permissions);
    const order = d.orderId
      ? { id: d.orderId }
      : { customer_id: d.customerId, payer_customer_id: d.payerCustomerId ?? "", order_date: d.orderDate, notes: d.notes ?? "", custom_fields: orderCustom };
    const shipments = d.shipments.map((s, i) => ({
      pickup_at: new Date(s.pickupAt).toISOString(),
      expected_delivery_at: s.expectedDeliveryAt ? new Date(s.expectedDeliveryAt).toISOString() : "",
      pickup_location_id: s.pickupLocationId,
      delivery_location_id: s.deliveryLocationId,
      vehicle_type_id: s.vehicleTypeId ?? "",
      vehicle_id: s.vehicleId ?? "",
      driver_id: s.driverId ?? "",
      price_list_id: s.priceListId ?? "",
      unit_price: s.unitPrice ?? "",
      pricing_unit: s.pricingUnit ?? "",
      quantity: s.quantity ?? "",
      surcharge_amount: s.surchargeAmount ?? "",
      fuel_support_rate: s.fuelSupportRate ?? "",
      notes: s.notes ?? "",
      custom_fields: customValues(shipFields, s.custom, `Chuyến ${i + 1}: `),
    }));
    const { data, error } = await supabase.rpc("create_transport_order", { p_order: order, p_shipments: shipments });
    if (error) throw error;
    revalidatePath("/dieu-phoi");
    revalidatePath("/chuyen-xe");
    return data as { order_id: string; order_code: string; shipments: { id: string; shipment_code: string }[] };
  });
}

const assignSchema = z.object({ shipmentId: uuid, driverId: optUuid, vehicleId: optUuid });

/** Phân công / đổi / gỡ tài xế và xe cho chuyến */
export async function assignShipment(input: z.input<typeof assignSchema>): Promise<ActionResult> {
  return runAction(
    async () => {
      await requirePermission("dispatch.update");
      const p = assignSchema.safeParse(input);
      if (!p.success) throw new ActionError("Dữ liệu không hợp lệ");
      const supabase = await createClient();
      const { error } = await supabase.rpc("assign_shipment", {
        p_shipment_id: p.data.shipmentId,
        p_driver_id: p.data.driverId ?? null,
        p_vehicle_id: p.data.vehicleId ?? null,
      });
      if (error) throw error;
      revalidatePath("/dieu-phoi", "layout");
      revalidatePath("/chuyen-xe", "layout");
    },
    input.driverId ? "Đã phân công chuyến." : "Đã gỡ phân công.",
  );
}

const cancelSchema = z.object({ shipmentId: uuid, reason: z.string().trim().min(3, "Vui lòng nhập lý do hủy (ít nhất 3 ký tự)").max(500) });

/** Hủy chuyến: bắt buộc lý do, không xóa dữ liệu */
export async function cancelShipment(input: z.input<typeof cancelSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission("dispatch.delete", "shipments.delete");
    const p = cancelSchema.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const supabase = await createClient();
    const { error } = await supabase.rpc("cancel_shipment", { p_shipment_id: p.data.shipmentId, p_reason: p.data.reason });
    if (error) throw error;
    revalidatePath("/dieu-phoi", "layout");
    revalidatePath("/chuyen-xe", "layout");
  }, "Đã hủy chuyến.");
}

/** Xe đang hoạt động kèm tài xế phụ trách, để gợi ý tài xế khi chọn xe */
export async function vehicleDefaultDriver(vehicleId: string): Promise<ActionResult<{ driverId: string | null; vehicleTypeId: string | null }>> {
  return runAction(async () => {
    await requirePermission("dispatch.create", "dispatch.update");
    if (!uuid.safeParse(vehicleId).success) throw new ActionError("Xe không hợp lệ");
    const supabase = await createClient();
    const { data, error } = await supabase.from("vehicles").select("assigned_driver_id, vehicle_type_id").eq("id", vehicleId).maybeSingle();
    if (error) throw error;
    return { driverId: data?.assigned_driver_id ?? null, vehicleTypeId: data?.vehicle_type_id ?? null };
  });
}
