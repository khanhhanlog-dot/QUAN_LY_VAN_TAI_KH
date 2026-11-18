import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { TripPayTable, type TripPayRow } from "./trip-pay-table";

export const metadata: Metadata = { title: "Nhập lương chuyến" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const vnToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

/** Điều phối / kế toán nhập lương chuyến cho nhiều chuyến xe nội bộ một lần; bảng lương tháng cộng các số này */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requirePagePermission("dispatch.view", "settlements.view", "settlements.update");
  const sp = await searchParams;
  const today = vnToday();
  let to = typeof sp.den === "string" && ISO.test(sp.den) ? sp.den : today;
  let from = typeof sp.tu === "string" && ISO.test(sp.tu) ? sp.tu : addDays(today, -30);
  if (from > to) [from, to] = [to, from];
  if (Date.parse(to) - Date.parse(from) > 400 * 86400_000) from = addDays(to, -400);
  const onlyMissing = sp.tatca !== "1";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("trips_missing_driver_pay", { p_from: from, p_to: to, p_only_missing: onlyMissing });
  if (error) throw error;
  const canFill = me.permissions.has("dispatch.update") || me.permissions.has("settlements.update");
  return (
    <>
      <PageHeader
        title="Nhập lương chuyến"
        description="Nhập số tiền trả tài xế cho từng chuyến xe nội bộ (có thể nhập ngay ở cột Lương chuyến trên Điều phối / Quản lý chuyến). Ô trống có gợi ý = số đã nhập lần trước cho cùng tuyến; bấm Áp gợi ý để điền nhanh. Bảng lương tháng cộng các số này thành Lương chuyến; lương cơ bản vẫn lấy từ hồ sơ tài xế."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/dieu-phoi">
              <ArrowLeft /> Điều phối
            </Link>
          </Button>
        }
      />
      <TripPayTable key={`${from}|${to}|${onlyMissing}`} rows={(data ?? []) as TripPayRow[]} from={from} to={to} onlyMissing={onlyMissing} canFill={canFill} />
    </>
  );
}
