"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ActionError, requirePermission, runAction, type ActionResult } from "@/lib/auth/action";
import { parseNumberVN } from "@/lib/entities/record";

const uuid = z.uuid("Giá trị không hợp lệ");
const optNum = z.number().nonnegative().max(1_000_000_000_000).nullable().optional();

const lineSchema = z.object({
  kind: z.enum(["freight", "pass_through", "other"]),
  feeTypeId: uuid.nullable().optional(),
  description: z.string().max(200).optional(),
  quantity: optNum,
  unitPrice: optNum,
  amount: optNum,
  refNo: z.string().max(100).optional(),
  note: z.string().max(500).optional(),
});

const costsSchema = z.object({
  shipmentId: uuid,
  supplierId: uuid.nullable(),
  invoiceNo: z.string().max(100).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  lines: z.array(lineSchema).max(100, "Tối đa 100 khoản"),
});

function refresh(shipmentId?: string) {
  if (shipmentId) revalidatePath(`/chuyen-xe/${shipmentId}`);
  revalidatePath("/thue-ngoai");
  revalidatePath("/cong-no");
  revalidatePath("/bao-cao");
}

/** Lưu cước, chi hộ, chi phí khác phải trả nhà xe 3PL của chuyến; tự lập/cập nhật công nợ phải trả */
export async function saveCarrierCosts(input: z.input<typeof costsSchema>): Promise<ActionResult<{ total: number; payable_code: string | null }>> {
  return runAction(async () => {
    await requirePermission("dispatch.update", "shipments.update", "receivables.create");
    const p = costsSchema.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const d = p.data;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("set_shipment_carrier_costs", {
      p_shipment_id: d.shipmentId,
      p_supplier_id: d.supplierId,
      p_lines: d.lines.map((l) => ({
        kind: l.kind,
        fee_type_id: l.feeTypeId ?? null,
        description: l.description?.trim() || null,
        quantity: l.quantity ?? null,
        unit_price: l.unitPrice ?? null,
        amount: l.amount ?? null,
        ref_no: l.refNo?.trim() || null,
        note: l.note?.trim() || null,
      })),
      p_invoice_no: d.invoiceNo?.trim() || null,
      p_due_date: d.dueDate ?? null,
    });
    if (error) throw error;
    refresh(d.shipmentId);
    const r = data as { total: number; payable_code: string | null };
    return { total: Number(r.total), payable_code: r.payable_code };
  }, "Đã lưu chi phí 3PL của chuyến.");
}

export type OpenCarrierPayable = {
  payable_id: string;
  payable_code: string;
  shipment_code: string;
  report_date: string;
  plate_number: string | null;
  carrier_total: number;
  remaining_amount: number;
  due_date: string | null;
  overdue_days: number;
};

/** Các chuyến còn nợ của một nhà xe (để trả gộp) */
export async function listOpenCarrierPayables(supplierId: string): Promise<ActionResult<OpenCarrierPayable[]>> {
  return runAction(async () => {
    await requirePermission("receivables.pay");
    const id = uuid.parse(supplierId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("report_carrier_trips")
      .select("payable_id, payable_code, shipment_code, report_date, plate_number, carrier_total, remaining_amount, due_date, overdue_days")
      .eq("supplier_id", id)
      .in("pay_status", ["unpaid", "partial"])
      .order("report_date")
      .limit(500);
    if (error) throw error;
    return (data ?? []) as OpenCarrierPayable[];
  });
}

const bulkSchema = z.object({
  payableIds: z.array(uuid).min(1, "Chọn ít nhất một chuyến").max(500),
  paymentMethodId: uuid.optional(),
  bankAccountId: uuid.optional(),
  referenceNo: z.string().max(100).optional(),
  paidAt: z.string().optional(),
  note: z.string().max(1000).optional(),
});

/** Trả đủ số còn nợ của nhiều chuyến cùng một nhà xe (mỗi chuyến một phiếu chi, cùng số giao dịch) */
export async function payCarrierPayables(input: z.input<typeof bulkSchema>): Promise<ActionResult<{ count: number; total: number }>> {
  return runAction(async () => {
    await requirePermission("receivables.pay");
    const p = bulkSchema.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const d = p.data;
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pay_carrier_payables", {
      p_payable_ids: d.payableIds,
      p_payment_method_id: d.paymentMethodId ?? null,
      p_company_bank_account_id: d.bankAccountId ?? null,
      p_reference_no: d.referenceNo ?? null,
      p_paid_at: d.paidAt ? new Date(d.paidAt).toISOString() : null,
      p_note: d.note ?? null,
    });
    if (error) throw error;
    refresh();
    const r = data as { count: number; total: number };
    return { count: Number(r.count), total: Number(r.total) };
  });
}

