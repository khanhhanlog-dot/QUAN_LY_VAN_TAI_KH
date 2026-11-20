"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Loader2, Save, Search, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveShipmentDriverPays } from "@/app/(app)/dieu-phoi/actions";
import { formatDate, formatNumber } from "@/lib/format";
import { SortButton, SortStatus, useTableSort } from "@/components/grid/sort-header";
import type { SortVal } from "@/lib/table-sort";

export type TripPayRow = {
  id: string;
  shipment_code: string;
  pickup_date: string;
  status: string;
  driver_id: string;
  driver_name: string | null;
  plate_number: string | null;
  pickup_name: string | null;
  delivery_name: string | null;
  amount: number | null;
  note: string | null;
  suggested: number | null;
  locked: boolean;
};

const digits = (v: string) => v.replace(/[^0-9]/g, "");

const SORT_LABELS: Record<string, string> = { code: "Mã chuyến", date: "Ngày nhận", driver: "Tài xế", plate: "Biển số", route: "Tuyến", suggested: "Gợi ý cùng tuyến", amount: "Lương chuyến" };
const sortValue = (r: TripPayRow, id: string): SortVal =>
  id === "code" ? r.shipment_code
  : id === "date" ? r.pickup_date
  : id === "driver" ? r.driver_name
  : id === "plate" ? r.plate_number
  : id === "route" ? `${r.pickup_name ?? ""} ${r.delivery_name ?? ""}`
  : id === "suggested" ? r.suggested
  : id === "amount" ? r.amount
  : null;

