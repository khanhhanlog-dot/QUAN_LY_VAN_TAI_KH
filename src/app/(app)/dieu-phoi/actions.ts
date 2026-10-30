"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { addDaysYMD, startOfDayVN } from "@/lib/format";
import { ActionError, requirePermission, runAction, toUserMessage, type ActionResult } from "@/lib/auth/action";
import { loadCustomFields, visibleCustomRows } from "@/lib/entities/server";
import { moduleCustomFields, parseNumberVN, splitCustom, validateRecord } from "@/lib/entities/record";
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

const dayOrder = z.number().int().min(1, "Thứ tự chuyến của xe phải từ 1").max(99, "Thứ tự chuyến của xe tối đa 99");
const otherOrders = z.array(z.object({ shipmentId: uuid, order: dayOrder })).max(50).optional();

/** Ghi thứ tự chuyến của xe trong ngày (null = bỏ thứ tự) */
async function setDayOrders(supabase: Awaited<ReturnType<typeof createClient>>, list: { shipmentId: string; order: number | null }[]) {
  for (const x of list) {
    const { error } = await supabase.rpc("set_vehicle_day_order", { p_shipment_id: x.shipmentId, p_order: x.order });
    if (error) throw error;
  }
}

const dateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Thời gian không hợp lệ");

const itemSchema = z.object({
  item_code: z.string().max(100, "Mã hàng tối đa 100 ký tự").optional(),
  item_name: z.string().max(300, "Tên hàng tối đa 300 ký tự").optional(),
  quantity: z.union([z.number(), z.string()]).optional(),
  unit: z.string().max(30, "Đơn vị tính tối đa 30 ký tự").optional(),
  note: z.string().max(500, "Ghi chú hàng hóa tối đa 500 ký tự").optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});
const itemsSchema = z.array(itemSchema).max(500, "Mỗi chuyến tối đa 500 dòng hàng hóa");

/** Chuẩn hóa dòng hàng hóa: số lượng theo kiểu Việt Nam, kiểm tra cột bổ sung */
function itemRows(items: z.infer<typeof itemsSchema>, fields: FieldDef[], prefix: string) {
  return items.map((it, j) => {
    const q = it.quantity === undefined || it.quantity === "" ? null : parseNumberVN(it.quantity);
    if (q !== null && (Number.isNaN(q) || q < 0)) throw new ActionError(`${prefix}dòng hàng ${j + 1}: số lượng không hợp lệ`);
    return {
      item_code: it.item_code ?? "",
      item_name: it.item_name ?? "",
      quantity: q ?? "",
      unit: it.unit ?? "",
      note: it.note ?? "",
      custom_fields: customValues(fields, it.custom, `${prefix}dòng hàng ${j + 1}: `),
    };
  });
}

const feeSchema = z.object({
  fee_type_id: z.string().max(40).optional(),
  amount: z.union([z.number(), z.string()]).optional(),
  note: z.string().max(500, "Ghi chú phí tối đa 500 ký tự").optional(),
});
const feesSchema = z.array(feeSchema).max(100, "Mỗi chuyến tối đa 100 dòng phí");

/** Chuẩn hóa dòng phí thu khách: số tiền theo kiểu Việt Nam (1.200.000) */
function feeRows(fees: z.infer<typeof feesSchema>, prefix: string) {
  return fees.map((f, j) => {
    const a = f.amount === undefined || f.amount === "" ? null : parseNumberVN(f.amount, true);
    if (a !== null && (Number.isNaN(a) || a < 0)) throw new ActionError(`${prefix}dòng phí ${j + 1}: số tiền không hợp lệ`);
    return { fee_type_id: f.fee_type_id ?? "", amount: a ?? "", note: f.note ?? "" };
  });
}

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
    items: itemsSchema.optional(),
    fees: feesSchema.optional(),
    vehicleDayOrder: dayOrder.nullable().optional(),
  })
  .refine((s) => s.pickupLocationId !== s.deliveryLocationId, { message: "Điểm nhận và điểm giao phải khác nhau" })
  .refine((s) => !s.expectedDeliveryAt || Date.parse(s.expectedDeliveryAt) >= Date.parse(s.pickupAt), {
    message: "Ngày giao dự kiến không được trước ngày nhận hàng",
  });

const orderSchema = z.object({
  orderId: optUuid,
  customerId: optUuid,
  payerCustomerId: optUuid,
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
  shipments: z.array(shipmentSchema).min(1, "Đơn hàng phải có ít nhất một chuyến").max(100, "Mỗi lần tạo tối đa 100 chuyến"),
  /** Thứ tự mới của các chuyến đã có của xe trong cùng ngày */
  otherOrders,
});

export type CreateOrderInput = z.input<typeof orderSchema>;

