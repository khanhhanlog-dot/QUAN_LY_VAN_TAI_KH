import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { addDaysYMD, formatDate, startOfDayVN, todayVN } from "@/lib/format";
import { SHIPMENT_STATUS } from "@/lib/status";
import { TONE_BADGE } from "@/lib/tones";
import { isLate, type ShipmentListRow } from "@/lib/shipments";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DispatchTable } from "@/components/dispatch/dispatch-table";
import { TabLink } from "@/components/dispatch/tab-link";

export const metadata: Metadata = { title: "Điều phối" };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export default async function Page({ searchParams }: { searchParams: Promise<{ ngay?: string; tt?: string }> }) {
  const me = await requirePagePermission("dispatch.view");
  const sp = await searchParams;
  const today = todayVN();
  const day = sp.ngay && YMD.test(sp.ngay) ? sp.ngay : today;
  const tab = sp.tt === "tre" || SHIPMENT_STATUS.some((s) => s.value === sp.tt) ? sp.tt! : "";
  const supabase = await createClient();

  const [dayRes, upcomingRes] = await Promise.all([
    supabase
      .from("shipment_list")
      .select("*")
      .gte("pickup_at", startOfDayVN(day))
      .lt("pickup_at", startOfDayVN(addDaysYMD(day, 1)))
      .order("pickup_at")
      .order("shipment_code")
      .limit(500),
    // Chuyến chưa phân công ở các ngày khác (từ hôm nay trở đi)
    supabase
      .from("shipment_list")
      .select("*")
      .eq("status", "draft")
      .gte("pickup_at", startOfDayVN(today))
      .or(`pickup_at.lt.${startOfDayVN(day)},pickup_at.gte.${startOfDayVN(addDaysYMD(day, 1))}`)
      .order("pickup_at")
      .limit(30),
  ]);
  if (dayRes.error) throw dayRes.error;
  if (upcomingRes.error) throw upcomingRes.error;
  const all = (dayRes.data ?? []) as ShipmentListRow[];
  const upcoming = (upcomingRes.data ?? []) as ShipmentListRow[];
  const now = new Date().getTime();
  const lateCount = all.filter((r) => isLate(r, now)).length;
  const rows = tab === "tre" ? all.filter((r) => isLate(r, now)) : tab ? all.filter((r) => r.status === tab) : all;
  const counts = Object.fromEntries(SHIPMENT_STATUS.map((s) => [s.value, all.filter((r) => r.status === s.value).length]));

  const canCreate = me.permissions.has("dispatch.create");
  const canAssign = me.permissions.has("dispatch.update");
  const canCancel = me.permissions.has("dispatch.delete") || me.permissions.has("shipments.delete");
  const href = (p: { ngay?: string; tt?: string }) => {
    const q = new URLSearchParams();
    const d = p.ngay ?? day;
    if (d !== today) q.set("ngay", d);
    const t = p.tt ?? tab;
    if (t) q.set("tt", t);
    const s = q.toString();
    return s ? `/dieu-phoi?${s}` : "/dieu-phoi";
  };

  return (
    <>
      <PageHeader
        title="Điều phối"
        description={`Chuyến nhận hàng ngày ${formatDate(day)}${day === today ? " (hôm nay)" : ""}`}
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" asChild>
          <Link href={href({ ngay: addDaysYMD(day, -1), tt: "" })} aria-label="Ngày trước">
            <ChevronLeft />
          </Link>
        </Button>
        <form action="/dieu-phoi" className="flex gap-2">
          <Input type="date" name="ngay" defaultValue={day} className="w-40" aria-label="Chọn ngày" />
          <Button variant="outline" type="submit">
            Xem
          </Button>
        </form>
        <Button variant="outline" size="icon" asChild>
          <Link href={href({ ngay: addDaysYMD(day, 1), tt: "" })} aria-label="Ngày sau">
            <ChevronRight />
          </Link>
        </Button>
        {day !== today ? (
          <Button variant="ghost" asChild>
            <Link href="/dieu-phoi">Hôm nay</Link>
          </Button>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap gap-1 border-b px-4 py-3" role="tablist">
          <TabLink href={href({ tt: "" })} active={!tab} label="Tất cả" count={all.length} />
          {SHIPMENT_STATUS.filter((s) => counts[s.value] > 0 || ["draft", "assigned"].includes(s.value)).map((s) => (
            <TabLink key={s.value} href={href({ tt: s.value })} active={tab === s.value} label={s.label} count={counts[s.value]} tone={TONE_BADGE[s.tone]} />
          ))}
          {lateCount > 0 ? <TabLink href={href({ tt: "tre" })} active={tab === "tre"} label="Trễ giờ giao" count={lateCount} tone="destructive" /> : null}
        </div>
        <DispatchTable
          rows={rows}
          canAssign={canAssign}
          canCancel={canCancel}
          emptyText={all.length === 0 ? "Chưa có chuyến nào nhận hàng trong ngày này." : "Không có chuyến ở trạng thái này."}
        />
      </Card>

      {upcoming.length > 0 ? (
        <Card className="mt-4 overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Chuyến chưa phân công ở các ngày khác</CardTitle>
            <CardDescription>Từ hôm nay trở đi, tối đa 30 chuyến gần nhất.</CardDescription>
          </CardHeader>
          <CardContent className="mt-4 border-t p-0">
            <DispatchTable rows={upcoming} canAssign={canAssign} canCancel={canCancel} showDate />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
