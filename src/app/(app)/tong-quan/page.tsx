import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, BadgeCheck, CalendarDays, CheckCircle2, ChevronRight, Clock, FileWarning,
  Navigation, ShieldAlert, Truck, UserCheck, Wallet,
} from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { addDaysYMD, formatDate, formatVND, todayVN } from "@/lib/format";
import { SHIPMENT_STATUS, shipmentStatus } from "@/lib/status";
import { TONE_BADGE, toneVar, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Tổng quan" };

type Stats = {
  today: number;
  yesterday: number;
  month_to_date: number;
  prev_month_to_date: number;
  completed_mtd: number;
  completed_prev_mtd: number;
  daily: { date: string; total: number }[];
  monthly: { month: string; total: number; completed: number }[];
  by_status: Record<string, number>;
  top_customers: { id: string; name: string; total: number }[];
};

type Recent = {
  id: string;
  shipment_code: string;
  status: string;
  pickup_at: string;
  vehicles: { plate_number: string } | null;
  drivers: { full_name: string } | null;
  transport_orders: { customers: { name: string } | null } | null;
  pickup: { name: string } | null;
  delivery: { name: string } | null;
};

export default async function DashboardPage() {
  const user = await requirePagePermission("dashboard.view");
  const supabase = await createClient();
  const perms = user.permissions;
  const canShip = perms.has("shipments.view") || perms.has("dispatch.view");

  const nowIso = new Date().toISOString();
  const today = todayVN();
  const in30 = addDaysYMD(today, 30);

  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: c, error } = await q;
    if (error) throw error;
    return c ?? 0;
  };
  const head = { count: "exact" as const, head: true };

  let stats: Stats | null = null;
  let recent: Recent[] = [];
  let inTransit = 0;
  let lateCount = 0;
  let waitingAccept = 0;
  let waitingSettle = 0;
  if (canShip) {
    const [statsRes, recentRes, a, b, c, d] = await Promise.all([
      supabase.rpc("dashboard_shipment_stats", { p_today: today }),
      supabase
        .from("shipments")
        .select(
          "id, shipment_code, status, pickup_at, vehicles(plate_number), drivers(full_name), transport_orders(customers!transport_orders_customer_id_fkey(name)), pickup:locations!shipments_pickup_location_id_fkey(name), delivery:locations!shipments_delivery_location_id_fkey(name)",
        )
        .order("pickup_at", { ascending: false })
        .limit(6),
      count(supabase.from("shipments").select("id", head).in("status", ["accepted", "in_transit"])),
      count(supabase.from("shipments").select("id", head).in("status", ["assigned", "accepted", "in_transit"]).lt("expected_delivery_at", nowIso)),
      count(supabase.from("shipments").select("id", head).eq("status", "assigned")),
      count(supabase.from("shipments").select("id", head).eq("status", "driver_completed")),
    ]);
    if (statsRes.error) throw statsRes.error;
    if (recentRes.error) throw recentRes.error;
    stats = statsRes.data as Stats;
    recent = (recentRes.data ?? []) as unknown as Recent[];
    [inTransit, lateCount, waitingAccept, waitingSettle] = [a, b, c, d];
  }

  const pendingApprovals = perms.has("approvals.view")
    ? await count(supabase.from("approval_requests").select("id", head).eq("status", "pending"))
    : null;
  const pendingUsers = perms.has("users.view") ? await count(supabase.from("profiles").select("id", head).eq("status", "pending")) : null;

  let expiring: { id: string; plate_number: string; registration_expiry: string | null; insurance_expiry: string | null }[] = [];
  if (perms.has("vehicles.view")) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, plate_number, registration_expiry, insurance_expiry")
      .is("archived_at", null)
      .or(`registration_expiry.lte.${in30},insurance_expiry.lte.${in30}`)
      .order("registration_expiry", { ascending: true, nullsFirst: false })
      .limit(6);
    if (error) throw error;
    expiring = data ?? [];
  }

  // Chỉ tiêu tài chính (người có quyền xem báo cáo); khoản nào không có quyền thì ghi rõ
  let finance: { label: string; value: number | null }[] | null = null;
  if (perms.has("reports.view")) {
    const sum = async (q: PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>, col: string) => {
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).reduce((a, r) => a + Number(r[col] ?? 0), 0);
    };
    const month = `${today.slice(0, 7)}-01`;
    const [m, ar, ap, adv] = await Promise.all([
      supabase.from("report_monthly").select("revenue, cost, profit").eq("report_month", month).maybeSingle(),
      perms.has("receivables.view") ? sum(supabase.from("receivable_list").select("remaining_amount").in("status", ["open", "partial"]), "remaining_amount") : null,
      perms.has("receivables.view") ? sum(supabase.from("payable_list").select("remaining_amount").in("status", ["open", "partial"]), "remaining_amount") : null,
      sum(supabase.from("report_advance_balance").select("balance"), "balance"),
    ]);
    if (m.error) throw m.error;
    finance = [
      { label: "Doanh thu", value: Number(m.data?.revenue ?? 0) },
      { label: "Chi phí chuyến", value: Number(m.data?.cost ?? 0) },
      { label: "Lợi nhuận gộp", value: Number(m.data?.profit ?? 0) },
      { label: "Công nợ phải thu", value: ar },
      { label: "Công nợ phải trả", value: ap },
      { label: "Tạm ứng tài xế đang giữ", value: adv },
    ];
  }

  const todos: { icon: LucideIcon; tone: Tone; label: string; value: number; href?: string }[] = [];
  if (canShip) {
    todos.push({ icon: Clock, tone: "amber", label: "Chờ tài xế nhận chuyến", value: waitingAccept });
    todos.push({ icon: FileWarning, tone: "teal", label: "Đã giao, chờ chứng từ / quyết toán", value: waitingSettle });
  }
  if (pendingApprovals !== null) todos.push({ icon: BadgeCheck, tone: "purple", label: "Yêu cầu phê duyệt đang chờ", value: pendingApprovals, href: "/phe-duyet" });
  if (pendingUsers !== null) todos.push({ icon: UserCheck, tone: "blue", label: "Tài khoản chờ cấp quyền", value: pendingUsers, href: "/nguoi-dung" });

  const statusItems = stats
    ? SHIPMENT_STATUS.map((s) => ({ label: s.label, tone: s.tone, value: stats!.by_status[s.value] ?? 0 })).filter((i) => i.value > 0)
    : [];
  const topMax = Math.max(1, ...(stats?.top_customers ?? []).map((c) => c.total));

  return (
    <>
      <PageHeader title="Tổng quan" description={`Hôm nay ${formatDate(today)} · Xin chào ${user.fullName || user.email}`} />

      {stats ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0">
            <Kpi icon={CalendarDays} tone="blue" label="Chuyến hôm nay" value={stats.today} prev={stats.yesterday} prevLabel="so với hôm qua" prevName="Hôm qua" />
            <Kpi icon={Truck} tone="purple" label="Chuyến trong tháng" value={stats.month_to_date} prev={stats.prev_month_to_date} prevLabel="so với cùng kỳ tháng trước" prevName="Cùng kỳ tháng trước" />
            <Kpi icon={CheckCircle2} tone="green" label="Hoàn thành trong tháng" value={stats.completed_mtd} prev={stats.completed_prev_mtd} prevLabel="so với cùng kỳ tháng trước" prevName="Cùng kỳ tháng trước" />
            <Kpi icon={Navigation} tone="amber" label="Đang thực hiện" value={inTransit} note="Tài xế đã nhận hoặc đang chạy" />
            <Kpi icon={AlertTriangle} tone="red" label="Đang trễ giờ giao" value={lateCount} note="Quá giờ giao dự kiến, chưa hoàn thành" />
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Số chuyến 14 ngày gần đây</CardTitle>
                <CardDescription>Theo ngày nhận hàng, không tính chuyến đã hủy</CardDescription>
              </CardHeader>
              <CardContent>
                <BarChart
                  unit="chuyến"
                  data={stats.daily.map((d) => ({ label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`, title: formatDate(d.date), value: d.total }))}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trạng thái chuyến tháng này</CardTitle>
                <CardDescription>Tính cả chuyến đã hủy</CardDescription>
              </CardHeader>
              <CardContent>
                {statusItems.length ? (
                  <DonutChart items={statusItems} centerLabel="Tổng chuyến" />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">Chưa có chuyến nào trong tháng.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
            <Card className="xl:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Chuyến gần đây</CardTitle>
                  <CardDescription>6 chuyến có ngày nhận hàng mới nhất</CardDescription>
                </div>
                <span className="text-xs text-muted-foreground" title="Màn hình quản lý chuyến hoàn thiện ở Giai đoạn 4">
                  Danh sách đầy đủ: Giai đoạn 4
                </span>
              </CardHeader>
              <CardContent className="px-0">
                {recent.length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-muted-foreground">Chưa có chuyến nào.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="px-6 py-2 font-medium">Mã chuyến / Nhận hàng</th>
                          <th className="px-3 py-2 font-medium">Khách hàng / Tuyến</th>
                          <th className="hidden px-3 py-2 font-medium 2xl:table-cell">Tuyến</th>
                          <th className="px-3 py-2 font-medium">Xe / Tài xế</th>
                          <th className="px-6 py-2 font-medium">Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recent.map((r) => {
                          const st = shipmentStatus(r.status);
                          return (
                            <tr key={r.id} className="border-b last:border-0">
                              <td className="px-6 py-2.5 whitespace-nowrap">
                                <div className="font-medium text-primary">{r.shipment_code}</div>
                                <div className="text-xs text-muted-foreground">{formatDate(r.pickup_at)}</div>
                              </td>
                              <td className="max-w-56 px-3 py-2.5">
                                <div className="truncate">{r.transport_orders?.customers?.name ?? "—"}</div>
                                <div className="truncate text-xs text-muted-foreground 2xl:hidden">
                                  {r.pickup?.name ?? "?"} → {r.delivery?.name ?? "?"}
                                </div>
                              </td>
                              <td className="hidden max-w-56 truncate px-3 py-2.5 text-muted-foreground 2xl:table-cell">
                                {r.pickup?.name ?? "?"} → {r.delivery?.name ?? "?"}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {r.vehicles?.plate_number ?? <span className="text-muted-foreground">Chưa gán xe</span>}
                                {r.drivers ? <div className="text-xs text-muted-foreground">{r.drivers.full_name}</div> : null}
                              </td>
                              <td className="px-6 py-2.5">
                                <Badge variant={TONE_BADGE[st.tone]}>{st.label}</Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Khách hàng nhiều chuyến nhất tháng</CardTitle>
                <CardDescription>Top 5, không tính chuyến đã hủy</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.top_customers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Chưa có chuyến nào trong tháng.</p>
                ) : (
                  <ul className="space-y-3">
                    {stats.top_customers.map((c, i) => (
                      <li key={c.id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="flex size-5 shrink-0 items-center justify-center rounded bg-primary/10 text-[11px] font-semibold text-primary">{i + 1}</span>
                            <span className="truncate">{c.name}</span>
                          </span>
                          <span className="font-medium tabular-nums">{c.total.toLocaleString("en-US")} chuyến</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted">
                          <div className="h-1.5 rounded-full bg-tone-blue" style={{ width: `${(c.total / topMax) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3 [&>*]:min-w-0">
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Sản lượng chuyến 6 tháng</CardTitle>
                <CardDescription>Tổng chuyến và chuyến đã hoàn thành theo tháng nhận hàng</CardDescription>
              </CardHeader>
              <CardContent>
                <LineChart
                  unit="chuyến"
                  labels={stats.monthly.map((m) => `T${Number(m.month.slice(5, 7))}/${m.month.slice(2, 4)}`)}
                  series={[
                    { name: "Tổng chuyến", tone: "blue", values: stats.monthly.map((m) => m.total) },
                    { name: "Đã hoàn thành", tone: "amber", values: stats.monthly.map((m) => m.completed) },
                  ]}
                />
              </CardContent>
            </Card>
            <TodoCard todos={todos} />
          </div>
        </>
      ) : todos.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <TodoCard todos={todos} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {perms.has("vehicles.view") ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldAlert className="size-4 text-tone-red" /> Giấy tờ xe sắp hết hạn (30 ngày)
              </CardTitle>
              <CardDescription>Đăng kiểm và bảo hiểm</CardDescription>
            </CardHeader>
            <CardContent>
              {expiring.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có xe nào sắp hết hạn giấy tờ.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {expiring.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/phuong-tien/${v.id}`} className="font-medium text-primary hover:underline">
                        {v.plate_number}
                      </Link>
                      <span className="flex flex-wrap justify-end gap-1.5">
                        {v.registration_expiry && v.registration_expiry <= in30 ? (
                          <Badge variant={v.registration_expiry < today ? "destructive" : "warning"}>Đăng kiểm {formatDate(v.registration_expiry)}</Badge>
                        ) : null}
                        {v.insurance_expiry && v.insurance_expiry <= in30 ? (
                          <Badge variant={v.insurance_expiry < today ? "destructive" : "warning"}>Bảo hiểm {formatDate(v.insurance_expiry)}</Badge>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
        {finance ? (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="size-4 text-tone-green" /> Tổng quan tài chính
                </CardTitle>
                <CardDescription>Tháng này, tính từ chuyến, chi phí đã duyệt và phiếu thu chi</CardDescription>
              </div>
              <Link href="/bao-cao" className="text-xs text-primary hover:underline">
                Báo cáo
              </Link>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {finance.map((k) => (
                  <div key={k.label} className="rounded-lg border px-3 py-2">
                    <div className="text-xs text-muted-foreground">{k.label}</div>
                    <div className="text-sm font-semibold tabular-nums">{k.value === null ? "Không có quyền xem" : formatVND(k.value)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}

function IconTile({ icon: Icon, tone, className }: { icon: LucideIcon; tone: Tone; className?: string }) {
  return (
    <div className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm", className)} style={{ background: toneVar(tone) }}>
      <Icon className="size-5" />
    </div>
  );
}

function Kpi({
  icon,
  tone,
  label,
  value,
  prev,
  prevLabel,
  prevName,
  note,
}: {
  icon: LucideIcon;
  tone: Tone;
  label: string;
  value: number;
  prev?: number;
  prevLabel?: string;
  prevName?: string;
  note?: string;
}) {
  let change: React.ReactNode = <span className="text-muted-foreground">{note}</span>;
  if (prev !== undefined) {
    if (prev === 0) {
      change = <span className="text-muted-foreground">{value === 0 ? `Không đổi ${prevLabel}` : `${prevName} chưa có chuyến`}</span>;
    } else {
      const pct = ((value - prev) / prev) * 100;
      const up = pct >= 0;
      const Arrow = up ? ArrowUpRight : ArrowDownRight;
      change = (
        <span className="flex flex-wrap items-center gap-1">
          <span className={cn("inline-flex items-center font-medium", up ? "text-[oklch(0.5_0.13_155)]" : "text-[oklch(0.55_0.2_25)]")}>
            <Arrow className="size-3.5" />
            {Math.abs(pct).toLocaleString("en-US", { maximumFractionDigits: 1 })}%
          </span>
          <span className="text-muted-foreground">{prevLabel}</span>
        </span>
      );
    }
  }
  return (
    <Card className="h-full">
      <CardContent>
        <div className="flex items-start justify-between gap-2">
          <div className="pt-0.5 text-sm text-muted-foreground">{label}</div>
          <IconTile icon={icon} tone={tone} className="size-9 sm:size-10" />
        </div>
        <div className="-mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{value.toLocaleString("en-US")}</div>
        <div className="mt-1 text-xs">{change}</div>
      </CardContent>
    </Card>
  );
}

function TodoCard({ todos }: { todos: { icon: LucideIcon; tone: Tone; label: string; value: number; href?: string }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Việc cần xử lý</CardTitle>
        <CardDescription>Số liệu hiện tại</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {todos.map((t) => {
            const body = (
              <div className={cn("flex items-center gap-3 rounded-lg border p-2.5", t.href && "transition-colors hover:border-primary/40 hover:bg-accent/40")}>
                <IconTile icon={t.icon} tone={t.tone} className="size-9 rounded-lg" />
                <span className="flex-1 text-sm">{t.label}</span>
                <span className="text-lg font-semibold tabular-nums">{t.value.toLocaleString("en-US")}</span>
                {t.href ? <ChevronRight className="size-4 text-muted-foreground" /> : null}
              </div>
            );
            return <li key={t.label}>{t.href ? <Link href={t.href}>{body}</Link> : body}</li>;
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
