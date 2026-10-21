import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { loadTableView, resolveRefLabels } from "@/lib/entities/server";
import { parseConditions, type AdvField } from "@/lib/advanced-filter";
import { SHIPMENT_ADV_FIELDS } from "@/lib/shipments";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { addDaysYMD, formatVND, startOfDayVN } from "@/lib/format";
import { SHIPMENT_STATUS } from "@/lib/status";
import { TONE_BADGE } from "@/lib/tones";
import type { ShipmentListRow } from "@/lib/shipments";
import { applyShipmentFilters, parseShipmentFilters, shipmentCustomFields, type ShipmentFilters } from "@/lib/shipments-query";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TabLink } from "@/components/dispatch/tab-link";
import { ShipmentFilterBar } from "./filter-bar";
import { ShipmentGrid } from "./shipment-grid";
import { ExportShipmentsButton } from "./export-button";

export const metadata: Metadata = { title: "Quản lý chuyến xe" };

const PAGE_SIZE = 100;

type Summary = { total: number; by_status: Record<string, { count: number; freight: number; surcharge: number; fuel: number; revenue: number }> };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requirePagePermission("shipments.view");
  const sp = await searchParams;
  const supabase = await createClient();
  const custom = await shipmentCustomFields(supabase, me.permissions);
  const f = parseShipmentFilters(sp, custom.adv);
  const page = Math.max(1, Math.min(1000, Number(sp.trang) || 1));
  const canEdit = me.permissions.has("shipments.update") || me.permissions.has("dispatch.update");

  const [listRes, sumRes, view, advLabels] = await Promise.all([
    applyShipmentFilters(supabase.from("shipment_list").select("*", { count: "exact" }), f)
      .order("pickup_at", { ascending: false })
      .order("shipment_code", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    // Đếm theo trạng thái và cộng tiền trên toàn bộ kết quả lọc (không theo trang)
    f.adv.length
      ? summarize(supabase, f)
      : supabase.rpc("shipment_list_summary", {
          p_from: startOfDayVN(f.tu),
          p_to: startOfDayVN(addDaysYMD(f.den, 1)),
          p_customer_id: f.kh || null,
          p_q: f.q || null,
        }),
    loadTableView(supabase, "shipment_grid", me.id),
    advRefLabels(supabase, f.adv, [...SHIPMENT_ADV_FIELDS, ...custom.adv]),
  ]);
  if (listRes.error) throw listRes.error;
  if (sumRes.error) throw sumRes.error;
  const rows = (listRes.data ?? []) as ShipmentListRow[];
  const total = listRes.count ?? rows.length;
  const summary = sumRes.data as Summary;
  const counts = Object.fromEntries(SHIPMENT_STATUS.map((s) => [s.value, summary.by_status[s.value]?.count ?? 0]));
  const money = Object.entries(summary.by_status)
    .filter(([st]) => st !== "cancelled" && (!f.tt || f.tt === "tre" || f.tt === st))
    .reduce(
      (a, [, v]) => ({
        freight: a.freight + Number(v.freight),
        surcharge: a.surcharge + Number(v.surcharge),
        fuel: a.fuel + Number(v.fuel),
        revenue: a.revenue + Number(v.revenue),
      }),
      { freight: 0, surcharge: 0, fuel: 0, revenue: 0 },
    );

  const href = (p: Partial<ShipmentFilters> & { trang?: number }) => {
    const merged = { ...f, ...p };
    const q = new URLSearchParams();
    for (const k of ["tu", "den", "tt", "kh", "q"] as const) if (merged[k]) q.set(k, merged[k]);
    for (const a of merged.adv) q.append("a", a);
    if (p.trang && p.trang > 1) q.set("trang", String(p.trang));
    return `/chuyen-xe?${q.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Quản lý chuyến xe"
        description="Bảng tổng hợp, mỗi dòng một chuyến. Bấm vào ô có viền chấm để sửa nhanh; mọi thay đổi được ghi vào nhật ký hệ thống."
        actions={me.permissions.has("shipments.export") ? <ExportShipmentsButton params={{ tu: f.tu, den: f.den, tt: f.tt, kh: f.kh, q: f.q, a: f.adv }} /> : null}
      />
      <ShipmentFilterBar filters={f} />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Sum label="Cước vận chuyển" value={money.freight} />
        <Sum label="Phụ phí" value={money.surcharge} />
        <Sum label="Hỗ trợ dầu" value={money.fuel} />
        <Sum label="Tổng doanh thu (không tính chuyến hủy)" value={money.revenue} strong />
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b px-4 py-3" role="tablist">
          <TabLink href={href({ tt: "", trang: 1 })} active={!f.tt} label="Tất cả" count={summary.total} />
          {SHIPMENT_STATUS.filter((s) => counts[s.value] > 0).map((s) => (
            <TabLink key={s.value} href={href({ tt: s.value, trang: 1 })} active={f.tt === s.value} label={s.label} count={counts[s.value]} tone={TONE_BADGE[s.tone]} />
          ))}
        </div>
        <ShipmentGrid rows={rows} canEdit={canEdit} view={view} adv={f.adv} advLabels={advLabels} customDefs={custom.defs} customAdv={custom.adv} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            {total === 0 ? "Không có chuyến phù hợp" : `Dòng ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} / ${total} chuyến`}
          </span>
          {pages > 1 ? (
            <div className="flex items-center gap-2">
              {page > 1 ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={href({ trang: page - 1 })}>Trang trước</Link>
                </Button>
              ) : null}
              <span>
                Trang {page}/{pages}
              </span>
              {page < pages ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={href({ trang: page + 1 })}>Trang sau</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        Cột tạm ứng, chi phí tài xế/Admin/khác và lợi nhuận dự kiến sẽ được thêm ở Giai đoạn 6 (chi phí, ứng tiền, quyết toán).
      </p>
    </>
  );
}

function Sum({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={strong ? "font-semibold text-primary" : "font-medium"}>{formatVND(value)}</div>
    </div>
  );
}

type SumRow = { status: string; freight_amount: number; surcharge_amount: number; fuel_support_amount: number; total_revenue: number };

/** Tổng hợp theo trạng thái khi có tìm kiếm nâng cao (hàm tổng hợp trong CSDL chỉ nhận bộ lọc cơ bản) */
async function summarize(supabase: SupabaseClient, f: ShipmentFilters): Promise<{ data: Summary; error: null }> {
  const by: Summary["by_status"] = {};
  let total = 0;
  for (let p = 0; p < 20; p++) {
    const { data, error } = await applyShipmentFilters(supabase.from("shipment_list").select("status, freight_amount, surcharge_amount, fuel_support_amount, total_revenue"), f, { status: false })
      .order("id")
      .range(p * 1000, p * 1000 + 999);
    if (error) throw error;
    const rows = (data ?? []) as SumRow[];
    for (const r of rows) {
      const b = (by[r.status] ??= { count: 0, freight: 0, surcharge: 0, fuel: 0, revenue: 0 });
      b.count++;
      b.freight += Number(r.freight_amount);
      b.surcharge += Number(r.surcharge_amount);
      b.fuel += Number(r.fuel_support_amount);
      b.revenue += Number(r.total_revenue);
      total++;
    }
    if (rows.length < 1000) break;
  }
  return { data: { total, by_status: by }, error: null };
}

/** Nhãn của khách hàng, địa điểm, xe… đang dùng trong điều kiện tìm kiếm nâng cao */
async function advRefLabels(supabase: SupabaseClient, adv: string[], all: AdvField[]) {
  const conds = parseConditions(adv, all).filter((c) => all.find((x) => x.key === c.field)?.kind === "reference");
  if (!conds.length) return {};
  const fields = conds.map((c) => {
    const af = all.find((x) => x.key === c.field)!;
    return { key: c.field, label: af.label, type: "reference" as const, ref: af.ref };
  });
  const labels = await resolveRefLabels(supabase, fields, conds.map((c) => ({ [c.field]: c.value })));
  return Object.assign({}, ...Object.values(labels)) as Record<string, string>;
}
