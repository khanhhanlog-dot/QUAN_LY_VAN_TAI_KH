import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Truck, ListChecks } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addDaysYMD, formatDate, startOfDayVN, todayVN } from "@/lib/format";
import { SHIPMENT_STATUS } from "@/lib/status";
import { TONE_BADGE } from "@/lib/tones";
import { isLate, SHIPMENT_ADV_FIELDS, type ShipmentListRow } from "@/lib/shipments";
import { isUuid } from "@/lib/entities/record";
import { loadTableView } from "@/lib/entities/server";
import { advRefLabels, applyShipmentFilters, parseShipmentFilters, shipmentCustomFields } from "@/lib/shipments-query";
import { loadFreeVehicles } from "@/lib/free-vehicles";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DispatchTable } from "@/components/dispatch/dispatch-table";
import { TabLink } from "@/components/dispatch/tab-link";
import { DispatchFilterBar } from "@/components/dispatch/dispatch-filter-bar";
import { FreeVehiclesGrid } from "@/components/dispatch/free-vehicles-grid";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Điều phối" };

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 1000;
/** Khoảng ngày tối đa của màn hình điều phối */
const MAX_SPAN = 92;

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requirePagePermission("dispatch.view");
  const raw = await searchParams;
  const today = todayVN();
  // Mặc định hôm nay; ?ngay= (liên kết cũ) = một ngày
  const ngay = one(raw.ngay);
  const tuRaw = one(raw.tu) ?? (ngay && YMD.test(ngay) ? ngay : today);
  const denRaw = one(raw.den) ?? tuRaw;
  const supabase = await createClient();
  const custom = await shipmentCustomFields(supabase, me.permissions);
  const f = parseShipmentFilters({ ...raw, tu: tuRaw, den: denRaw }, custom.adv);
  if (f.den > addDaysYMD(f.tu, MAX_SPAN - 1)) f.den = addDaysYMD(f.tu, MAX_SPAN - 1);
  const xe = isUuid(one(raw.xe) ?? "") ? one(raw.xe)! : "";
  const tx = isUuid(one(raw.tx) ?? "") ? one(raw.tx)! : "";
  const xem = one(raw.xem) === "xe-trong" ? "xe-trong" : "";
  const tab = f.tt;
  const single = f.tu === f.den;
  const totalDays = Math.round((Date.parse(f.den) - Date.parse(f.tu)) / 86400000) + 1;
  const advFields = [...SHIPMENT_ADV_FIELDS, ...custom.adv];

  let listQ = applyShipmentFilters(supabase.from("shipment_list").select("*"), { ...f, tt: "" });
  if (xe) listQ = listQ.eq("vehicle_id", xe);
  if (tx) listQ = listQ.eq("driver_id", tx);
  const [listRes, upcomingRes, free, view, advLabels] = await Promise.all([
    listQ.order("pickup_at").order("shipment_code").limit(MAX_ROWS),
    // Chuyến chưa phân công ở ngoài khoảng ngày đang xem (từ hôm nay trở đi)
    supabase
      .from("shipment_list")
      .select("*")
      .eq("status", "draft")
      .gte("pickup_at", startOfDayVN(today))
      .or(`pickup_at.lt.${startOfDayVN(f.tu)},pickup_at.gte.${startOfDayVN(addDaysYMD(f.den, 1))}`)
      .order("pickup_at")
      .limit(30),
    loadFreeVehicles(supabase, f.tu, f.den, { vehicleId: xe, driverId: tx }),
    xem ? loadTableView(supabase, "dispatch_free_vehicles", me.id) : Promise.resolve(null),
    advRefLabels(supabase, f.adv, advFields),
  ]);
  if (listRes.error) throw listRes.error;
  if (upcomingRes.error) throw upcomingRes.error;
  const all = (listRes.data ?? []) as ShipmentListRow[];
  const term = f.q.toLowerCase();
  const upcoming = ((upcomingRes.data ?? []) as ShipmentListRow[]).filter(
    (r) =>
      (!f.kh || r.customer_id === f.kh) &&
      (!term || [r.shipment_code, r.order_code, r.customer_name, r.pickup_name, r.delivery_name, r.notes].some((v) => v?.toLowerCase().includes(term))),
  );
  const now = new Date().getTime();
  const lateCount = all.filter((r) => isLate(r, now)).length;
  const rows = tab === "tre" ? all.filter((r) => isLate(r, now)) : tab ? all.filter((r) => r.status === tab) : all;
  const counts = Object.fromEntries(SHIPMENT_STATUS.map((s) => [s.value, all.filter((r) => r.status === s.value).length]));
  const freeCount = free.filter((v) => v.free_days > 0).length;
  const filtered = Boolean(f.kh || xe || tx || f.q || f.adv.length);

  const canCreate = me.permissions.has("dispatch.create");
  const canAssign = me.permissions.has("dispatch.update");
  const canCancel = me.permissions.has("dispatch.delete") || me.permissions.has("shipments.delete");
  const href = (p: { tt?: string; xem?: string }) => {
    const q = new URLSearchParams();
    if (f.tu !== today || f.den !== today) {
      q.set("tu", f.tu);
      q.set("den", f.den);
    }
    if (f.kh) q.set("kh", f.kh);
    if (xe) q.set("xe", xe);
    if (tx) q.set("tx", tx);
    if (f.q) q.set("q", f.q);
    for (const a of f.adv) q.append("a", a);
    const t = p.tt ?? tab;
    if (t) q.set("tt", t);
    const x = p.xem ?? xem;
    if (x) q.set("xem", x);
    const s = q.toString();
    return s ? `/dieu-phoi?${s}` : "/dieu-phoi";
  };
  const rangeText = single ? `ngày ${formatDate(f.tu)}${f.tu === today ? " (hôm nay)" : ""}` : `từ ${formatDate(f.tu)} đến ${formatDate(f.den)} (${totalDays} ngày)`;

  return (
    <>
      <PageHeader
        title="Điều phối"
        description={`Chuyến nhận hàng ${rangeText}`}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/dieu-phoi/tao-don">
                <Plus /> Tạo đơn hàng
              </Link>
            </Button>
          ) : null
        }
      />

      <DispatchFilterBar filters={{ tu: f.tu, den: f.den, kh: f.kh, xe, tx, q: f.q, adv: f.adv, xem }} today={today} advFields={advFields} advLabels={advLabels} />

      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Chế độ xem">
        <ViewLink href={href({ xem: "", tt: "" })} active={!xem} icon={<ListChecks className="size-4" />} label="Chuyến" count={all.length} />
        <ViewLink href={href({ xem: "xe-trong", tt: "" })} active={xem === "xe-trong"} icon={<Truck className="size-4" />} label="Xe chưa có đơn" count={freeCount} warn={freeCount > 0} />
      </div>

      {xem ? (
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Xe công ty chưa có đơn {rangeText}</CardTitle>
            <CardDescription>
              Chỉ tính xe công ty đang hoạt động (không tính xe thuê ngoài 3PL, xe bảo dưỡng hoặc ngừng hoạt động). Một ngày được coi là xe có chuyến khi xe nhận hàng trong ngày hoặc đang chạy dở chuyến đến ngày giao dự kiến; chuyến đã hủy không tính.
              {tx || xe ? " Đang lọc theo xe/tài xế phụ trách đã chọn." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="border-t p-0">
            <FreeVehiclesGrid rows={free} view={view} totalDays={totalDays} />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b px-4 py-3" role="tablist">
            <TabLink href={href({ tt: "" })} active={!tab} label="Tất cả" count={all.length} />
            {SHIPMENT_STATUS.filter((s) => counts[s.value] > 0 || ["draft", "assigned"].includes(s.value)).map((s) => (
              <TabLink key={s.value} href={href({ tt: s.value })} active={tab === s.value} label={s.label} count={counts[s.value]} tone={TONE_BADGE[s.tone]} />
            ))}
            {lateCount > 0 ? <TabLink href={href({ tt: "tre" })} active={tab === "tre"} label="Trễ giờ giao" count={lateCount} tone="destructive" /> : null}
          </div>
          {all.length >= MAX_ROWS ? (
            <p className="border-b bg-warning/10 px-4 py-2 text-xs">Chỉ hiển thị {MAX_ROWS} chuyến đầu tiên. Thu hẹp khoảng ngày hoặc thêm điều kiện lọc để xem đủ.</p>
          ) : null}
          <DispatchTable
            rows={rows}
            canAssign={canAssign}
            canCancel={canCancel}
            showDate={!single}
            emptyText={f.q ? "Không có chuyến phù hợp với từ khóa." : filtered ? "Không có chuyến phù hợp với bộ lọc." : all.length === 0 ? `Chưa có chuyến nào nhận hàng ${rangeText}.` : "Không có chuyến ở trạng thái này."}
          />
        </Card>
      )}

      {!xem && upcoming.length > 0 ? (
        <Card className="mt-4 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Chuyến chưa phân công ở các ngày khác</CardTitle>
            <CardDescription>Ngoài khoảng ngày đang xem, từ hôm nay trở đi, tối đa 30 chuyến gần nhất.</CardDescription>
          </CardHeader>
          <CardContent className="mt-4 border-t p-0">
            <DispatchTable rows={upcoming} canAssign={canAssign} canCancel={canCancel} showDate />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

function ViewLink({ href, active, icon, label, count, warn }: { href: string; active: boolean; icon: React.ReactNode; label: string; count: number; warn?: boolean }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
        active ? "border-primary bg-primary text-primary-foreground" : "bg-card text-foreground hover:bg-muted",
      )}
    >
      {icon}
      {label}
      <span className={cn("rounded-full px-2 py-0.5 text-xs", active ? "bg-primary-foreground/20" : warn ? "bg-warning/20 text-[oklch(0.47_0.12_65)]" : "bg-muted text-muted-foreground")}>{count}</span>
    </Link>
  );
}
