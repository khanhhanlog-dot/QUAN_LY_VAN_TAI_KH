"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addFieldOption, renameFieldOption } from "@/lib/entities/option-actions";
import type { FieldDef, Option } from "@/lib/entities/types";

type Ctx = {
  canAdd: boolean;
  /** Lựa chọn vừa thêm trong phiên làm việc, theo id trường (mọi ô của cùng trường thấy ngay) */
  extras: Record<string, Option[]>;
  push: (fieldId: string, o: Option) => void;
  /** Tên mới của lựa chọn vừa sửa trong phiên làm việc, theo id trường → mã lựa chọn */
  renamed: Record<string, Record<string, string>>;
  rename: (fieldId: string, value: string, label: string) => void;
};

const OptionCtx = createContext<Ctx>({ canAdd: false, extras: {}, push: () => {}, renamed: {}, rename: () => {} });

export function OptionAddProvider({ canAdd, children }: { canAdd: boolean; children: ReactNode }) {
  const [extras, setExtras] = useState<Record<string, Option[]>>({});
  const push = useCallback((fieldId: string, o: Option) => {
    setExtras((m) => ((m[fieldId] ?? []).some((x) => x.value === o.value) ? m : { ...m, [fieldId]: [...(m[fieldId] ?? []), o] }));
  }, []);
  const [renamed, setRenamed] = useState<Record<string, Record<string, string>>>({});
  const rename = useCallback((fieldId: string, v: string, label: string) => {
    setRenamed((m) => ({ ...m, [fieldId]: { ...(m[fieldId] ?? {}), [v]: label } }));
  }, []);
  const value = useMemo(() => ({ canAdd, extras, push, renamed, rename }), [canAdd, extras, push, renamed, rename]);
  return <OptionCtx.Provider value={value}>{children}</OptionCtx.Provider>;
}

/** Lựa chọn của trường (gồm cả lựa chọn vừa thêm / vừa sửa tên) và có hiện nút +, bút chì hay không */
export function useFieldOptions(field: FieldDef): { options: Option[]; canAdd: boolean } {
  const { canAdd, extras, renamed } = useContext(OptionCtx);
  const base = field.options ?? [];
  const more = field.fieldId ? (extras[field.fieldId] ?? []).filter((o) => !base.some((b) => b.value === o.value)) : [];
  const names = field.fieldId ? renamed[field.fieldId] : undefined;
  const all = more.length ? [...base, ...more] : base;
  return {
    options: names ? all.map((o) => (names[o.value] ? { ...o, label: names[o.value] } : o)) : all,
    canAdd: canAdd && Boolean(field.fieldId) && (field.type === "select" || field.type === "multiselect") && !field.readOnly,
  };
}

/** Nút + cạnh ô chọn: gõ tên lựa chọn mới → lưu vào trường → chọn luôn */
export function AddOptionButton({ field, onAdded, disabled, className }: { field: FieldDef; onAdded: (o: Option) => void; disabled?: boolean; className?: string }) {
  const { push } = useContext(OptionCtx);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = name.trim();
    if (!n || !field.fieldId) return;
    setBusy(true);
    const res = await addFieldOption(field.fieldId, n);
    setBusy(false);
    if (!res.ok || !res.data) {
      toast.error(res.ok ? "Không thêm được lựa chọn" : res.error);
      return;
    }
    const o = { value: res.data.value, label: res.data.label };
    push(field.fieldId, o);
    onAdded(o);
    toast.success(res.data.existed ? `“${o.label}” đã có sẵn, đã chọn.` : `Đã thêm lựa chọn “${o.label}”.`);
    setName("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={className ?? "size-9 shrink-0"}
          disabled={disabled}
          title={`Thêm lựa chọn mới cho “${field.label}”`}
          aria-label={`Thêm lựa chọn mới cho ${field.label}`}
        >
          <Plus className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2" onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="text-xs font-medium">Thêm lựa chọn cho “{field.label}”</p>
        <Input
          autoFocus
          value={name}
          maxLength={200}
          placeholder="Ví dụ: Nội địa"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              void save();
            }
          }}
        />
        <p className="text-xs text-muted-foreground">Lưu vào danh sách chọn của trường, mọi người dùng thấy ngay. Sửa tên: bấm bút chì cạnh lựa chọn trong ô chọn.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button type="button" size="sm" disabled={busy || !name.trim()} onClick={() => void save()}>
            {busy ? "Đang lưu…" : "Thêm và chọn"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Bút chì cạnh từng lựa chọn: trả về hàm mở hộp sửa tên (để gắn vào ô chọn) và hộp sửa cần đặt cạnh ô chọn.
 * Chỉ sửa TÊN hiển thị; mã lựa chọn đã lưu trong đơn/chuyến giữ nguyên nên dữ liệu cũ tự hiện tên mới.
 */
export function useOptionEditor(field: FieldDef, enabled: boolean) {
  const [editing, setEditing] = useState<Option | null>(null);
  const onEditOption = enabled && field.fieldId ? (o: Option) => setEditing(o) : undefined;
  const dialog = editing ? <EditOptionDialog field={field} option={editing} onClose={() => setEditing(null)} /> : null;
  return { onEditOption, dialog };
}

function EditOptionDialog({ field, option, onClose }: { field: FieldDef; option: Option; onClose: () => void }) {
  const { rename } = useContext(OptionCtx);
  const router = useRouter();
  const [name, setName] = useState(option.label);
  const [busy, setBusy] = useState(false);

  async function save() {
    const n = name.trim();
    if (!n || !field.fieldId) return;
    if (n === option.label) return onClose();
    setBusy(true);
    const res = await renameFieldOption(field.fieldId, option.value, n);
    setBusy(false);
    if (!res.ok || !res.data) {
      toast.error(res.ok ? "Không sửa được lựa chọn" : res.error);
      return;
    }
    rename(field.fieldId, option.value, res.data.label);
    toast.success(`Đã đổi “${option.label}” thành “${res.data.label}”.`);
    onClose();
    // Bảng, thẻ chi tiết đang hiện tên cũ: tải lại dữ liệu trang để hiện tên mới
    router.refresh();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa lựa chọn của “{field.label}”</DialogTitle>
          <DialogDescription>
            Đổi tên hiển thị. Các đơn, chuyến đã chọn “{option.label}” sẽ tự hiện tên mới. Xóa hoặc sắp xếp lựa chọn ở Quản lý trường dữ liệu.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          maxLength={200}
          aria-label="Tên lựa chọn"
          placeholder="Ví dụ: TÂN CẢNG MỸ THỦY 2 DEPOT"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              void save();
            }
          }}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Hủy
          </Button>
          <Button type="button" disabled={busy || !name.trim()} onClick={() => void save()}>
            {busy ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