export function TripPayTable({ rows, from, to, onlyMissing, canFill }: { rows: TripPayRow[]; from: string; to: string; onlyMissing: boolean; canFill: boolean }) {
  const [q, setQ] = useState("");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const matched = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.shipment_code, r.driver_name, r.plate_number, r.pickup_name, r.delivery_name, r.note].some((v) => (v ?? "").toLowerCase().includes(t)),
    );
  }, [rows, q]);
  const sort = useTableSort(matched, sortValue, { storageKey: "trip_pay" });
  const shown = sort.sorted;
  const changed = Object.entries(vals).filter(([id, v]) => {
    const r = rows.find((x) => x.id === id);
    return r && v.trim() !== "" && Number(digits(v)) !== r.amount;
  });
  const withSuggest = shown.filter((r) => !r.locked && r.amount == null && r.suggested != null && !vals[r.id]);

  const go = (params: Record<string, string>) => {
    const sp = new URLSearchParams({ tu: from, den: to, ...(onlyMissing ? {} : { tatca: "1" }), ...params });
    if (sp.get("tatca") === "0") sp.delete("tatca");
    router.push(`/dieu-phoi/luong-chuyen?${sp.toString()}`);
  };

  const applySuggest = () =>
    setVals((v) => {
      const n = { ...v };
      for (const r of withSuggest) n[r.id] = formatNumber(r.suggested!);
      return n;
    });

  const save = () =>
    start(async () => {
      const payload = changed.map(([id, v]) => ({ id, amount: Number(digits(v)) }));
      const res = await saveShipmentDriverPays({ rows: payload });
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${res.message} (${formatNumber(res.data ?? 0)} chuyến)`);
      setVals({});
      router.refresh();
    });

  const exportCsv = () => {
    const head = ["Mã chuyến", "Ngày nhận", "Tài xế", "Biển số", "Điểm nhận", "Điểm giao", "Lương chuyến", "Gợi ý cùng tuyến", "Ghi chú"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = shown.map((r) =>
      [r.shipment_code, formatDate(r.pickup_date), r.driver_name, r.plate_number, r.pickup_name, r.delivery_name, r.amount ?? "", r.suggested ?? "", r.note]
        .map(esc)
        .join(","),
    );
    const blob = new Blob(["﻿" + [head.map(esc).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `luong-chuyen-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm mã chuyến, tài xế, biển số, tuyến" className="w-72 pl-8" aria-label="Tìm chuyến" />
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          Ngày nhận từ
          <Input type="date" value={from} onChange={(e) => e.target.value && go({ tu: e.target.value })} className="h-8 w-40" aria-label="Từ ngày" />
          đến
          <Input type="date" value={to} onChange={(e) => e.target.value && go({ den: e.target.value })} className="h-8 w-40" aria-label="Đến ngày" />
        </label>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" className="size-4" checked={onlyMissing} onChange={(e) => go({ tatca: e.target.checked ? "0" : "1" })} />
          Chỉ chuyến chưa nhập
        </label>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!shown.length}>
            <Download /> Tải Excel
          </Button>
          {canFill ? (
            <>
              <Button size="sm" variant="outline" onClick={applySuggest} disabled={!withSuggest.length} title="Điền số đã nhập lần trước cho cùng tuyến vào các ô trống">
                <Wand2 /> Áp gợi ý {withSuggest.length ? `(${withSuggest.length})` : ""}
              </Button>
              <Button size="sm" onClick={save} disabled={pending || !changed.length}>
                {pending ? <Loader2 className="animate-spin" /> : <Save />} Lưu {changed.length ? `(${changed.length} chuyến)` : ""}
              </Button>
            </>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        <SortStatus rules={sort.rules} label={(id) => SORT_LABELS[id]} onClear={sort.clear} hint={null} /> {formatNumber(shown.length)} chuyến{rows.length >= 3000 ? " (hiện tối đa 3,000, thu hẹp khoảng ngày để xem thêm)" : ""}. Chuyến đã có bảng lương tháng thì bị khóa.
      </p>

      <div className="overflow-auto rounded-lg border" style={{ maxHeight: "70vh" }}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b text-left">
              {(["code", "date", "driver", "plate", "route"] as const).map((k) => (
                <th key={k} className="px-3 py-2">
                  <SortButton {...sort.header(k, SORT_LABELS[k])} />
                </th>
              ))}
              <th className="px-3 py-2 text-right">
                <SortButton {...sort.header("suggested", SORT_LABELS.suggested, true)} />
              </th>
              <th className="w-44 px-3 py-2 text-right">
                <SortButton {...sort.header("amount", SORT_LABELS.amount, true)} />
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/40">
                <td className="px-3 py-1.5 font-medium">{r.shipment_code}</td>
                <td className="px-3 py-1.5">{formatDate(r.pickup_date)}</td>
                <td className="px-3 py-1.5">{r.driver_name}</td>
                <td className="px-3 py-1.5">{r.plate_number}</td>
                <td className="px-3 py-1.5">
                  {r.pickup_name} <span className="text-muted-foreground">→</span> {r.delivery_name}
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">{r.suggested != null ? formatNumber(r.suggested) : ""}</td>
                <td className="px-3 py-1.5 text-right">
                  {canFill && !r.locked ? (
                    <Input
                      inputMode="numeric"
                      value={vals[r.id] ?? (r.amount != null ? formatNumber(r.amount) : "")}
                      onChange={(e) => {
                        const d = digits(e.target.value).slice(0, 9);
                        setVals((v) => ({ ...v, [r.id]: d ? formatNumber(Number(d)) : "" }));
                      }}
                      placeholder={r.suggested != null ? formatNumber(r.suggested) : "Ví dụ: 900,000"}
                      className="h-8 text-right tabular-nums"
                      aria-label={`Lương chuyến ${r.shipment_code}`}
                    />
                  ) : (
                    <span className="tabular-nums" title={r.locked ? "Đã có bảng lương tháng" : undefined}>
                      {r.amount != null ? formatNumber(r.amount) : <span className="text-xs text-destructive">Chưa nhập</span>}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {onlyMissing ? "Mọi chuyến trong khoảng ngày này đã nhập lương chuyến." : "Không có chuyến nào."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
