import { NextResponse, type NextRequest } from "next/server";
import { sendBackupEmail } from "@/lib/backup-email";

// CSDL (pg_cron + pg_net) gọi vào sau mỗi lần tự sao lưu, kèm mã dùng một lần; không cần đăng nhập.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    // bỏ qua: thân yêu cầu không phải JSON
  }
  if (!/^[0-9a-f]{64}$/.test(token)) return NextResponse.json({ ok: false, error: "Thiếu mã" }, { status: 400 });
  const r = await sendBackupEmail(token);
  return NextResponse.json(r, { status: r.ok ? 200 : 422 });
}
