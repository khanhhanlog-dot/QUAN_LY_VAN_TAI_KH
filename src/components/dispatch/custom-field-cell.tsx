"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { CustomFieldsEditor } from "@/components/entities/custom-fields-editor";
import { setTripCustomValue } from "@/app/(app)/dieu-phoi/inline-actions";
import { compactUpper } from "@/lib/entities/record";
import { formatNumber } from "@/lib/format";
import type { FieldDef } from "@/lib/entities/types";
import { cn } from "@/lib/utils";

/** Kiểu trường gõ thẳng trong ô; kiểu khác (lựa chọn, danh mục, ngày…) mở khung nhỏ ngay dưới ô */
const TYPED = ["text", "textarea", "number", "currency", "percent", "phone", "email", "url"];
const NUMERIC = ["number", "currency", "percent"];

/** Trường bổ sung sửa được trên bảng không */
export function canInlineEdit(def: FieldDef | undefined) {
  return Boolean(def && !def.readOnly && def.type !== "formula" && def.type !== "file");
}

/**
 * Ô trường bổ sung (Số cont, Số seal, Loại hình vận chuyển…) trên bảng Điều phối / Quản lý chuyến: bấm vào là nhập ngay.
 * Trường chữ / số gõ thẳng trong ô (Enter hoặc rời ô để lưu, Esc để thôi); lựa chọn, danh mục, ngày mở khung nhỏ có tìm kiếm và nút "+".
 */
export function CustomFieldCell({
  def,
  source,
  targetId,
  raw,
  text,
  editable,
  align,
  label,
}: {
  def: FieldDef;
  source: "shipment" | "order";
  /** Id chuyến hoặc id đơn hàng */
  targetId: string;
  raw: unknown;
  text: string;
  editable: boolean;
  align?: "right";
  /** Tên chuyến để đọc màn hình / thông báo */
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  // Esc = thôi sửa: không lưu khi ô mất focus sau đó
  const skipBlur = useRef(false);
  const typed = TYPED.includes(def.type);
  const numeric = NUMERIC.includes(def.type);

  if (!editable) return <div className={cn("truncate", align === "right" && "text-right")}>{text}</div>;

  function save(value: unknown) {
    start(async () => {
      const res = await setTripCustomValue({ source, id: targetId, key: def.key, value });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${label}: đã lưu ${def.label.toLowerCase()}.`);
      setEditing(false);
      router.refresh();
    });
  }

  function commitTyped() {
    const original = raw === null || raw === undefined ? "" : numeric && typeof raw === "number" ? formatNumber(raw) : String(raw);
    if (val.trim() === original.trim()) return setEditing(false);
    save(val.trim() === "" ? null : val);
  }

  const display = (
    <span className={cn("block truncate", !text && "text-xs text-muted-foreground")} title={text || undefined}>
      {pending ? <Loader2 className="inline size-3 animate-spin" /> : text || "Nhập"}
    </span>
  );

  if (typed) {
    if (editing)
      return (
        <input
          autoFocus
          aria-label={`${def.label} ${label}`}
          value={val}
          disabled={pending}
          inputMode={numeric ? "decimal" : undefined}
          maxLength={def.maxLength ?? 500}
          placeholder={def.placeholder ?? (numeric ? "Ví dụ: 1,000" : def.label)}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setVal(def.compactUpper ? compactUpper(e.target.value) : e.target.value)}
          onBlur={() => {
            if (skipBlur.current) return void (skipBlur.current = false);
            if (!pending) commitTyped();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitTyped();
            } else if (e.key === "Escape") {
              skipBlur.current = true;
              setEditing(false);
            }
          }}
          className={cn("h-7 w-full min-w-0 rounded border border-ring bg-background px-1.5 text-sm outline-none", align === "right" && "text-right")}
        />
      );
    return (
      <button
        type="button"
        disabled={pending}
        title={`Bấm để nhập ${def.label} cho ${label}${def.help ? `. ${def.help}` : ""}`}
        onClick={() => {
          skipBlur.current = false;
          setVal(raw === null || raw === undefined ? "" : numeric && typeof raw === "number" ? formatNumber(raw) : String(raw));
          setEditing(true);
        }}
        className={cn(
          "flex h-7 w-full min-w-0 items-center rounded border border-dashed border-transparent px-1 hover:border-muted-foreground/50 hover:bg-background",
          align === "right" ? "justify-end" : "justify-start",
        )}
      >
        {display}
      </button>
    );
  }

  return (
    <Popover open={editing} onOpenChange={setEditing}>
      <PopoverAnchor asChild>
        <button
          type="button"
          disabled={pending}
          title={`Bấm để chọn ${def.label} cho ${label}`}
          onClick={() => setEditing(true)}
          className={cn(
            "flex h-7 w-full min-w-0 items-center rounded border border-dashed border-transparent px-1 text-left hover:border-muted-foreground/50 hover:bg-background",
            editing && "border-ring bg-background",
          )}
        >
          {display}
        </button>
      </PopoverAnchor>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-3">
        {editing ? (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              save(draft[def.key] ?? null);
            }}
          >
            <CustomFieldsEditor fields={[{ ...def, showIf: undefined, wide: true }]} idPrefix={`icf-${targetId}-`} initial={{ [def.key]: raw }} onChange={setDraft} className="sm:grid-cols-1 lg:grid-cols-1" />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Đóng
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null} Lưu
              </Button>
            </div>
          </form>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

