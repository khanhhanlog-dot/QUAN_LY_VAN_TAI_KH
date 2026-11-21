"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ActionError, requirePermission, runAction, type ActionResult } from "@/lib/auth/action";
import { sendBackupEmail } from "@/lib/backup-email";

/** Nút "Sao lưu ngay" (sendEmail: gửi luôn tệp Excel về các email đã nhập) */
export async function createBackupNow(sendEmail = false): Promise<ActionResult<{ id: string; emailedTo: string[] }>> {
  return runAction(async () => {
    await requirePermission("backups.create");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("create_data_backup", { p_send_email: Boolean(sendEmail) });
    if (error) throw error;
    const r = data as { id: string; status: string; error: string | null; email_token: string | null };
    if (r.status !== "ok") {
      revalidatePath("/sao-luu");
      throw new ActionError(`Sao lưu bị lỗi: ${r.error ?? "không rõ lý do"}`);
    }
    let emailedTo: string[] = [];
    if (sendEmail) {
      if (!r.email_token) throw new ActionError("Đã sao lưu, nhưng chưa nhập email nhận nên chưa gửi.");
      const sent = await sendBackupEmail(r.email_token);
      revalidatePath("/sao-luu");
      if (!sent.ok) throw new ActionError(`Đã sao lưu, nhưng gửi email lỗi: ${sent.error}`);
      emailedTo = sent.recipients ?? [];
    }
    revalidatePath("/sao-luu");
    return { id: r.id, emailedTo };
  }, sendEmail ? "Đã sao lưu và gửi email." : "Đã sao lưu dữ liệu.");
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  hours: z.array(z.number().int().min(0).max(23)).max(24),
  keepDays: z.number().int().min(1, "Số ngày giữ ít nhất 1").max(365, "Số ngày giữ tối đa 365"),
  emails: z.array(z.string().trim().toLowerCase().email("Email không hợp lệ")).max(20, "Tối đa 20 email"),
});

/** Lưu giờ tự sao lưu và số ngày giữ */
export async function saveBackupSettings(input: z.input<typeof settingsSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission("backups.configure");
    const d = settingsSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_backup_settings", { p_enabled: d.enabled, p_hours: d.hours, p_keep_days: d.keepDays, p_emails: d.emails });
    if (error) throw error;
    revalidatePath("/sao-luu");
  }, "Đã lưu cấu hình sao lưu.");
}
