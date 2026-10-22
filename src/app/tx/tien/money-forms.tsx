"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Receipt } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { uploadWithTicket } from "@/lib/driver-link/upload";
import { addExpense, cancelRequest, requestAdvance, requestUploadTicket } from "../actions";
import { PhotoPicker, type PickedFile } from "../photo-picker";

type Trip = { id: string; label: string };
type Category = { id: string; name: string; group: string; requires_image: boolean; requires_approval: boolean };

/** Ô tiền: chỉ nhận số, hiện dấu chấm phân cách hàng nghìn */
function MoneyInput({ id, value, onChange }: { id: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="relative">
      <Input
        id={id}
        inputMode="numeric"
        className="h-14 pr-10 text-xl font-semibold tabular-nums"
        placeholder="Ví dụ 2.000.000"
        value={value ? value.toLocaleString("vi-VN") : ""}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, "").slice(0, 10));
          onChange(n > 0 ? n : null);
        }}
      />
      <span className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">đ</span>
    </div>
  );
}

function Err({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
      {error}
    </p>
  ) : null;
}

const bigBtn = "flex h-14 w-full items-center justify-center gap-2 rounded-xl text-lg font-semibold disabled:opacity-60";

export function AdvanceButton({ trips }: { trips: Trip[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [trip, setTrip] = useState("");
  const [rid, setRid] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setDone(null); }} className={`${bigBtn} bg-primary text-primary-foreground`}>
        <HandCoins className="size-6" /> Xin ứng tiền
      </button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Xin ứng tiền</DialogTitle>
            <DialogDescription>Giám đốc duyệt, sau đó kế toán chuyển tiền. Cuối tháng tiền ứng được đối soát với chi phí và lương.</DialogDescription>
          </DialogHeader>
          {done ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-success/10 p-3 text-sm">{done}</p>
              <button type="button" className={`${bigBtn} border bg-card`} onClick={() => setOpen(false)}>Xong</button>
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="adv-amount" className="mb-1 block text-sm font-medium">Số tiền cần ứng</label>
                <MoneyInput id="adv-amount" value={amount} onChange={setAmount} />
              </div>
              <div>
                <label htmlFor="adv-reason" className="mb-1 block text-sm font-medium">Lý do</label>
                <Textarea id="adv-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ví dụ: Ứng tiền dầu, cầu đường chuyến đi Bình Dương" />
              </div>
              <div>
                <label htmlFor="adv-trip" className="mb-1 block text-sm font-medium">Cho chuyến (không bắt buộc)</label>
                <NativeSelect id="adv-trip" value={trip} onChange={(e) => setTrip(e.target.value)} className="h-12">
                  <option value="">Không gắn chuyến</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </NativeSelect>
              </div>
              <Err error={error} />
              <button
                type="button"
                disabled={pending}
                className={`${bigBtn} bg-primary text-primary-foreground`}
                onClick={() =>
                  start(async () => {
                    setError(null);
                    if (!amount) return setError("Nhập số tiền cần ứng.");
                    if (!reason.trim()) return setError("Nhập lý do ứng tiền.");
                    const r = await requestAdvance({ amount, reason, shipmentId: trip || null, clientRequestId: rid });
                    if (!r.ok) return setError(r.error);
                    setDone("Đã gửi yêu cầu ứng tiền. Giám đốc sẽ duyệt, kế toán chuyển tiền sau khi duyệt.");
                    setAmount(null);
                    setReason("");
                    setTrip("");
                    setRid(crypto.randomUUID());
                    router.refresh();
                  })
                }
              >
                {pending ? "Đang gửi…" : "Gửi yêu cầu"}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ExpenseButton({ trips, categories }: { trips: Trip[]; categories: Category[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [trip, setTrip] = useState("");
  const [cat, setCat] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [rid, setRid] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const c = categories.find((x) => x.id === cat);
  const groups = [...new Set(categories.map((x) => x.group))];

  function submit() {
    start(async () => {
      setError(null);
      if (!trip) return setError("Chọn chuyến.");
      if (!c) return setError("Chọn loại chi phí.");
      if (!amount) return setError("Nhập số tiền.");
      if (c.requires_image && !files.length) return setError(`Loại "${c.name}" cần chụp hóa đơn / biên lai.`);
      let ticket: string | null = null;
      if (files.length) {
        const t = await requestUploadTicket(trip, "expense");
        if (!t.ok) return setError(t.error);
        ticket = t.ticket;
        try {
          setProgress(`Đang gửi ảnh 0/${files.length}…`);
          await uploadWithTicket(ticket, files.map((f) => ({ file: f.file, kind: f.kind })), (n) => setProgress(`Đang gửi ảnh ${n}/${files.length}…`));
        } catch (e) {
          setProgress(null);
          return setError((e as Error).message);
        }
      }
      setProgress("Đang lưu…");
      const r = await addExpense({ shipmentId: trip, categoryId: c.id, amount, note: note.trim() || undefined, ticket, clientRequestId: rid });
      setProgress(null);
      if (!r.ok) return setError(r.error);
      setDone(r.needsApproval ? "Đã gửi chi phí, đang chờ Giám đốc duyệt." : "Đã lưu chi phí (loại này không cần duyệt).");
      setAmount(null);
      setNote("");
      setFiles([]);
      setRid(crypto.randomUUID());
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setDone(null); }} className={`${bigBtn} border bg-card`}>
        <Receipt className="size-6" /> Nhập chi phí
      </button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nhập chi phí chuyến</DialogTitle>
            <DialogDescription>Chi phí tài xế tự trả (dầu, cầu đường, bốc xếp…). Khoản được duyệt sẽ cộng lại khi đối soát lương cuối tháng.</DialogDescription>
          </DialogHeader>
          {done ? (
            <div className="space-y-3">
              <p className="rounded-lg bg-success/10 p-3 text-sm">{done}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={`${bigBtn} border bg-card`} onClick={() => setDone(null)}>Nhập khoản khác</button>
                <button type="button" className={`${bigBtn} border bg-card`} onClick={() => setOpen(false)}>Xong</button>
              </div>
            </div>
          ) : trips.length === 0 ? (
            <p className="rounded-lg bg-muted p-3 text-sm">Chưa có chuyến đã nhận để nhập chi phí.</p>
          ) : (
            <>
              <div>
                <label htmlFor="exp-trip" className="mb-1 block text-sm font-medium">Chuyến</label>
                <NativeSelect id="exp-trip" value={trip} onChange={(e) => setTrip(e.target.value)} className="h-12">
                  <option value="">Chọn chuyến…</option>
                  {trips.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <label htmlFor="exp-cat" className="mb-1 block text-sm font-medium">Loại chi phí</label>
                <NativeSelect id="exp-cat" value={cat} onChange={(e) => setCat(e.target.value)} className="h-12">
                  <option value="">Chọn loại…</option>
                  {groups.map((g) => (
                    <optgroup key={g} label={g}>
                      {categories.filter((x) => x.group === g).map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </optgroup>
                  ))}
                </NativeSelect>
                {c ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.requires_image ? "Bắt buộc chụp hóa đơn / biên lai. " : ""}
                    {c.requires_approval ? "Cần Giám đốc duyệt." : "Không cần duyệt."}
                  </p>
                ) : null}
              </div>
              <div>
                <label htmlFor="exp-amount" className="mb-1 block text-sm font-medium">Số tiền</label>
                <MoneyInput id="exp-amount" value={amount} onChange={setAmount} />
              </div>
              <div>
                <label htmlFor="exp-note" className="mb-1 block text-sm font-medium">Ghi chú (không bắt buộc)</label>
                <Textarea id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Ví dụ: BOT Bình Dương lượt đi" />
              </div>
              <PhotoPicker
                value={files}
                onChange={setFiles}
                label="Chụp hóa đơn"
                kinds={[
                  { value: "receipt", label: "Biên lai" },
                  { value: "invoice", label: "Hóa đơn VAT" },
                ]}
              />
              <Err error={error} />
              <button type="button" disabled={pending} onClick={submit} className={`${bigBtn} bg-primary text-primary-foreground`}>
                {progress ?? (pending ? "Đang gửi…" : "Gửi chi phí")}
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CancelRequestButton({ kind, id }: { kind: "advance" | "expense"; id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={pending}
        className="rounded-lg border px-3 py-1.5 text-sm text-destructive"
        onClick={() => {
          if (!confirm("Hủy yêu cầu này?")) return;
          start(async () => {
            const r = await cancelRequest(kind, id);
            if (!r.ok) setError(r.error);
            router.refresh();
          });
        }}
      >
        {pending ? "Đang hủy…" : "Hủy yêu cầu"}
      </button>
      {error ? <p className="mt-1 text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
