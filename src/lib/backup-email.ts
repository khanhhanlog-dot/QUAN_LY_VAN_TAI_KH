import "server-only";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";
import { createClient as createAnonClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import { backupFileName, backupTableLabel, orderBackupTables } from "@/lib/backup";
import { buildBackupWorkbook } from "@/lib/backup-excel";

type Payload = {
  ok: boolean;
  error?: string;
  backup_id: string;
  created_at: string;
  kind: "auto" | "manual";
  period_from: string;
  recipients: string[];
  sheets: Record<string, Record<string, unknown>[]>;
};

/** Gmail gửi email: đặt GMAIL_USER và GMAIL_APP_PASSWORD (mật khẩu ứng dụng 16 ký tự) ở Vercel → Settings → Environment Variables */
export function isEmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

const vnDate = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString();
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} ${d.slice(11, 16)}`;
};
const ymdVN = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/**
 * Đổi mã dùng một lần lấy dữ liệu kỳ gửi email, tạo Excel, gửi Gmail, báo kết quả về CSDL.
 * Mã không đúng / đã dùng thì không làm gì.
 */
export async function sendBackupEmail(token: string): Promise<{ ok: boolean; error?: string; recipients?: string[] }> {
  const { url, key } = getSupabaseEnv();
  const db = createAnonClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.rpc("backup_email_payload", { p_token: token });
  if (error) return { ok: false, error: error.message };
  const p = data as Payload;
  if (!p?.ok) return { ok: false, error: p?.error ?? "Mã gửi email không hợp lệ" };

  try {
    if (!isEmailConfigured()) throw new Error("Chưa cài Gmail gửi email (GMAIL_USER, GMAIL_APP_PASSWORD trên Vercel)");
    const when = vnDate(p.created_at);
    const period = `từ ${ymdVN(p.period_from)} đến ${when.slice(0, 10)}`;
    const buf = await buildBackupWorkbook({
      ExcelJS,
      title: `KHÁNH HÀ TMS - Dữ liệu sao lưu lúc ${when}`,
      subtitle: `Kỳ dữ liệu: ${period} (tháng này; đến ngày 15 kèm tháng trước)`,
      sheets: p.sheets,
    });
    const lines = orderBackupTables(Object.keys(p.sheets)).map((n) => `- ${backupTableLabel(n)}: ${(p.sheets[n]?.length ?? 0).toLocaleString("en-US")} dòng`);
    const transport = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
    });
    await transport.sendMail({
      from: `"KHÁNH HÀ TMS" <${process.env.GMAIL_USER}>`,
      to: p.recipients.join(", "),
      subject: `[KHÁNH HÀ TMS] Sao lưu dữ liệu ${when}`,
      text: [
        `Tệp Excel đính kèm là dữ liệu sao lưu ${p.kind === "auto" ? "tự động" : "bấm tay"} lúc ${when} (giờ Việt Nam).`,
        `Kỳ dữ liệu: ${period}.`,
        "",
        ...lines,
        "",
        "Bản sao lưu đầy đủ (mọi bảng, cả danh mục) tải ở phần mềm: Quản trị → Sao lưu dữ liệu.",
        "Email gửi tự động, vui lòng không trả lời.",
      ].join("\n"),
      attachments: [{ filename: backupFileName(p.created_at), content: Buffer.from(buf) }],
    });
    await db.rpc("backup_email_report", { p_token: token, p_ok: true });
    return { ok: true, recipients: p.recipients };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.rpc("backup_email_report", { p_token: token, p_ok: false, p_error: msg });
    return { ok: false, error: msg };
  }
}
