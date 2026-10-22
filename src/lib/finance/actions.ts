"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ActionError, requirePermission, runAction, type ActionResult } from "@/lib/auth/action";
import { moduleCustomFields, splitCustom, validateRecord } from "@/lib/entities/record";
import { loadCustomFields, visibleCustomRows } from "@/lib/entities/server";

const uuid = z.uuid("Giá trị không hợp lệ");
const money = (label: string) => z.number({ error: `Nhập ${label}` }).positive(`${label} phải lớn hơn 0`).max(1_000_000_000_000);

function refreshFinance() {
  revalidatePath("/chi-phi");
  revalidatePath("/phe-duyet");
}

/** Kiểm tra và tách giá trị trường bổ sung của module (ứng tiền / chi phí) */
async function customValues(module: "advances" | "expenses", raw: Record<string, unknown> | undefined, perms: Set<string>) {
  const supabase = await createClient();
  const rows = visibleCustomRows(await loadCustomFields(supabase, module), perms);
  const fields = moduleCustomFields(module, rows, perms).filter((f) => !f.readOnly && f.type !== "formula");
  if (!fields.length) return {};
  const { data, errors } = validateRecord(fields, raw ?? {});
  const first = Object.values(errors)[0];
  if (first) throw new ActionError(first);
  return splitCustom(fields, data).custom;
}

const advanceSchema = z.object({
  driverId: uuid,
  amount: money("số tiền ứng"),
  reason: z.string().trim().min(1, "Nhập lý do ứng tiền").max(500),
  note: z.string().max(1000).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
  clientRequestId: uuid,
});

export async function createAdvance(input: z.input<typeof advanceSchema>): Promise<ActionResult<string>> {
  return runAction(async () => {
    const me = await requirePermission("advances.create");
    const d = advanceSchema.parse(input);
    const custom = await customValues("advances", d.custom, me.permissions);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_advance_request", {
      p_driver_id: d.driverId,
      p_amount: d.amount,
      p_reason: d.reason,
      p_note: d.note ?? null,
      p_custom: custom,
      p_client_request_id: d.clientRequestId,
    });
    if (error) throw error;
    refreshFinance();
    return data as string;
  }, "Đã gửi yêu cầu ứng tiền cho Giám đốc duyệt");
}

const expenseSchema = z.object({
  shipmentId: z.uuid("Chọn chuyến"),
  categoryId: z.uuid("Chọn loại chi phí"),
  amount: money("số tiền"),
  incurredAt: z.string().optional(),
  paidBy: z.enum(["driver", "company"]),
  driverId: uuid.optional(),
  note: z.string().max(1000).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
  clientRequestId: uuid,
});

export async function createExpense(input: z.input<typeof expenseSchema>): Promise<ActionResult<string>> {
  return runAction(async () => {
    const me = await requirePermission("expenses.create");
    const d = expenseSchema.parse(input);
    const custom = await customValues("expenses", d.custom, me.permissions);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("add_shipment_expense", {
      p_shipment_id: d.shipmentId,
      p_category_id: d.categoryId,
      p_amount: d.amount,
      p_incurred_at: d.incurredAt ? new Date(d.incurredAt).toISOString() : null,
      p_note: d.note ?? null,
      p_paid_by: d.paidBy,
      p_driver_id: d.driverId ?? null,
      p_custom: custom,
      p_client_request_id: d.clientRequestId,
    });
    if (error) throw error;
    refreshFinance();
    revalidatePath(`/chuyen-xe/${d.shipmentId}`);
    return data as string;
  }, "Đã lưu chi phí");
}

const decideSchema = z.object({
  requestId: uuid,
  action: z.enum(["approve", "reject"]),
  comment: z.string().max(1000).optional(),
  amount: z.number().positive().optional(),
});

export async function decideApproval(input: z.input<typeof decideSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission("approvals.approve");
    const d = decideSchema.parse(input);
    if (d.action === "reject" && !d.comment?.trim()) throw new ActionError("Nhập lý do từ chối");
    const supabase = await createClient();
    const { error } = await supabase.rpc("approval_decide", {
      p_request_id: d.requestId,
      p_action: d.action,
      p_comment: d.comment ?? null,
      p_amount: d.amount ?? null,
    });
    if (error) throw error;
    refreshFinance();
  }, input.action === "approve" ? "Đã duyệt" : "Đã từ chối");
}