/** Tạo đơn hàng gồm nhiều chuyến (hoặc thêm chuyến vào đơn có sẵn) trong một giao dịch */
export async function createOrder(
  input: CreateOrderInput,
): Promise<ActionResult<{ order_id: string; order_code: string; shipments: { id: string; shipment_code: string }[]; itemsError?: string }>> {
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
    const [orderRows, shipRows, itemFieldRows] = await Promise.all([
      loadCustomFields(supabase, "transport_orders"),
      loadCustomFields(supabase, "shipments"),
      loadCustomFields(supabase, "shipment_items"),
    ]);
    const itemFields = moduleCustomFields("shipment_items", visibleCustomRows(itemFieldRows, me.permissions), me.permissions);
    const items = d.shipments.map((s, i) => itemRows(s.items ?? [], itemFields, `Chuyến ${i + 1}, `));
    const fees = d.shipments.map((s, i) => feeRows(s.fees ?? [], `Chuyến ${i + 1}, `));
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
    const created = data as { order_id: string; order_code: string; shipments: { id: string; shipment_code: string }[]; itemsError?: string };
    // Hàng hóa từng chuyến: lỗi ở bước này không làm mất đơn đã tạo, báo lại để nhập ở chi tiết chuyến
    for (const [i, rows] of items.entries()) {
      if (!rows.length || !created.shipments[i]) continue;
      const r = await supabase.rpc("set_shipment_items", { p_shipment_id: created.shipments[i].id, p_items: rows });
      if (r.error) created.itemsError = `Chưa lưu được hàng hóa của chuyến ${created.shipments[i].shipment_code}: ${toUserMessage(r.error)}. Mở chi tiết chuyến để nhập lại.`;
    }
    for (const [i, rows] of fees.entries()) {
      if (!rows.length || !created.shipments[i]) continue;
      const r = await supabase.rpc("set_shipment_fees", { p_shipment_id: created.shipments[i].id, p_fees: rows });
      if (r.error) created.itemsError = `Chưa lưu được phí thu khách của chuyến ${created.shipments[i].shipment_code}: ${toUserMessage(r.error)}. Mở chi tiết chuyến để nhập lại.`;
    }
    // Thứ tự chuyến của xe trong ngày (khi xe chạy nhiều chuyến cùng ngày); chuyến trả về theo đúng thứ tự gửi lên
    await setDayOrders(supabase, [
      ...(d.otherOrders ?? []),
      ...d.shipments.flatMap((s, i) => (s.vehicleDayOrder && created.shipments[i] ? [{ shipmentId: created.shipments[i].id, order: s.vehicleDayOrder }] : [])),
    ]);
    revalidatePath("/dieu-phoi");
    revalidatePath("/chuyen-xe");
    return created;
  });
}

const assignSchema = z.object({
  shipmentId: uuid,
  driverId: optUuid,
  vehicleId: optUuid,
  /** Thứ tự chuyến của xe trong ngày; null = bỏ thứ tự; không gửi = giữ nguyên */
  vehicleDayOrder: dayOrder.nullable().optional(),
  otherOrders,
});

