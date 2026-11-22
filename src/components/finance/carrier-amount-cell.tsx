"use client";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { setCarrierCostAmount } from "@/lib/finance/carrier-actions";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CellEditorProps } from "./row-actions";

const KIND: Record<string, { kind: "freight" | "pass_through" | "other"; label: string }> = {
  carrier_freight: { kind: "freight", label: "cước trả 3PL" },
  carrier_pass_through: { kind: "pass_through", label: "chi hộ trả 3PL" },
  carrier_other: { kind: "other", label: "chi phí khác trả 3PL" },
};
const digits = (v: string) => v.replace(/[^0-9]/g, "");

/**
 * Ô Cước / Chi hộ / Chi phí khác trả 3PL trên bảng Xe thuê ngoài 3PL: bấm vào là gõ số tiền
 * (tự thêm dấu phẩy hàng nghìn), Enter hoặc rời ô để lưu, Esc để thôi, xóa trống = bỏ khoản.
 * Lưu xong tự lập/cập nhật công nợ phải trả nhà xe như khung Nhập chi phí.
 */
export function CarrierAmountCell({ row, field, text, onDone }: CellEditorProps) {
  const meta = KIND[field];
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [pending, start] = useTransition();
  const skipBlur = useRef(false);
  const code = String(row.shipment_code ?? "");
  const raw = Number(row[field] ?? 0);

  if (!meta || row.status === "cancelled") return <span className="block text-right tabular-nums">{text}</span>;
  const original = raw ? formatNumber(raw) : "";

  function commit() {
    if (digits(val) === digits(original)) return setEditing(false);
    start(async () => {
      const res = await setCarrierCostAmount({ shipmentId: String(row.id), kind: meta.kind, value: val.trim() || null });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${code}: đã lưu ${meta.label}${res.data?.payable_code ? ` (công nợ ${res.data.payable_code})` : ""}.`);
      setEditing(false);
      onDone();
    });
  }

  if (editing)
    return (
      <input
        autoFocus
        aria-label={`${meta.label} chuyến ${code}`}
        value={val}
        disabled={pending}
        inputMode="numeric"
        maxLength={20}
        placeholder="Ví dụ: 2,500,000"
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          const d = digits(e.target.value).slice(0, 13);
          setVal(d ? formatNumber(Number(d)) : "");
        }}
        onBlur={() => {
          if (skipBlur.current) return void (skipBlur.current = false);
          if (!pending) commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            skipBlur.current = true;
            setEditing(false);
          }
        }}
        className="h-7 w-full min-w-0 rounded border border-ring bg-background px-1.5 text-right text-sm tabular-nums outline-none"
      />
    );

  return (
    <button
      type="button"
      disabled={pending}
      title={`Bấm để nhập ${meta.label} chuyến ${code} ngay trên bảng`}
      onClick={() => {
        skipBlur.current = false;
        setVal(original);
        setEditing(true);
      }}
      className={cn(
        "flex h-7 w-full min-w-0 items-center justify-end rounded border border-dashed px-1 tabular-nums hover:border-muted-foreground/50 hover:bg-background",
        raw ? "border-transparent" : "border-muted-foreground/25",
      )}
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : <span className={cn("truncate", !raw && "text-xs text-muted-foreground")}>{raw ? text : "Nhập"}</span>}
    </button>
  );
}
