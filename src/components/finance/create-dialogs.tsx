"use client";
import { useMemo, useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReferenceSelect } from "@/components/entities/reference-select";
import { CustomFieldsEditor } from "@/components/entities/custom-fields-editor";
import { AddFieldButton } from "@/components/entities/add-field-button";
import { moduleCustomFields } from "@/lib/entities/record";
import type { CustomFieldRow } from "@/lib/entities/types";
import { createAdvance, createExpense } from "@/lib/finance/actions";
import { uploadStaffDocuments } from "./upload";

export type CreateActionProps = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customRows: CustomFieldRow[];
  canAddField: boolean;
  onDone: () => void;
  /** Điền sẵn chuyến (khi mở từ trang chi tiết chuyến) */
  shipment?: { id: string; label: string; driverId?: string | null; driverLabel?: string | null };
  /** Giá trị điền sẵn từ tham số đường dẫn (?new=1&customer=…&shipment=…) */
  prefill?: Record<string, string>;
};

export function MoneyField({ id, value, onChange }: { id: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      placeholder="Ví dụ 2.000.000"
      className="tabular-nums"
      value={value ? value.toLocaleString("vi-VN") : ""}
      onChange={(e) => {
        const n = Number(e.target.value.replace(/\D/g, "").slice(0, 13));
        onChange(n > 0 ? n : null);
      }}
    />
  );
}

export function Field({ label, htmlFor, help, children, wide }: { label: string; htmlFor: string; help?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {help ? <p className="text-xs text-muted-foreground">{help}</p> : null}
    </div>
  );
}