/** Phân công / đổi / gỡ tài xế và xe cho chuyến */
export async function assignShipment(input: z.input<typeof assignSchema>): Promise<ActionResult> {
  return runAction(
    async () => {
      await requirePermission("dispatch.update");
      const p = assignSchema.safeParse(input);
      if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
      const supabase = await createClient();
      const { error } = await supabase.rpc("assign_shipment", {
        p_shipment_id: p.data.shipmentId,
        p_driver_id: p.data.driverId ?? null,
        p_vehicle_id: p.data.vehicleId ?? null,
      });
      if (error) throw error;
      await setDayOrders(supabase, [
        ...(p.data.otherOrders ?? []),
        ...(p.data.vehicleDayOrder !== undefined ? [{ shipmentId: p.data.shipmentId, order: p.data.vehicleDayOrder }] : []),
      ]);
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

const actSchema = z.object({
  shipmentId: uuid,
  step: z.enum(["accept", "start", "complete"]),
  result: z.enum(["full", "partial", "failed"]).optional(),
  note: z.string().max(500, "Ghi chú tối đa 500 ký tự").optional(),
  noExpense: z.boolean().nullable().optional(),
  photoSkipReason: z.string().max(500, "Lý do tối đa 500 ký tự").optional(),
});

/** Điều phối làm thay tài xế: nhận đơn, bắt đầu chạy, hoàn thành (bỏ qua ảnh khi có lý do) */
export async function actForDriver(input: z.input<typeof actSchema>): Promise<ActionResult> {
  const p = actSchema.safeParse(input);
  const msg = { accept: "Đã nhận chuyến thay tài xế.", start: "Đã bắt đầu chạy thay tài xế.", complete: "Đã hoàn thành chuyến thay tài xế." };
  return runAction(async () => {
    await requirePermission("dispatch.update");
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const d = p.data;
    const supabase = await createClient();
    const { error } = await supabase.rpc("dispatch_act_for_driver", {
      p_shipment_id: d.shipmentId,
      p_step: d.step,
      p_result: d.result ?? null,
      p_note: d.note?.trim() || null,
      p_no_expense: d.noExpense ?? null,
      p_photo_skip_reason: d.photoSkipReason?.trim() || null,
    });
    if (error) throw error;
    revalidatePath("/dieu-phoi", "layout");
    revalidatePath("/chuyen-xe", "layout");
  }, p.success ? msg[p.data.step] : undefined);
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

/** Khách thanh toán mặc định trong hồ sơ khách hàng, để tự điền vào đơn hàng */
export async function customerDefaultPayer(customerId: string): Promise<ActionResult<{ id: string; label: string } | null>> {
  return runAction(async () => {
    await requirePermission("dispatch.create", "dispatch.update");
    if (!uuid.safeParse(customerId).success) throw new ActionError("Khách hàng không hợp lệ");
    const supabase = await createClient();
    const { data, error } = await supabase.from("customers").select("default_payer_customer_id").eq("id", customerId).maybeSingle();
    if (error) throw error;
    const payerId = (data as { default_payer_customer_id?: string | null } | null)?.default_payer_customer_id;
    if (!payerId) return null;
    const { data: p, error: e2 } = await supabase.from("customers").select("code, name").eq("id", payerId).maybeSingle();
    if (e2) throw e2;
    return p ? { id: payerId, label: `${p.name} – ${p.code}` } : null;
  });
}

export type VehicleDayTrip = {
  id: string;
  shipment_code: string;
  pickup_at: string;
  expected_delivery_at: string | null;
  pickup_name: string | null;
  delivery_name: string | null;
  customer_name: string | null;
  driver_name: string | null;
  status: string;
  vehicle_day_order: number | null;
};

const dayTripsSchema = z.object({ vehicleId: uuid, day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), excludeShipmentId: optUuid });

/** Các chuyến (chưa hủy) của xe trong một ngày: nhận hàng trong ngày hoặc đang chạy dở sang ngày đó */
export async function vehicleTripsOnDay(input: z.input<typeof dayTripsSchema>): Promise<ActionResult<VehicleDayTrip[]>> {
  return runAction(async () => {
    await requirePermission("dispatch.create", "dispatch.update");
    const p = dayTripsSchema.safeParse(input);
    if (!p.success) throw new ActionError("Dữ liệu không hợp lệ");
    const from = startOfDayVN(p.data.day);
    const supabase = await createClient();
    let q = supabase
      .from("shipment_list")
      .select("id, shipment_code, pickup_at, expected_delivery_at, pickup_name, delivery_name, customer_name, driver_name, status, vehicle_day_order")
      .eq("vehicle_id", p.data.vehicleId)
      .neq("status", "cancelled")
      .lt("pickup_at", startOfDayVN(addDaysYMD(p.data.day, 1)))
      .or(`pickup_at.gte.${from},expected_delivery_at.gte.${from}`)
      .order("pickup_at")
      .limit(20);
    if (p.data.excludeShipmentId) q = q.neq("id", p.data.excludeShipmentId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as VehicleDayTrip[];
  });
}

const itemsInput = z.object({ shipmentId: uuid, items: itemsSchema });

/** Sửa hàng hóa (mã hàng) của chuyến ở trang chi tiết */
export async function saveShipmentItems(input: z.input<typeof itemsInput>): Promise<ActionResult<number>> {
  return runAction(async () => {
    const me = await requirePermission("dispatch.create", "dispatch.update");
    const p = itemsInput.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const supabase = await createClient();
    const fields = moduleCustomFields("shipment_items", visibleCustomRows(await loadCustomFields(supabase, "shipment_items"), me.permissions), me.permissions);
    const { data, error } = await supabase.rpc("set_shipment_items", { p_shipment_id: p.data.shipmentId, p_items: itemRows(p.data.items, fields, "") });
    if (error) throw error;
    revalidatePath(`/chuyen-xe/${p.data.shipmentId}`);
    return data as number;
  }, "Đã lưu hàng hóa của chuyến.");
}

const feesInput = z.object({ shipmentId: uuid, fees: feesSchema });

/** Sửa các khoản phí thu khách của chuyến ở trang chi tiết */
export async function saveShipmentFees(input: z.input<typeof feesInput>): Promise<ActionResult<number>> {
  return runAction(async () => {
    await requirePermission("dispatch.create", "dispatch.update", "shipments.update");
    const p = feesInput.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_shipment_fees", { p_shipment_id: p.data.shipmentId, p_fees: feeRows(p.data.fees, "") });
    if (error) throw error;
    revalidatePath(`/chuyen-xe/${p.data.shipmentId}`);
    revalidatePath("/chuyen-xe");
    return data as number;
  }, "Đã lưu phí thu khách của chuyến.");
}

const cancelOrderSchema = z.object({ orderId: uuid, reason: z.string().trim().min(3, "Vui lòng nhập lý do hủy đơn hàng").max(500) });

/** Hủy cả đơn hàng tạo sai: hủy mọi chuyến chưa hoàn thành, không xóa dữ liệu */
export async function cancelOrder(input: z.input<typeof cancelOrderSchema>): Promise<ActionResult<number>> {
  return runAction(async () => {
    await requirePermission("dispatch.delete", "shipments.delete");
    const p = cancelOrderSchema.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancel_transport_order", { p_order_id: p.data.orderId, p_reason: p.data.reason });
    if (error) throw error;
    revalidatePath("/dieu-phoi", "layout");
    revalidatePath("/chuyen-xe", "layout");
    return data as number;
  }, "Đã hủy đơn hàng.");
}
