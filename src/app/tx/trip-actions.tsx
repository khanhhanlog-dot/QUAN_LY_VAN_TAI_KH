"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flag, Play } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { uploadWithTicket } from "@/lib/driver-link/upload";
import { acceptTrip, changeVehicle, completeTrip, requestUploadTicket, startTrip } from "./actions";
import { PhotoPicker, type PickedFile } from "./photo-picker";
import { ExpenseLinesEditor, lineError, newLine, submitLines, type ExpenseCategory, type ExpenseLine } from "./expense-forms";

export function AcceptButton({ shipmentId, code }: { shipmentId: string; code: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        aria-label={`Nhận đơn ${code}`}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await acceptTrip(shipmentId);
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-success text-lg font-semibold text-white disabled:opacity-60"
      >
        <CheckCircle2 className="size-6" /> {pending ? "Đang gửi…" : "Nhận đơn"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ChangeVehicleButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await changeVehicle();
          router.refresh();
        })
      }
      className="rounded-lg border px-3 py-1.5 text-sm"
    >
      Đổi xe
    </button>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

export function StartButton({ shipmentId, code }: { shipmentId: string; code: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        aria-label={`Bắt đầu chạy ${code}`}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await startTrip(shipmentId);
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-60"
      >
        <Play className="size-6" /> {pending ? "Đang gửi…" : "Bắt đầu chạy"}
      </button>
      <ErrorText error={error} />
    </div>
  );
}

const RESULTS = [
  { value: "full", label: "Giao đủ" },
  { value: "partial", label: "Giao thiếu" },
  { value: "failed", label: "Không giao được" },
] as const;

export function CompleteButton({ shipmentId, code, categories, outsourced = false }: { shipmentId: string; code: string; categories: ExpenseCategory[]; outsourced?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [result, setResult] = useState<(typeof RESULTS)[number]["value"]>("full");
  const [note, setNote] = useState("");
  const [expenseMode, setExpenseMode] = useState<"has" | "none" | null>(null);
  const [lines, setLines] = useState<ExpenseLine[]>(() => [newLine()]);
  // Chuyến đã lưu hoàn thành nhưng còn khoản chi phí chưa gửi được: bấm lại chỉ gửi chi phí
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      setError(null);
      if (!completed) {
        if (!files.length) return setError("Chụp ít nhất 1 ảnh hàng đã giao hoặc phiếu ký nhận.");
        if (result !== "full" && !note.trim()) return setError("Ghi lý do giao thiếu / không giao được.");
      }
      if (!expenseMode && !outsourced) return setError('Chọn "Có chi phí" và nhập chi phí, hoặc chọn "Không phát sinh chi phí".');
      if (expenseMode === "has") {
        const bad = lines.map((l, i) => lineError(l, categories, lines.length > 1 ? i + 1 : null)).find(Boolean);
        if (bad) return setError(bad);
      }
      if (!completed) {
        const t = await requestUploadTicket(shipmentId, "delivery");
        if (!t.ok) return setError(t.error);
        try {
          setProgress(`Đang gửi ảnh 0/${files.length}…`);
          await uploadWithTicket(t.ticket, files.map((f) => ({ file: f.file, kind: f.kind })), (n) => setProgress(`Đang gửi ảnh ${n}/${files.length}…`));
        } catch (e) {
          setProgress(null);
          return setError((e as Error).message);
        }
        setProgress("Đang lưu…");
        const r = await completeTrip({ shipmentId, ticket: t.ticket, result, note: note.trim() || undefined, noExpense: outsourced || expenseMode === "none" });
        if (!r.ok) {
          setProgress(null);
          return setError(r.error);
        }
        setCompleted(true);
      }
      if (expenseMode === "has") {
        const r = await submitLines(shipmentId, lines, setProgress);
        if (r.failed.length) {
          setProgress(null);
          setLines(r.failed);
          return setError(`Chuyến đã hoàn thành. ${r.error} Các khoản còn lại trên màn hình chưa lưu, bấm gửi lại.`);
        }
      }
      setProgress(null);
      setOpen(false);
      setFiles([]);
      router.refresh();
    });
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        aria-label={`Hoàn thành chuyến ${code}`}
        onClick={() => setOpen(true)}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-success text-lg font-semibold text-white"
      >
        <Flag className="size-6" /> Hoàn thành chuyến
      </button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (pending) return;
          setOpen(o);
          if (!o && completed) router.refresh();
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Hoàn thành chuyến {code}</DialogTitle>
            <DialogDescription>Chụp ảnh hàng đã giao và phiếu giao hàng có chữ ký người nhận. Bắt buộc ít nhất 1 ảnh.</DialogDescription>
          </DialogHeader>
          {completed ? (
            <p className="rounded-lg bg-success/10 p-3 text-sm">Đã lưu hoàn thành chuyến. Gửi nốt các khoản chi phí bên dưới.</p>
          ) : (
            <>
              <PhotoPicker
                value={files}
                onChange={setFiles}
                kinds={[
                  { value: "photo", label: "Ảnh hàng" },
                  { value: "delivery_note", label: "Phiếu ký nhận" },
                ]}
              />
              <div>
                <div className="mb-1 text-sm font-medium">Kết quả giao hàng</div>
                <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Kết quả giao hàng">
                  {RESULTS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      role="radio"
                      aria-checked={result === r.value}
                      onClick={() => setResult(r.value)}
                      className={`rounded-lg px-1 py-2 text-sm font-medium ${result === r.value ? "bg-card shadow-xs" : "text-muted-foreground"}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="complete-note" className="mb-1 block text-sm font-medium">
                  Ghi chú {result !== "full" ? "(bắt buộc)" : "(không bắt buộc)"}
                </label>
                <Textarea id="complete-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ví dụ: Thiếu 2 kiện, khách hẹn giao bù ngày mai" />
              </div>
            </>
          )}
          <div hidden={completed || outsourced}>
            <div className="mb-1 text-sm font-medium">Chi phí chuyến (bắt buộc chọn)</div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1" role="radiogroup" aria-label="Chi phí chuyến">
              {(
                [
                  ["has", "Có chi phí"],
                  ["none", "Không phát sinh chi phí"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={expenseMode === v}
                  onClick={() => setExpenseMode(v)}
                  className={`rounded-lg px-1 py-2 text-sm font-medium ${expenseMode === v ? "bg-card shadow-xs" : "text-muted-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Chi phí tài xế tự trả (dầu, cầu đường, bốc xếp…). Nhập sót thì bấm &quot;Bổ sung chi phí&quot; trên thẻ chuyến trước khi văn phòng đóng chuyến.
            </p>
          </div>
          {expenseMode === "has" && !outsourced ? <ExpenseLinesEditor lines={lines} onChange={setLines} categories={categories} /> : null}
          <ErrorText error={error} />
          <button
            type="button"
            disabled={pending}
            onClick={submit}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-success text-lg font-semibold text-white disabled:opacity-60"
          >
            <CheckCircle2 className="size-6" /> {progress ?? (pending ? "Đang gửi…" : "Gửi và hoàn thành")}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
