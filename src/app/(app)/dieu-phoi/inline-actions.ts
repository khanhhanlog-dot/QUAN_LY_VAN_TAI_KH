"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ActionError, requirePermission, runAction, type ActionResult } from "@/lib/auth/action";
import { loadCustomFields, visibleCustomRows } from "@/lib/entities/server";
import { moduleCustomFields, validateRecord } from "@/lib/entities/record";

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