const amountSchema = z.object({
  shipmentId: uuid,
  kind: z.enum(["freight", "pass_through", "other"]),
  value: z.string().max(30).nullable(),
});

type SavedLine = { cost_kind: string; fee_type_id: string | null; description: string | null; quantity: number | null; unit_price: number | null; amount: number; ref_no: string | null; note: string | null };

/**
 * Nhập nhanh MỘT loại chi phí 3PL (cước / chi hộ / chi phí khác) ngay trên bảng Xe thuê ngoài 3PL.
 * Đọc mọi khoản 3PL của chuyến, thay số tiền đúng loại đó rồi ghi lại qua set_shipment_carrier_costs
 * (giữ nguyên các khoản khác, số hóa đơn, hạn trả; khóa sửa chuyến 0061 vẫn chặn khi người khác đang sửa).
 * Chuyến có nhiều khoản cùng loại thì báo mở khung Nhập chi phí.
 */
export async function setCarrierCostAmount(input: z.input<typeof amountSchema>): Promise<ActionResult<{ total: number; payable_code: string | null }>> {
  return runAction(async () => {
    await requirePermission("dispatch.update", "shipments.update", "receivables.create");
    const p = amountSchema.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const { shipmentId, kind } = p.data;
    const text = p.data.value?.trim() ?? "";
    let amount: number | null = null;
    if (text) {
      amount = parseNumberVN(text, true);
      if (amount === null || Number.isNaN(amount) || amount < 0) throw new ActionError("Số tiền không hợp lệ. Ví dụ: 2,500,000");
      if (amount > 1_000_000_000_000) throw new ActionError("Số tiền quá lớn");
    }
    const supabase = await createClient();
    const [shipRes, linesRes] = await Promise.all([
      supabase.from("shipments").select("status, carrier_supplier_id, vehicle:vehicles(supplier_id)").eq("id", shipmentId).maybeSingle(),
      supabase.from("shipment_carrier_costs").select("cost_kind, fee_type_id, description, quantity, unit_price, amount, ref_no, note").eq("shipment_id", shipmentId).order("line_no"),
    ]);
    if (shipRes.error) throw shipRes.error;
    if (linesRes.error) throw linesRes.error;
    const s = shipRes.data as unknown as { status: string; carrier_supplier_id: string | null; vehicle: { supplier_id: string | null } | null } | null;
    if (!s) throw new ActionError("Không tìm thấy chuyến.");
    if (s.status === "cancelled") throw new ActionError("Chuyến đã hủy, không nhập chi phí 3PL.");
    const lines = (linesRes.data ?? []) as SavedLine[];
    const same = lines.filter((l) => l.cost_kind === kind);
    const what = kind === "freight" ? "cước" : kind === "pass_through" ? "chi hộ" : "chi phí khác";
    if (same.length > 1) throw new ActionError(`Chuyến có ${same.length} khoản ${what} 3PL. Bấm "Sửa chi phí" ở cuối dòng để sửa từng khoản.`);
    const line = same[0];
    if ((line ? Number(line.amount) : null) === amount || (!line && !amount)) return { total: lines.reduce((a, l) => a + Number(l.amount), 0), payable_code: null };
    if (!amount) {
      if (line) lines.splice(lines.indexOf(line), 1);
    } else if (line) Object.assign(line, { amount, quantity: null, unit_price: null });
    else lines.push({ cost_kind: kind, fee_type_id: null, description: null, quantity: null, unit_price: null, amount, ref_no: null, note: null });

    const supplierId = s.carrier_supplier_id ?? s.vehicle?.supplier_id ?? null;
    if (lines.some((l) => Number(l.amount) > 0) && !supplierId) throw new ActionError('Chuyến chưa có nhà xe 3PL. Bấm "Nhập chi phí" ở cuối dòng để chọn nhà xe.');
    const { data, error } = await supabase.rpc("set_shipment_carrier_costs", {
      p_shipment_id: shipmentId,
      p_supplier_id: supplierId,
      p_lines: lines.map((l) => ({
        kind: l.cost_kind,
        fee_type_id: l.fee_type_id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        amount: l.amount,
        ref_no: l.ref_no,
        note: l.note,
      })),
      p_invoice_no: null,
      p_due_date: null,
    });
    if (error) throw error;
    refresh(shipmentId);
    const r = data as { total: number; payable_code: string | null };
    return { total: Number(r.total), payable_code: r.payable_code };
  }, "Đã lưu chi phí 3PL.");
}
