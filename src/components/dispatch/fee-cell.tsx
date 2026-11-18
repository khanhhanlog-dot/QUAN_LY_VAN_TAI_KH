"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { setTripFee } from "@/app/(app)/dieu-phoi/inline-actions";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const digits = (v: string) => v.replace(/[^0-9]/g, "");

/**
 * Ô phí thu khách theo loại (Phí nâng, Phí hạ, Phí cược cont…) hoặc ô "Số HĐ" của phí đó trên bảng Điều phối / Quản lý chuyến.
 * Bấm vào là gõ: số tiền tự thêm dấu phẩy hàng nghìn, Enter hoặc rời ô để lưu, Esc để thôi, xóa trống = bỏ.
 */
export function FeeCell({
  shipmentId,
  shipmentCode,
  feeTypeId,
  feeName,
  part,
  text,
  amount,
  editable,
  multi,
}: {
  shipmentId: string;
  shipmentCode: string;
  feeTypeId: string;
  feeName: string;
  part: "amount" | "ref";
  text: string;
  amount?: number | null;
  editable: boolean;
  /** Chuyến có nhiều dòng của loại phí này: chỉ xem */
  multi?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [pending, start] = useTransition();
  const skipBlur = useRef(false);
  const router = useRouter();
  const isAmount = part === "amount";
  const what = isAmount ? feeName.toLowerCase() : `số hóa đơn ${feeName.toLowerCase()}`;

  if (!editable || multi)
    return (
      <div className={cn("truncate", isAmount && "text-right")} title={multi ? "Nhiều dòng phí cùng loại: sửa ở chi tiết chuyến" : undefined}>
        {text}
      </div>
    );

  const original = isAmount ? (amount != null ? formatNumber(amount) : "") : text;

  function commit() {
    if (val.trim() === original.trim()) return setEditing(false);
    start(async () => {
      const res = await setTripFee({ shipmentId, feeTypeId, part, value: val.trim() || null });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${shipmentCode}: ${res.message ?? "đã lưu"}`);
      setEditing(false);
      router.refresh();
    });
  }

  if (editing)
    return (
      <input
        autoFocus
        aria-label={`${isAmount ? feeName : `Số hóa đơn ${feeName}`} chuyến ${shipmentCode}`}
        value={val}
        disabled={pending}
        inputMode={isAmount ? "numeric" : undefined}
        maxLength={isAmount ? 20 : 100}
        placeholder={isAmount ? "Ví dụ: 1,200,000" : "Ví dụ: 0001234"}
        onFocus={(e) => e.target.select()}
        onChange={(e) => {
          if (!isAmount) return setVal(e.target.value);
          const d = digits(e.target.value).slice(0, 12);
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
        className={cn("h-7 w-full min-w-0 rounded border border-ring bg-background px-1.5 text-sm outline-none", isAmount && "text-right tabular-nums")}
      />
    );

  return (
    <button
      type="button"
      disabled={pending}
      title={`Bấm để nhập ${what} cho chuyến ${shipmentCode}`}
      onClick={() => {
        skipBlur.current = false;
        setVal(original);
        setEditing(true);
      }}
      className={cn(
        "flex h-7 w-full min-w-0 items-center rounded border border-dashed border-transparent px-1 hover:border-muted-foreground/50 hover:bg-background",
        isAmount ? "justify-end tabular-nums" : "justify-start",
      )}
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span className={cn("truncate", !text && "text-xs text-muted-foreground")}>{text || "Nhập"}</span>
      )}
    </button>
  );
}
