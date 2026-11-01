"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ReferenceSelect } from "@/components/entities/reference-select";
import { createClient } from "@/lib/supabase/client";
import { parseNumberVN } from "@/lib/entities/record";
import { formatNumber, formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FeeKind = "revenue" | "pass_through";
export type FeeGroupRole = "freight" | "pass_through" | "declaration" | "loading" | "other";
export type FeeLine = {
  key: number;
  fee_type_id: string;
  label: string;
  kind: FeeKind | null;
  amount: string;
  note: string;
  declaration_type_id: string;
  declaration_label: string;
};

export type FeeGroup = { id: string; name: string; report_role: FeeGroupRole; description: string | null };
export type FeeTypeRow = { id: string; name: string; fee_kind: FeeKind; fee_group_id: string | null; description: string | null };
export type FeeCatalog = { groups: FeeGroup[]; types: FeeTypeRow[] };

let seq = 0;
export const newFee = (from?: Partial<FeeLine>): FeeLine => ({
  key: ++seq,
  fee_type_id: from?.fee_type_id ?? "",
  label: from?.label ?? "",
  kind: from?.kind ?? null,
  amount: from?.amount ?? "",
  note: from?.note ?? "",
  declaration_type_id: from?.declaration_type_id ?? "",
  declaration_label: from?.declaration_label ?? "",
});

const blank = (l: FeeLine) => !l.amount.trim() && !l.note.trim() && !l.declaration_type_id;

/** Dữ liệu gửi lên máy chủ: dòng chưa nhập gì bị bỏ qua */
export const feesPayload = (lines: FeeLine[]) =>
  lines
    .filter((l) => !(blank(l) && !l.fee_type_id))
    .map((l) => ({ fee_type_id: l.fee_type_id, amount: l.amount, note: l.note, declaration_type_id: l.declaration_type_id }));

// Danh mục nhóm phí + loại phí: tải một lần, tải lại khi vừa thêm loại phí mới
let catalogPromise: Promise<FeeCatalog> | null = null;
export function loadFeeCatalog(force = false): Promise<FeeCatalog> {
  if (!catalogPromise || force) {
    const sb = createClient();
    catalogPromise = Promise.all([
      sb.from("fee_groups").select("id, name, report_role, description").eq("is_active", true).order("sort_order").order("name"),
      sb.from("fee_types").select("id, name, fee_kind, fee_group_id, description").eq("is_active", true).order("sort_order").order("name"),
    ]).then(([g, t]) => ({ groups: (g.data ?? []) as FeeGroup[], types: (t.data ?? []) as FeeTypeRow[] }));
  }
  return catalogPromise;
}
export function useFeeCatalog(): [FeeCatalog | null, () => void] {
  const [cat, setCat] = useState<FeeCatalog | null>(null);
  useEffect(() => {
    let alive = true;
    loadFeeCatalog().then((c) => alive && setCat(c));
    return () => {
      alive = false;
    };
  }, []);
  return [cat, () => void loadFeeCatalog(true).then(setCat)];
}

/**
 * Tổng phí: tính doanh thu, chi hộ (không tính doanh thu), và phần thuộc nhóm Cước vận chuyển
 * (cộng vào Tổng cước cùng cước, phụ phí, hỗ trợ dầu).
 */
export function feeTotals(lines: FeeLine[], catalog?: FeeCatalog | null) {
  let revenue = 0;
  let passThrough = 0;
  const byRole: Record<FeeGroupRole, number> = { freight: 0, pass_through: 0, declaration: 0, loading: 0, other: 0 };
  const typeOf = new Map(catalog?.types.map((t) => [t.id, t]) ?? []);
  const roleOf = new Map(catalog?.groups.map((g) => [g.id, g.report_role]) ?? []);
  for (const l of lines) {
    const v = parseNumberVN(l.amount, true) ?? 0;
    const t = typeOf.get(l.fee_type_id);
    const kind = l.kind ?? t?.fee_kind ?? "revenue";
    if (kind === "pass_through") passThrough += v;
    else revenue += v;
    byRole[(t?.fee_group_id && roleOf.get(t.fee_group_id)) || "other"] += v;
  }
  return { revenue, passThrough, freight: byRole.freight, byRole };
}

export const FEE_KIND_LABEL: Record<FeeKind, string> = { revenue: "Tính doanh thu", pass_through: "Chi hộ" };

/**
 * Phí thu khách theo nhóm: mỗi nhóm (Cước vận chuyển, Phí chi hộ, Phí tờ khai, Phí bốc xếp…) liệt kê sẵn các loại phí
 * của nhóm, chỉ cần gõ số tiền. Nhóm Tờ khai có thêm ô Loại tờ khai. Loại phí chưa có thì thêm ở "Phí khác".
 */
export function FeesEditor({
  value,
  onChange,
  idPrefix,
  freightBase,
}: {
  value: FeeLine[];
  onChange: (lines: FeeLine[]) => void;
  idPrefix: string;
  /** Cước + phụ phí + hỗ trợ dầu của chuyến (để hiện Tổng cước ngay trong nhóm Cước vận chuyển) */
  freightBase?: number | null;
}) {
  const [catalog, reload] = useFeeCatalog();
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const emit = (next: FeeLine[]) => {
    latest.current = next;
    onChange(next);
  };
  const patch = (key: number, p: Partial<FeeLine>) => emit(latest.current.map((l) => (l.key === key ? { ...l, ...p } : l)));

  const types = catalog?.types ?? [];
  const groups = catalog?.groups ?? [];
  const groupIds = new Set(groups.map((g) => g.id));
  const typeById = new Map(types.map((t) => [t.id, t]));
  // Dòng gắn với ô cố định của từng loại phí (dòng đầu tiên của loại phí đó); các dòng còn lại là "Phí khác"
  const fixedLine = new Map<string, FeeLine>();
  for (const l of value) {
    const t = typeById.get(l.fee_type_id);
    if (t?.fee_group_id && groupIds.has(t.fee_group_id) && !fixedLine.has(t.id)) fixedLine.set(t.id, l);
  }
  const fixedKeys = new Set([...fixedLine.values()].map((l) => l.key));
  const freeLines = value.filter((l) => !fixedKeys.has(l.key));
  const totals = feeTotals(value, catalog);

  function setFixed(t: FeeTypeRow, p: Partial<FeeLine>) {
    const cur = latest.current.find((l) => l.key === fixedLine.get(t.id)?.key);
    if (cur) {
      const next = { ...cur, ...p };
      // Ô để trống hết thì bỏ dòng
      emit(blank(next) ? latest.current.filter((l) => l.key !== cur.key) : latest.current.map((l) => (l.key === cur.key ? next : l)));
    } else {
      const next = newFee({ fee_type_id: t.id, label: t.name, kind: t.fee_kind, ...p });
      if (!blank(next)) emit([...latest.current, next]);
    }
  }

  async function pickFreeType(line: FeeLine, id: string, label: string) {
    patch(line.key, { fee_type_id: id, label, kind: null });
    if (!id) return;
    // Loại phí vừa thêm nhanh: tải lại danh mục để biết nhóm và cách tính
    const known = typeById.get(id);
    if (known) return patch(line.key, { kind: known.fee_kind });
    const c = await loadFeeCatalog(true);
    reload();
    const t = c.types.find((x) => x.id === id);
    emit(latest.current.map((l) => (l.key === line.key && l.fee_type_id === id ? { ...l, kind: t?.fee_kind ?? "revenue" } : l)));
  }

  const groupSum = (g: FeeGroup) =>
    value.reduce((a, l) => (typeById.get(l.fee_type_id)?.fee_group_id === g.id ? a + (parseNumberVN(l.amount, true) ?? 0) : a), 0);
  const firstFreight = groups.find((g) => g.report_role === "freight")?.id;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">
        Phí thu khách theo nhóm{" "}
        <span className="font-normal text-muted-foreground">· chỉ gõ số tiền vào loại phí có phát sinh, ô để trống không lưu. Nhóm phí, loại phí sửa ở Danh mục.</span>
      </div>
      {!catalog ? <p className="text-xs text-muted-foreground">Đang tải danh mục phí…</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((g) => {
          const gTypes = types.filter((t) => t.fee_group_id === g.id);
          const isFreight = g.id === firstFreight;
          const sum = groupSum(g);
          return (
            <fieldset key={g.id} className="rounded-lg border p-2.5">
              <legend className="px-1 text-xs font-semibold text-foreground">{g.name}</legend>
              {isFreight ? (
                <p className="mb-1.5 text-xs text-muted-foreground">Cước vận chuyển, phụ phí, phí hỗ trợ dầu lấy ở khung giá phía trên.</p>
              ) : null}
              <div className="space-y-1.5">
                {gTypes.map((t) => {
                  const l = fixedLine.get(t.id);
                  const fid = `${idPrefix}${t.id.slice(0, 8)}`;
                  return (
                    <div
                      key={t.id}
                      className={cn(
                        "grid items-center gap-1.5",
                        g.report_role === "declaration" ? "grid-cols-[minmax(0,1fr)_7rem_7.5rem]" : "grid-cols-[minmax(0,1fr)_8rem]",
                        g.report_role === "declaration" ? "sm:grid-cols-[minmax(0,11rem)_7.5rem_8rem_minmax(0,1fr)]" : "sm:grid-cols-[minmax(0,11rem)_8rem_minmax(0,1fr)]",
                      )}
                    >
                      <label htmlFor={fid} className="truncate text-sm" title={t.description ?? t.name}>
                        {t.name}
                        {t.fee_kind === "pass_through" ? <span className="ml-1 text-xs text-muted-foreground">(chi hộ)</span> : null}
                      </label>
                      {g.report_role === "declaration" ? (
                        <ReferenceSelect
                          id={`${fid}-tk`}
                          refKey="declaration_types"
                          value={l?.declaration_type_id ?? ""}
                          initialLabel={l?.declaration_label}
                          onChange={(id, label) => setFixed(t, { declaration_type_id: id, declaration_label: label })}
                        />
                      ) : null}
                      <Input
                        id={fid}
                        inputMode="numeric"
                        placeholder="0"
                        className="h-8 text-right tabular-nums"
                        value={l?.amount ?? ""}
                        onChange={(e) => setFixed(t, { amount: e.target.value })}
                        onBlur={(e) => {
                          const n = parseNumberVN(e.target.value, true);
                          if (l && n !== null && !Number.isNaN(n)) setFixed(t, { amount: formatNumber(n) });
                        }}
                        aria-label={`${t.name}: số tiền`}
                      />
                      <Input
                        className="col-span-full h-8 sm:col-span-1"
                        placeholder="Ghi chú"
                        maxLength={500}
                        value={l?.note ?? ""}
                        onChange={(e) => setFixed(t, { note: e.target.value })}
                        aria-label={`${t.name}: ghi chú`}
                      />
                    </div>
                  );
                })}
                {!gTypes.length ? <p className="text-xs text-muted-foreground">Nhóm chưa có loại phí. Thêm ở Danh mục → Loại phí thu khách.</p> : null}
              </div>
              <div className="mt-2 flex justify-between border-t pt-1.5 text-xs">
                <span className="text-muted-foreground">{isFreight ? "Tổng cước (cước + phụ phí + dầu + phí nhóm)" : `Cộng ${g.name.toLowerCase()}`}</span>
                <b className="tabular-nums">
                  {isFreight ? (freightBase === null ? "Tính khi lưu" : formatVND((freightBase ?? 0) + sum)) : formatVND(sum)}
                </b>
              </div>
            </fieldset>
          );
        })}
        <fieldset className="rounded-lg border border-dashed p-2.5">
          <legend className="px-1 text-xs font-semibold text-foreground">Phí khác</legend>
          <div className="space-y-1.5">
            {freeLines.map((l, i) => {
              const t = typeById.get(l.fee_type_id);
              const grp = t?.fee_group_id ? groups.find((g) => g.id === t.fee_group_id) : null;
              return (
                <div key={l.key} className="grid gap-1.5 sm:grid-cols-[minmax(0,12rem)_8rem_minmax(0,1fr)_auto] sm:items-start">
                  <div>
                    <label htmlFor={`${idPrefix}type-${i + 1}`} className="sr-only">
                      Loại phí khác dòng {i + 1}
                    </label>
                    <ReferenceSelect
                      id={`${idPrefix}type-${i + 1}`}
                      refKey="fee_types"
                      value={l.fee_type_id}
                      initialLabel={l.label}
                      onChange={(id, label) => void pickFreeType(l, id, label)}
                    />
                    {l.kind || grp ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {l.kind ? <Badge variant={l.kind === "pass_through" ? "warning" : "info"}>{FEE_KIND_LABEL[l.kind]}</Badge> : null}
                        {grp ? <Badge variant="outline">{grp.name}</Badge> : null}
                      </div>
                    ) : null}
                  </div>
                  <Input
                    aria-label={`Số tiền phí khác dòng ${i + 1}`}
                    inputMode="numeric"
                    placeholder="Số tiền (đ)"
                    className="h-8 text-right tabular-nums"
                    value={l.amount}
                    onChange={(e) => patch(l.key, { amount: e.target.value })}
                  />
                  <Input
                    aria-label={`Ghi chú phí khác dòng ${i + 1}`}
                    placeholder="Ghi chú"
                    className="h-8"
                    maxLength={500}
                    value={l.note}
                    onChange={(e) => patch(l.key, { note: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-destructive"
                    aria-label={`Xóa phí khác dòng ${i + 1}`}
                    onClick={() => emit(latest.current.filter((x) => x.key !== l.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={() => emit([...latest.current, newFee()])}>
              <Plus /> Thêm phí khác
            </Button>
            <p className="text-xs text-muted-foreground">Loại phí chưa có thì gõ tên rồi bấm Thêm mới ngay trong ô chọn, chọn nhóm để lần sau hiện sẵn trong nhóm.</p>
          </div>
        </fieldset>
      </div>
      {value.length ? (
        <p className="text-xs text-muted-foreground">
          Phí tính doanh thu: <b>{formatVND(totals.revenue)}</b>
          {totals.passThrough ? (
            <>
              {" "}· Chi hộ (khách trả lại, không tính doanh thu): <b>{formatVND(totals.passThrough)}</b>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
