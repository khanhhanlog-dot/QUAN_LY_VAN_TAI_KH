"use client";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ReferenceSelect } from "@/components/entities/reference-select";
import { createClient } from "@/lib/supabase/client";
import { parseNumberVN } from "@/lib/entities/record";
import { formatVND } from "@/lib/format";

export type FeeKind = "revenue" | "pass_through";
export type FeeLine = { key: number; fee_type_id: string; label: string; kind: FeeKind | null; amount: string; note: string };

let seq = 0;
export const newFee = (from?: Partial<FeeLine>): FeeLine => ({
  key: ++seq,
  fee_type_id: from?.fee_type_id ?? "",
  label: from?.label ?? "",
  kind: from?.kind ?? null,
  amount: from?.amount ?? "",
  note: from?.note ?? "",
});

/** Dữ liệu gửi lên máy chủ (dòng trống bị bỏ qua ở máy chủ) */
export const feesPayload = (lines: FeeLine[]) => lines.map((l) => ({ fee_type_id: l.fee_type_id, amount: l.amount, note: l.note }));

/** Tổng phí tính doanh thu và tổng chi hộ (không tính doanh thu) */
export function feeTotals(lines: FeeLine[]) {
  let revenue = 0;
  let passThrough = 0;
  for (const l of lines) {
    const v = parseNumberVN(l.amount, true) ?? 0;
    if (l.kind === "pass_through") passThrough += v;
    else revenue += v;
  }
  return { revenue, passThrough };
}

export const FEE_KIND_LABEL: Record<FeeKind, string> = { revenue: "Tính doanh thu", pass_through: "Chi hộ" };

/** Các khoản phí thu khách ngoài cước: bốc xếp, chi hộ, nâng hạ... mỗi dòng một loại phí */
export function FeesEditor({ value, onChange, idPrefix }: { value: FeeLine[]; onChange: (lines: FeeLine[]) => void; idPrefix: string }) {
  const set = (key: number, patch: Partial<FeeLine>) => onChange(value.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const { revenue, passThrough } = feeTotals(value);

  async function pickType(line: FeeLine, id: string, label: string) {
    // Biết loại phí là "chi hộ" hay "tính doanh thu" để cộng tổng đúng (kể cả loại phí vừa thêm nhanh)
    const next = value.map((l) => (l.key === line.key ? { ...l, fee_type_id: id, label, kind: null } : l));
    onChange(next);
    if (!id) return;
    const { data } = await createClient().from("fee_types").select("fee_kind").eq("id", id).maybeSingle();
    onChange(next.map((l) => (l.key === line.key ? { ...l, kind: (data?.fee_kind as FeeKind | undefined) ?? "revenue" } : l)));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">
          Phí khác thu khách <span className="font-normal text-muted-foreground">· bốc xếp, chi hộ, nâng hạ… để báo cáo tách theo từng loại phí</span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, newFee()])}>
          <Plus /> Thêm phí
        </Button>
      </div>
      {value.length ? (
        <div className="space-y-2">
          {value.map((l, i) => (
            <div key={l.key} className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_9rem_minmax(0,1fr)_auto] sm:items-start">
              <div>
                <label htmlFor={`${idPrefix}type-${i + 1}`} className="sr-only">
                  Loại phí dòng {i + 1}
                </label>
                <ReferenceSelect
                  id={`${idPrefix}type-${i + 1}`}
                  refKey="fee_types"
                  value={l.fee_type_id}
                  initialLabel={l.label}
                  onChange={(id, label) => void pickType(l, id, label)}
                />
                {l.kind ? (
                  <Badge variant={l.kind === "pass_through" ? "warning" : "info"} className="mt-1">
                    {FEE_KIND_LABEL[l.kind]}
                  </Badge>
                ) : null}
              </div>
              <Input
                aria-label={`Số tiền phí dòng ${i + 1}`}
                inputMode="numeric"
                placeholder="Số tiền (đ)"
                value={l.amount}
                onChange={(e) => set(l.key, { amount: e.target.value })}
              />
              <Input aria-label={`Ghi chú phí dòng ${i + 1}`} placeholder="Ghi chú (VD: bốc 2 đầu)" maxLength={500} value={l.note} onChange={(e) => set(l.key, { note: e.target.value })} />
              <Button type="button" variant="ghost" size="icon" className="text-destructive" aria-label={`Xóa phí dòng ${i + 1}`} onClick={() => onChange(value.filter((x) => x.key !== l.key))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Phí tính doanh thu: <b>{formatVND(revenue)}</b>
            {passThrough ? (
              <>
                {" "}· Chi hộ (khách trả lại, không tính doanh thu): <b>{formatVND(passThrough)}</b>
              </>
            ) : null}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Chưa có phí khác. Loại phí chưa có thì gõ tên rồi bấm Thêm mới ngay trong ô chọn.</p>
      )}
    </div>
  );
}
