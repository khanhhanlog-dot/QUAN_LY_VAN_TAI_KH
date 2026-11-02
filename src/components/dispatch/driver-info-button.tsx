"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, IdCard, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { fillDriverShareInfo, loadDriverShareInfo, type DriverShareRow } from "@/app/(app)/dieu-phoi/driver-info-actions";

/** Văn bản gửi khách đăng ký xe: đúng mẫu Tên / Số xe / Số CCCD / Số GPLX */
export function driverShareText(rows: DriverShareRow[]): string {
  return rows
    .filter((r) => r.driver_name)
    .map((r) => [`Tên: ${r.driver_name ?? ""}`, `Số xe: ${r.plate_number ?? ""}`, `Số CCCD: ${r.national_id ?? ""}`, `Số GPLX: ${r.license_no ?? ""}`].join("\n"))
    .join("\n\n");
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Trình duyệt chặn clipboard (http, iframe): chép kiểu cũ
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

/**
 * Nút "Thông tin tài xế": mở hộp có sẵn văn bản (tên, biển số, CCCD, GPLX) để chép gửi khách hàng đăng ký.
 * Một chuyến hoặc nhiều chuyến (chép một lần cho cả danh sách).
 */
export function DriverInfoButton({
  shipmentIds,
  label = "Thông tin tài xế",
  compact,
  canFill,
  variant = "ghost",
}: {
  shipmentIds: string[];
  label?: string;
  compact?: boolean;
  canFill?: boolean;
  variant?: "ghost" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DriverShareRow[] | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, startLoad] = useTransition();

  const load = () =>
    startLoad(async () => {
      setError(null);
      const r = await loadDriverShareInfo(shipmentIds);
      if (!r.ok) {
        setRows([]);
        setText("");
        return void setError(r.error);
      }
      const data = r.data ?? [];
      setRows(data);
      setText(driverShareText(data));
    });

  const onOpen = () => {
    setOpen(true);
    setCopied(false);
    setRows(null);
    load();
  };

  const withDriver = (rows ?? []).filter((r) => r.driver_name);
  const noDriver = (rows ?? []).filter((r) => !r.driver_name);
  // Một tài xế có thể chạy nhiều chuyến: chỉ hỏi điền giấy tờ một lần
  const missing = [...new Map(withDriver.filter((r) => !r.national_id || !r.license_no).map((r) => [r.driver_id, r])).values()];

  return (
    <>
      <Button
        variant={variant}
        size="sm"
        className={compact ? "h-7 px-2" : undefined}
        onClick={onOpen}
        disabled={shipmentIds.length === 0}
        aria-label={label}
        title="Chép tên tài xế, biển số, số CCCD, số GPLX để gửi khách hàng đăng ký xe"
      >
        <IdCard />
        {compact ? null : ` ${label}`}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Thông tin tài xế gửi khách hàng</DialogTitle>
            <DialogDescription>
              Bấm Sao chép rồi dán vào Zalo / email gửi khách đăng ký xe. Có thể sửa trực tiếp trong ô trước khi chép.
            </DialogDescription>
          </DialogHeader>
          {loading && rows === null ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Đang tải…
            </p>
          ) : error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          ) : (
            <div className="space-y-3">
              {withDriver.length > 0 ? (
                <Textarea
                  aria-label="Văn bản gửi khách"
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setCopied(false);
                  }}
                  rows={Math.min(16, Math.max(5, text.split("\n").length + 1))}
                  className="font-mono text-sm"
                />
              ) : (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">Chuyến chưa được phân công tài xế.</p>
              )}
              {noDriver.length > 0 && withDriver.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Bỏ qua {noDriver.length} chuyến chưa có tài xế: {noDriver.map((r) => r.shipment_code).join(", ")}.
                </p>
              ) : null}
              {missing.map((r) => (
                <MissingDocs
                  key={r.driver_id}
                  row={r}
                  canFill={Boolean(canFill)}
                  onSaved={() => {
                    setCopied(false);
                    load();
                  }}
                />
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Đóng
            </Button>
            <Button
              disabled={!text.trim() || loading}
              onClick={async () => {
                if (await copyText(text)) {
                  setCopied(true);
                  toast.success("Đã sao chép thông tin tài xế");
                } else toast.error("Trình duyệt không cho sao chép. Hãy bôi đen văn bản rồi nhấn Ctrl+C.");
              }}
            >
              {copied ? <Check /> : <Copy />} {copied ? "Đã sao chép" : "Sao chép"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MissingDocs({ row, canFill, onSaved }: { row: DriverShareRow; canFill: boolean; onSaved: () => void }) {
  const [nid, setNid] = useState("");
  const [lic, setLic] = useState("");
  const [pending, start] = useTransition();
  const lacks = [!row.national_id ? "số CCCD" : null, !row.license_no ? "số GPLX" : null].filter(Boolean).join(" và ");
  return (
    <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
      <p>
        Tài xế <b>{row.driver_name}</b> chưa có {lacks}.{" "}
        {row.driver_id ? (
          <Link href={`/tai-xe/${row.driver_id}`} className="text-primary hover:underline" target="_blank">
            Mở hồ sơ tài xế
          </Link>
        ) : null}
      </p>
      {canFill && row.driver_id ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          {!row.national_id ? (
            <div className="min-w-36 flex-1 space-y-1">
              <Label htmlFor={`nid-${row.driver_id}`}>Số CCCD</Label>
              <Input id={`nid-${row.driver_id}`} value={nid} onChange={(e) => setNid(e.target.value.replace(/\s/g, ""))} inputMode="numeric" maxLength={20} placeholder="Ví dụ: 084091007921" />
            </div>
          ) : null}
          {!row.license_no ? (
            <div className="min-w-36 flex-1 space-y-1">
              <Label htmlFor={`lic-${row.driver_id}`}>Số GPLX</Label>
              <Input id={`lic-${row.driver_id}`} value={lic} onChange={(e) => setLic(e.target.value.replace(/\s/g, ""))} maxLength={30} placeholder="Ví dụ: 790168005497" />
            </div>
          ) : null}
          <Button
            size="sm"
            disabled={pending || (!nid && !lic)}
            onClick={() =>
              start(async () => {
                const r = await fillDriverShareInfo({ driverId: row.driver_id!, nationalId: nid, licenseNo: lic });
                if (!r.ok) return void toast.error(r.error);
                toast.success(r.message);
                onSaved();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Lưu vào hồ sơ
          </Button>
        </div>
      ) : null}
    </div>
  );
}