const paySchema = z.object({
  advanceId: uuid,
  paymentMethodId: uuid.optional(),
  bankAccountId: uuid.optional(),
  referenceNo: z.string().max(100).optional(),
  paidAt: z.string().optional(),
  note: z.string().max(1000).optional(),
});

export async function payAdvance(input: z.input<typeof paySchema>): Promise<ActionResult<string>> {
  return runAction(async () => {
    await requirePermission("advances.pay");
    const d = paySchema.parse(input);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("pay_advance", {
      p_advance_id: d.advanceId,
      p_payment_method_id: d.paymentMethodId ?? null,
      p_company_bank_account_id: d.bankAccountId ?? null,
      p_reference_no: d.referenceNo ?? null,
      p_paid_at: d.paidAt ? new Date(d.paidAt).toISOString() : null,
      p_note: d.note ?? null,
    });
    if (error) throw error;
    refreshFinance();
    return data as string;
  }, "Đã ghi nhận chuyển tiền");
}

export type DocumentItem = { id: string; file_name: string; doc_type: string; mime_type: string; created_at: string; url: string | null };

const DOC_ENTITIES = ["shipment", "shipment_expense", "advance_request"] as const;

/** Chứng từ của một bản ghi, kèm đường dẫn xem tạm thời (10 phút) */
export async function listDocuments(entityType: string, entityId: string): Promise<ActionResult<DocumentItem[]>> {
  return runAction(async () => {
    await requirePermission();
    if (!DOC_ENTITIES.includes(entityType as (typeof DOC_ENTITIES)[number]) || !uuid.safeParse(entityId).success) throw new ActionError("Dữ liệu không hợp lệ");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("documents")
      .select("id, file_name, doc_type, mime_type, created_at, storage_path")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("archived_at", null)
      .order("created_at");
    if (error) throw error;
    const rows = (data ?? []) as (Omit<DocumentItem, "url"> & { storage_path: string })[];
    if (!rows.length) return [];
    const { data: signed } = await supabase.storage.from("documents").createSignedUrls(rows.map((r) => r.storage_path), 600);
    return rows.map((r, i) => ({ id: r.id, file_name: r.file_name, doc_type: r.doc_type, mime_type: r.mime_type, created_at: r.created_at, url: signed?.[i]?.signedUrl ?? null }));
  });
}

const registerSchema = z.object({
  entityType: z.enum(DOC_ENTITIES),
  entityId: uuid,
  files: z
    .array(
      z.object({
        path: z.string().regex(/^(shipment|shipment_expense|advance_request)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|pdf)$/),
        name: z.string().min(1).max(200),
        mime: z.enum(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]),
        size: z.number().int().positive().max(10485760),
        docType: z.enum(["photo", "delivery_note", "receipt", "invoice", "other"]),
      }),
    )
    .min(1)
    .max(10),
});

/** Ghi thông tin tệp nhân viên vừa tải lên Storage thành chứng từ của bản ghi */
export async function registerDocuments(input: z.input<typeof registerSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const me = await requirePermission("documents.create");
    const d = registerSchema.parse(input);
    if (d.files.some((f) => !f.path.startsWith(`${d.entityType}/${d.entityId}/`))) throw new ActionError("Đường dẫn tệp không hợp lệ");
    const supabase = await createClient();
    const { error } = await supabase.from("documents").insert(
      d.files.map((f) => ({
        bucket: "documents",
        storage_path: f.path,
        file_name: f.name,
        mime_type: f.mime,
        size_bytes: f.size,
        entity_type: d.entityType,
        entity_id: d.entityId,
        doc_type: f.docType,
        uploaded_by: me.id,
      })),
    );
    if (error) throw error;
    if (d.entityType === "shipment") {
      await supabase.from("shipments").update({ document_status: "submitted" }).eq("id", d.entityId).in("document_status", ["missing", "rejected"]);
      revalidatePath(`/chuyen-xe/${d.entityId}`);
    }
    refreshFinance();
  }, "Đã tải chứng từ lên");
}
