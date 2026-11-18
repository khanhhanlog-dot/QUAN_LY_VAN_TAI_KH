"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ActionError, requirePermission, runAction, type ActionResult } from "@/lib/auth/action";
import { loadCustomFields, visibleCustomRows } from "@/lib/entities/server";
import { moduleCustomFields, parseNumberVN, validateRecord } from "@/lib/entities/record";

const schema = z.object({
  source: z.enum(["shipment", "order"]),
  id: z.uuid("Giá trị không hợp lệ"),
  key: z.string().min(1).max(100),
  value: z.unknown(),
});

/**
 * Sửa MỘT trường bổ sung (ví dụ Số cont, Số seal, Loại hình vận chuyển) ngay trên bảng Điều phối / Quản lý chuyến.
 * Chỉ ghi đúng trường đó, giữ nguyên các trường khác. Chuyến đang bị người khác giữ khóa sửa thì CSDL chặn (0061).
 */
export async function setTripCustomValue(input: z.input<typeof schema>): Promise<ActionResult> {
  return runAction(async () => {
    const p = schema.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const { source, id, key, value } = p.data;
    const me = source === "shipment" ? await requirePermission("shipments.update", "dispatch.update") : await requirePermission("dispatch.update");
    const supabase = await createClient();
    const mod = source === "shipment" ? "shipments" : "transport_orders";
    const defs = moduleCustomFields(mod, visibleCustomRows(await loadCustomFields(supabase, mod), me.permissions), me.permissions);
    const def = defs.find((d) => d.key === key);
    if (!def) throw new ActionError("Không tìm thấy trường này hoặc bạn không được sửa.");
    if (def.readOnly || def.type === "formula" || def.type === "file") throw new ActionError(`${def.label} không sửa trực tiếp được.`);

    const table = source === "shipment" ? "shipments" : "transport_orders";
    const { data: cur, error: curErr } = await supabase
      .from(table)
      .select(source === "shipment" ? "status, custom_fields, version, order_id" : "status, custom_fields")
      .eq("id", id)
      .maybeSingle();
    if (curErr) throw curErr;
    if (!cur) throw new ActionError(source === "shipment" ? "Không tìm thấy chuyến." : "Không tìm thấy đơn hàng.");
    const row = cur as unknown as { status: string; custom_fields: Record<string, unknown> | null; version?: number; order_id?: string };
    if (row.status === "cancelled") throw new ActionError(source === "shipment" ? "Chuyến đã hủy, không sửa được." : "Đơn hàng đã hủy, không sửa được.");

    // Kiểm tra riêng trường này (bỏ điều kiện hiện/ẩn để không xóa nhầm giá trị)
    const { data, errors } = validateRecord([{ ...def, showIf: undefined }], { [key]: value });
    if (errors[key]) throw new ActionError(errors[key]);
    const merged = { ...(row.custom_fields ?? {}), [key]: data[key] };

    let q = supabase.from(table).update({ custom_fields: merged }).eq("id", id);
    if (source === "shipment" && typeof row.version === "number") q = q.eq("version", row.version);
    const { data: saved, error } = await q.select("id");
    if (error) throw error;
    if (!saved?.length) throw new ActionError("Dữ liệu vừa được người khác sửa hoặc bạn không có quyền. Tải lại trang rồi thử lại.");

    revalidatePath("/dieu-phoi", "layout");
    revalidatePath("/chuyen-xe", "layout");
  }, "Đã lưu.");
}

const feeSchema = z.object({
  shipmentId: z.uuid("Giá trị không hợp lệ"),
  feeTypeId: z.uuid("Giá trị không hợp lệ"),
  part: z.enum(["amount", "ref"]),
  /** Số tiền (chữ có dấu phẩy hàng nghìn) hoặc số hóa đơn; trống = xóa */
  value: z.string().max(100, "Tối đa 100 ký tự").nullable(),
});

type FeeRow = {
  fee_type_id: string;
  amount: number | string;
  note: string | null;
  declaration_type_id: string | null;
  ref_no: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
};

/**
 * Nhập số tiền hoặc số hóa đơn của MỘT loại phí thu khách (phí nâng, phí hạ, phí cược cont…) ngay trên bảng.
 * Đọc mọi dòng phí của chuyến, sửa đúng dòng đó rồi ghi lại qua set_shipment_fees (giữ nguyên các dòng khác,
 * chặn khi chuyến đã lập công nợ hoặc đang bị người khác giữ khóa sửa).
 */
export async function setTripFee(input: z.input<typeof feeSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission("dispatch.create", "dispatch.update", "shipments.update");
    const p = feeSchema.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const { shipmentId, feeTypeId, part } = p.data;
    const text = p.data.value?.trim() ?? "";
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("shipment_fees")
      .select("fee_type_id, amount, note, declaration_type_id, ref_no, quantity, unit_price")
      .eq("shipment_id", shipmentId)
      .order("line_no");
    if (error) throw error;
    const rows = (data ?? []) as FeeRow[];
    const same = rows.filter((r) => r.fee_type_id === feeTypeId);
    if (same.length > 1) throw new ActionError("Chuyến có nhiều dòng của loại phí này. Sửa ở trang chi tiết chuyến (nút Sửa phí).");
    let line = same[0];

    if (part === "amount") {
      let amount: number | null = null;
      if (text) {
        amount = parseNumberVN(text, true);
        if (amount === null || Number.isNaN(amount) || amount < 0) throw new ActionError("Số tiền phí không hợp lệ. Ví dụ: 1,200,000");
        if (amount > 100_000_000_000) throw new ActionError("Số tiền phí quá lớn");
      }
      if (amount === null) {
        // Xóa số tiền: bỏ dòng nếu không còn số hóa đơn, ghi chú; còn thì để 0
        if (!line) return;
        if (!line.ref_no && !line.note && !line.declaration_type_id) rows.splice(rows.indexOf(line), 1);
        else Object.assign(line, { amount: 0, quantity: null, unit_price: null });
      } else if (line) Object.assign(line, { amount, quantity: null, unit_price: null });
      else rows.push((line = { fee_type_id: feeTypeId, amount, note: null, declaration_type_id: null, ref_no: null, quantity: null, unit_price: null }));
    } else {
      if (!line) {
        if (!text) return;
        rows.push((line = { fee_type_id: feeTypeId, amount: 0, note: null, declaration_type_id: null, ref_no: text, quantity: null, unit_price: null }));
      } else line.ref_no = text || null;
    }

    const { error: e2 } = await supabase.rpc("set_shipment_fees", {
      p_shipment_id: shipmentId,
      p_fees: rows.map((r) => ({
        fee_type_id: r.fee_type_id,
        amount: r.amount === null ? "" : r.amount,
        note: r.note ?? "",
        declaration_type_id: r.declaration_type_id ?? "",
        ref_no: r.ref_no ?? "",
        quantity: r.quantity ?? "",
        unit_price: r.unit_price ?? "",
      })),
    });
    if (e2) throw e2;
    revalidatePath(`/chuyen-xe/${shipmentId}`);
    revalidatePath("/dieu-phoi", "layout");
    revalidatePath("/chuyen-xe", "layout");
  }, input.part === "ref" ? "Đã lưu số hóa đơn." : "Đã lưu phí.");
}
