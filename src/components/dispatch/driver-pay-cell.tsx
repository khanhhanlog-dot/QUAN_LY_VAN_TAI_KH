"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { setShipmentDriverPay } from "@/app/(app)/dieu-phoi/actions";
import { formatNumber } from "@/lib/format";
import { PAY_SOURCE_LABEL } from "@/lib/driver-pay";
import type { ShipmentListRow } from "@/lib/shipments";

const digits = (v: string) => v.replace(/[^0-9]/g, "");

/**
 * Ô "Lương chuyến" trên Điều phối / Quản lý chuyến: điều phối bấm vào và nhập số tiền trả tài xế cho chuyến này.
 * Chưa nhập thì hiện "Nhập" (gợi ý = số đã nhập lần trước cho cùng tuyến). Bảng lương cộng các số này thành lương chuyến.
 */
export function DriverPayCell({ r }: { r: ShipmentListRow }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!r.driver_pay_source) return null;
  const src = r.driver_pay_source;
  const entered = src === "manual";
  // Khi chưa nhập, cột override trả về số gợi ý (lần nhập trước cùng tuyến)
  const suggest = !entered && r.driver_pay_override != null ? r.driver_pay_override : null;
  const title = [
    `Lương chuyến: ${PAY_SOURCE_LABEL[src] ?? src}`,
    suggest != null ? `Gợi ý cùng tuyến: ${formatNumber(suggest)}` : "",
    r.driver_pay_note ? `Ghi chú: ${r.driver_pay_note}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const shown =
    src === "monthly_only" ? (
      <span className="text-xs text-muted-foreground">Lương tháng</span>
    ) : entered || src === "driver_legacy" ? (
      <span className={entered ? "font-semibold tabular-nums" : "tabular-nums text-muted-foreground"}>{formatNumber(r.driver_pay ?? 0)}</span>
    ) : null;

  if (!r.can_override_pay || src === "monthly_only" || r.status === "cancelled") {
    return (
      <div className="text-right" title={title}>
        {shown ?? (
          <Link href="/dieu-phoi/luong-chuyen" className="text-xs font-medium text-destructive hover:underline">
            Chưa nhập
          </Link>
        )}
      </div>
    );
  }

  function save() {
    const v = digits(text);
    const n = v === "" ? null : Number(v);
    setEditing(false);
    const cur = entered ? (r.driver_pay ?? null) : null;
    if (n === cur) return;
    if (n === null && !entered) return;
    start(async () => {
      const res = await setShipmentDriverPay({ shipmentId: r.id, amount: n });
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <input
        autoFocus
        inputMode="numeric"
        aria-label={`Lương chuyến ${r.shipment_code}`}
        value={text}
        onChange={(e) => {
          const d = digits(e.target.value).slice(0, 9);
          setText(d ? formatNumber(Number(d)) : "");
        }}
        onFocus={(e) => e.target.select()}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-full min-w-24 rounded border bg-background px-1.5 text-right tabular-nums"
        placeholder={suggest != null ? formatNumber(suggest) : "Ví dụ: 900,000"}
      />
    );
  }
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        const init = entered ? (r.driver_pay ?? 0) : suggest;
        setText(init != null ? formatNumber(init) : "");
        setEditing(true);
      }}
      title={`${title}. Bấm để nhập lương chuyến ${r.shipment_code}${entered ? " (xóa trống = bỏ số đã nhập)" : ""}`}
      className="flex h-7 w-full items-center justify-end rounded border border-dashed border-transparent px-1.5 hover:border-border"
    >
      {pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        (shown ?? (
          <span className="text-xs font-medium text-destructive">
            Nhập{suggest != null ? <span className="ml-1 font-normal text-muted-foreground">({formatNumber(suggest)}?)</span> : null}
          </span>
        ))
      )}
    </button>
  );
}