export function CreateAdvanceDialog({ open, onOpenChange, customRows, canAddField, onDone }: CreateActionProps) {
  const fields = useMemo(() => moduleCustomFields("advances", customRows), [customRows]);
  const [driver, setDriver] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const rid = useRef(crypto.randomUUID());
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tạo yêu cầu ứng tiền</DialogTitle>
          <DialogDescription>Ứng tiền thay cho tài xế. Yêu cầu chuyển Giám đốc duyệt, sau đó kế toán ghi nhận chuyển tiền.</DialogDescription>
        </DialogHeader>
        {canAddField ? (
          <div>
            <AddFieldButton module="advances" entityKey="advances" customRows={customRows} label="Thêm trường cho biểu mẫu này" />
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tài xế *" htmlFor="adv-driver">
            <ReferenceSelect id="adv-driver" refKey="drivers" value={driver} onChange={(v) => setDriver(v)} />
          </Field>
          <Field label="Số tiền *" htmlFor="adv-amount">
            <MoneyField id="adv-amount" value={amount} onChange={setAmount} />
          </Field>
          <Field label="Lý do *" htmlFor="adv-reason" wide help="Ví dụ: Ứng dầu và cầu đường cho tuần 43">
            <Input id="adv-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
          <Field label="Ghi chú" htmlFor="adv-note" wide>
            <Textarea id="adv-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Field>
        </div>
        <CustomFieldsEditor fields={fields} idPrefix="adv-cf-" onChange={setCustom} className="lg:grid-cols-2" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Đóng
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (!driver) return void toast.error("Chọn tài xế");
                if (!amount) return void toast.error("Nhập số tiền");
                const r = await createAdvance({ driverId: driver, amount, reason, note: note.trim() || undefined, custom, clientRequestId: rid.current });
                if (!r.ok) return void toast.error(r.error);
                toast.success(r.message);
                onDone();
              })
            }
          >
            {pending ? "Đang gửi…" : "Gửi duyệt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateExpenseDialog({ open, onOpenChange, customRows, canAddField, onDone, shipment }: CreateActionProps) {
  const fields = useMemo(() => moduleCustomFields("expenses", customRows), [customRows]);
  const [ship, setShip] = useState(shipment?.id ?? "");
  const [cat, setCat] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState("");
  const [paidBy, setPaidBy] = useState<"driver" | "company">("company");
  const [driver, setDriver] = useState(shipment?.driverId ?? "");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const rid = useRef(crypto.randomUUID());
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nhập chi phí chuyến</DialogTitle>
          <DialogDescription>Loại chi phí cần duyệt sẽ chuyển Giám đốc; loại đã tắt duyệt được ghi nhận ngay.</DialogDescription>
        </DialogHeader>
        {canAddField ? (
          <div>
            <AddFieldButton module="expenses" entityKey="expenses" customRows={customRows} label="Thêm trường cho biểu mẫu này" />
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Chuyến *" htmlFor="exp-ship" help="Gõ mã chuyến, khách hàng hoặc biển số để tìm">
            <ReferenceSelect id="exp-ship" refKey="shipment_ref" value={ship} initialLabel={shipment?.label} allowQuickCreate={false} onChange={(v) => setShip(v)} />
          </Field>
          <Field label="Loại chi phí *" htmlFor="exp-cat" help="Chưa có loại phù hợp thì gõ tên rồi bấm Thêm mới">
            <ReferenceSelect id="exp-cat" refKey="expense_categories" value={cat} onChange={(v) => setCat(v)} />
          </Field>
          <Field label="Số tiền *" htmlFor="exp-amount">
            <MoneyField id="exp-amount" value={amount} onChange={setAmount} />
          </Field>
          <Field label="Ngày phát sinh" htmlFor="exp-date" help="Để trống là hôm nay">
            <Input id="exp-date" type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Người trả tiền" htmlFor="exp-paidby" help="Tài xế tự trả: được cộng lại cho tài xế khi đối soát lương cuối tháng">
            <NativeSelect id="exp-paidby" value={paidBy} onChange={(e) => setPaidBy(e.target.value as "driver" | "company")}>
              <option value="company">Công ty trả</option>
              <option value="driver">Tài xế tự trả</option>
            </NativeSelect>
          </Field>
          <Field label="Tài xế" htmlFor="exp-driver" help="Để trống là tài xế của chuyến">
            <ReferenceSelect id="exp-driver" refKey="drivers" value={driver} initialLabel={shipment?.driverLabel ?? undefined} onChange={(v) => setDriver(v)} />
          </Field>
          <Field label="Ghi chú" htmlFor="exp-note" wide>
            <Textarea id="exp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Ví dụ: BOT Bình Dương lượt đi" />
          </Field>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Hóa đơn / biên lai</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <Upload /> Chọn tệp
              </Button>
              <span className="text-xs text-muted-foreground">{files.length ? files.map((f) => f.name).join(", ") : "Ảnh hoặc PDF, tối đa 10 tệp, 10 MB mỗi tệp"}</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/*,application/pdf"
              className="hidden"
              aria-label="Chọn hóa đơn, biên lai"
              onChange={(e) => {
                setFiles(Array.from(e.target.files ?? []).filter((f) => f.size <= 10 * 1024 * 1024).slice(0, 10));
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <CustomFieldsEditor fields={fields} idPrefix="exp-cf-" onChange={setCustom} className="lg:grid-cols-2" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Đóng
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (!ship) return void toast.error("Chọn chuyến");
                if (!cat) return void toast.error("Chọn loại chi phí");
                if (!amount) return void toast.error("Nhập số tiền");
                const r = await createExpense({
                  shipmentId: ship,
                  categoryId: cat,
                  amount,
                  incurredAt: date || undefined,
                  paidBy,
                  driverId: driver || undefined,
                  note: note.trim() || undefined,
                  custom,
                  clientRequestId: rid.current,
                });
                if (!r.ok) return void toast.error(r.error);
                if (files.length && r.data) {
                  const u = await uploadStaffDocuments("shipment_expense", r.data, files.map((file) => ({ file, docType: "receipt" as const })));
                  if (!u.ok) toast.error(`Đã lưu chi phí nhưng ${u.error.toLowerCase()}`);
                }
                toast.success(r.message);
                onDone();
              })
            }
          >
            {pending ? "Đang lưu…" : "Lưu chi phí"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
