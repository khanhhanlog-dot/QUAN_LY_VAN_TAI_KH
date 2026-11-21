"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, DatabaseBackup, Download, Mail, Plus, Save, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReportGrid, type ReportColumn } from "@/components/grid/report-grid";
import { createClient } from "@/lib/supabase/client";
import { createBackupNow, saveBackupSettings } from "@/lib/backup-actions";
import { buildBackupWorkbook } from "@/lib/backup-excel";
import { backupFileName, formatBytes, type BackupOverview, type BackupRow } from "@/lib/backup";
import { formatDateTime } from "@/lib/format";
import type { TableViewConfig } from "@/lib/entities/types";
import { cn } from "@/lib/utils";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

const EMAIL_STATUS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "info" }> = {
  pending: { label: "Chờ gửi", variant: "info" },
  sending: { label: "Đang gửi", variant: "info" },
  sent: { label: "Đã gửi", variant: "success" },
  error: { label: "Gửi lỗi", variant: "destructive" },
};

async function downloadBackup(row: BackupRow) {
  const supabase = createClient();
  const { data, error } = await supabase.from("data_backups").select("data").eq("id", row.id).single();
  if (error) throw error;
  const ExcelJS = (await import("exceljs")).default;
  const buf = await buildBackupWorkbook({
    ExcelJS,
    title: `KHÁNH HÀ TMS - Sao lưu đầy đủ lúc ${formatDateTime(row.created_at)}`,
    subtitle: "Toàn bộ dữ liệu (mọi bảng, cả danh mục). Mỗi bảng một trang tính, bấm tên trang tính ở Mục lục để mở.",
    sheets: (data?.data ?? {}) as Record<string, Record<string, unknown>[]>,
  });
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = backupFileName(row.created_at);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function DownloadButton({ row }: { row: BackupRow }) {
  const [busy, setBusy] = useState(false);
  if (row.status !== "ok") return null;
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadBackup(row);
        } catch (e) {
          toast.error(`Không tải được: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Download className="size-3.5" /> {busy ? "Đang tạo…" : "Tải Excel"}
    </Button>
  );
}

export function BackupManager({
  overview,
  rows,
  view,
  canCreate,
  canConfigure,
  emailReady,
}: {
  overview: BackupOverview;
  rows: BackupRow[];
  view: TableViewConfig | null;
  canCreate: boolean;
  canConfigure: boolean;
  emailReady: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(overview.enabled);
  const [hours, setHours] = useState<number[]>(overview.hours.map(Number));
  const [keepDays, setKeepDays] = useState(String(overview.keep_days));
  const [emails, setEmails] = useState<string[]>(overview.emails ?? []);
  const [emailInput, setEmailInput] = useState("");
  const [saving, startSave] = useTransition();
  const [running, startRun] = useTransition();
  const dirty =
    enabled !== overview.enabled ||
    [...hours].sort((a, b) => a - b).join() !== overview.hours.map(Number).sort((a, b) => a - b).join() ||
    keepDays !== String(overview.keep_days) ||
    emails.join() !== (overview.emails ?? []).join();

  function addEmails() {
    const parts = emailInput.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    const bad = parts.filter((e) => !EMAIL_RE.test(e));
    if (bad.length) {
      toast.error(`Email không hợp lệ: ${bad.join(", ")}`);
      return;
    }
    setEmails((cur) => [...new Set([...cur, ...parts])].sort());
    setEmailInput("");
  }

  function save() {
    // Email đang gõ dở (chưa bấm Thêm) cũng được lưu
    const pending = emailInput.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (pending.some((e) => !EMAIL_RE.test(e))) {
      toast.error("Email đang nhập không hợp lệ");
      return;
    }
    const allEmails = [...new Set([...emails, ...pending])].sort();
    startSave(async () => {
      const res = await saveBackupSettings({ enabled, hours, keepDays: Number(keepDays), emails: allEmails });
      if (res.ok) {
        toast.success(res.message);
        setEmails(allEmails);
        setEmailInput("");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function runNow(sendEmail: boolean) {
    startRun(async () => {
      const res = await createBackupNow(sendEmail);
      if (res.ok) {
        toast.success(sendEmail && res.data?.emailedTo.length ? `Đã sao lưu và gửi email tới ${res.data.emailedTo.join(", ")}` : res.message);
      } else toast.error(res.error);
      router.refresh();
    });
  }

  const columns: ReportColumn<BackupRow>[] = [
    { key: "created_at", label: "Thời gian", width: 150, kind: "date", value: (r) => r.created_at, render: (r) => formatDateTime(r.created_at) },
    {
      key: "kind",
      label: "Cách sao lưu",
      width: 120,
      kind: "select",
      options: [
        { value: "auto", label: "Tự động" },
        { value: "manual", label: "Bấm tay" },
      ],
      value: (r) => r.kind,
      render: (r) => (r.kind === "auto" ? "Tự động" : "Bấm tay"),
    },
    { key: "created_by_name", label: "Người sao lưu", width: 150, value: (r) => r.created_by_name ?? (r.kind === "auto" ? "Hệ thống" : "") },
    {
      key: "status",
      label: "Trạng thái",
      width: 120,
      kind: "select",
      options: [
        { value: "ok", label: "Thành công" },
        { value: "error", label: "Lỗi" },
      ],
      value: (r) => r.status,
      render: (r) => <Badge variant={r.status === "ok" ? "success" : "destructive"}>{r.status === "ok" ? "Thành công" : "Lỗi"}</Badge>,
    },
    { key: "row_total", label: "Số dòng dữ liệu", width: 120, align: "right", kind: "number", value: (r) => r.row_total, render: (r) => r.row_total.toLocaleString("en-US") },
    { key: "size_bytes", label: "Dung lượng", width: 100, align: "right", kind: "number", value: (r) => r.size_bytes, render: (r) => formatBytes(r.size_bytes) },
    {
      key: "email_status",
      label: "Email",
      width: 130,
      kind: "select",
      options: Object.entries(EMAIL_STATUS).map(([value, s]) => ({ value, label: s.label })),
      value: (r) => r.email_status,
      render: (r) => (r.email_status ? <Badge variant={EMAIL_STATUS[r.email_status].variant}>{EMAIL_STATUS[r.email_status].label}</Badge> : <span className="text-muted-foreground">Không gửi</span>),
    },
    { key: "email_to", label: "Gửi tới", width: 220, value: (r) => (r.email_to ?? []).join(", ") },
    { key: "error", label: "Ghi chú lỗi", width: 260, value: (r) => [r.error, r.email_error].filter(Boolean).join(" · ") },
    { key: "download", label: "Tải về", width: 120, sortable: false, value: () => "", render: (r) => <DownloadButton row={r} /> },
  ];

  const lastOk = rows.find((r) => r.status === "ok");
  const sortedHours = [...hours].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      {!overview.scheduler_ok ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Chưa bật hẹn giờ trong CSDL (pg_cron). Chạy tệp nâng cấp sao lưu dữ liệu trong Supabase SQL Editor để tự sao lưu theo giờ.
        </div>
      ) : null}
      {!emailReady && emails.length ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Chưa cài Gmail gửi email (GMAIL_USER, GMAIL_APP_PASSWORD trên Vercel) nên chưa gửi được email. Bản sao lưu vẫn được lưu trong phần mềm.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Lịch tự động sao lưu</CardTitle>
            <CardDescription>
              Bấm chọn các giờ sao lưu mỗi ngày (giờ Việt Nam). Ví dụ chọn 09:00, 14:00, 17:00. Hệ thống tự sao lưu trong vòng 10 phút sau mỗi giờ đã chọn,
              lỗi thì tự thử lại.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" className="size-4" checked={enabled} disabled={!canConfigure} onChange={(e) => setEnabled(e.target.checked)} />
              Bật tự động sao lưu
            </label>
            <div>
              <div className="mb-1.5 text-sm font-medium">Giờ sao lưu</div>
              <div className="flex flex-wrap gap-1.5">
                {HOURS.map((h) => {
                  const on = hours.includes(h);
                  return (
                    <button
                      key={h}
                      type="button"
                      disabled={!canConfigure}
                      aria-pressed={on}
                      onClick={() => setHours((cur) => (on ? cur.filter((x) => x !== h) : [...cur, h]))}
                      className={cn(
                        "h-8 w-14 rounded-md border text-sm tabular-nums transition-colors disabled:opacity-60",
                        on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
                      )}
                    >
                      {hh(h)}
                    </button>
                  );
                })}
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">Đang chọn: {sortedHours.length ? sortedHours.map(hh).join(", ") : "chưa chọn giờ nào"}</div>
            </div>
            <div className="max-w-xs">
              <label className="mb-1.5 block text-sm font-medium" htmlFor="keep-days">
                Giữ bản sao lưu trong (ngày)
              </label>
              <Input id="keep-days" type="number" min={1} max={365} value={keepDays} disabled={!canConfigure} onChange={(e) => setKeepDays(e.target.value)} />
              <div className="mt-1 text-xs text-muted-foreground">Ví dụ 30: bản cũ hơn 30 ngày tự xóa. Luôn giữ lại 3 bản gần nhất.</div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium" htmlFor="backup-email">
                Email nhận tệp Excel
              </label>
              <div className="flex max-w-xl gap-2">
                <Input
                  id="backup-email"
                  type="text"
                  placeholder="Ví dụ: ketoan@gmail.com (nhiều email cách nhau dấu phẩy)"
                  value={emailInput}
                  disabled={!canConfigure}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addEmails();
                    }
                  }}
                />
                <Button type="button" variant="outline" disabled={!canConfigure || !emailInput.trim()} onClick={addEmails}>
                  <Plus className="size-4" /> Thêm
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {emails.length ? (
                  emails.map((e) => (
                    <span key={e} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-0.5 text-sm">
                      {e}
                      {canConfigure ? (
                        <button type="button" aria-label={`Bỏ ${e}`} onClick={() => setEmails((cur) => cur.filter((x) => x !== e))} className="text-muted-foreground hover:text-foreground">
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">Chưa có email nào: chỉ lưu trong phần mềm, không gửi email.</span>
                )}
              </div>
              <div className="mt-1.5 text-xs text-muted-foreground">
                Tệp gửi email có dữ liệu tháng hiện tại. Từ ngày 1 đến ngày 15 kèm thêm tháng trước, từ ngày 16 bỏ tháng trước. Gồm danh sách chuyến, đơn hàng,
                phí thu khách, chi phí, chi phí 3PL, ứng tiền, công nợ, thanh toán, đề nghị chi.
              </div>
            </div>
            {canConfigure ? (
              <Button onClick={save} disabled={saving || (!dirty && !emailInput.trim())}>
                <Save className="size-4" /> {saving ? "Đang lưu…" : "Lưu cấu hình"}
              </Button>
            ) : (
              <div className="text-xs text-muted-foreground">Bạn chỉ xem được cấu hình (cần quyền Cấu hình - Sao lưu dữ liệu để sửa).</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tình trạng</CardTitle>
            <CardDescription>Bản sao lưu chứa mọi bảng dữ liệu. Ảnh, tệp đính kèm lưu riêng ở kho tệp, không nằm trong bản sao lưu.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Hẹn giờ</span>
              <span className="font-medium">{overview.scheduler_ok ? (overview.enabled ? "Đang chạy" : "Đang tắt") : "Chưa bật"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Lần thành công gần nhất</span>
              <span className="font-medium">{lastOk ? formatDateTime(lastOk.created_at) : "Chưa có"}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Số bản đang giữ</span>
              <span className="font-medium">{rows.filter((r) => r.status === "ok").length.toLocaleString("en-US")}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Tổng dung lượng</span>
              <span className="font-medium">{formatBytes(overview.total_bytes)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Số bảng được sao lưu</span>
              <span className="font-medium">{overview.tables.length}</span>
            </div>
            {canCreate ? (
              <div className="flex flex-col gap-2 pt-2">
                <Button onClick={() => runNow(false)} disabled={running}>
                  <DatabaseBackup className="size-4" /> {running ? "Đang sao lưu…" : "Sao lưu ngay"}
                </Button>
                <Button variant="outline" onClick={() => runNow(true)} disabled={running || !emails.length}>
                  <Mail className="size-4" /> Sao lưu và gửi email ngay
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ReportGrid
        tableKey="data_backups"
        rows={rows}
        columns={columns}
        view={view}
        getRowId={(r) => r.id}
        searchPlaceholder="Tìm theo thời gian, người, email, lỗi…"
        emptyText="Chưa có bản sao lưu nào. Bấm Sao lưu ngay để tạo bản đầu tiên."
      />
    </div>
  );
}
