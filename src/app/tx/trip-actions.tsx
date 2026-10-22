"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Flag, Play } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { uploadWithTicket } from "@/lib/driver-link/upload";
import { acceptTrip, changeVehicle, completeTrip, requestUploadTicket, startTrip } from "./actions";
import { PhotoPicker, type PickedFile } from "./photo-picker";

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

export function CompleteButton({ shipmentId, code }: { shipmentId: string; code: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [result, setResult] = useState<(typeof RESULTS)[number]["value"]>("full");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      setError(null);
      if (!files.length) {
        setError("Chụp ít nhất 1 ảnh hàng đã giao hoặc phiếu ký nhận.");
        return;
      }
      if (result !== "full" && !note.trim()) {
        setError("Ghi lý do giao thiếu / không giao được.");
        return;
      }
      const t = await requestUploadTicket(shipmentId, "delivery");
      if (!t.ok) {
        setError(t.error);
        return;
      }
      try {
        setProgress(`Đang gửi ảnh 0/${files.length}…`);
        await uploadWithTicket(t.ticket, files.map((f) => ({ file: f.file, kind: f.kind })), (n) => setProgress(`Đang gửi ảnh ${n}/${files.length}…`));
      } catch (e) {
        setProgress(null);
        setError((e as Error).message);
        return;
      }
      setProgress("Đang lưu…");
      const r = await completeTrip({ shipmentId, ticket: t.ticket, result, note: note.trim() || undefined });
      setProgress(null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
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
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Hoàn thành chuyến {code}</DialogTitle>
            <DialogDescription>Chụp ảnh hàng đã giao và phiếu giao hàng có chữ ký người nhận. Bắt buộc ít nhất 1 ảnh.</DialogDescription>
          </DialogHeader>
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
