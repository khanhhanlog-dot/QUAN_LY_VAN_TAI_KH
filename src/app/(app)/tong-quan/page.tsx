import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, BadgeCheck, CalendarDays, Clock, FileWarning, Truck, UserCheck } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { addDaysYMD, formatDate, startOfDayVN, todayVN } from "@/lib/format";

export const metadata: Metadata = { title: "Tổng quan" };

export default async function DashboardPage() {
  const user = await requirePagePermission("dashboard.view");
  const supabase = await createClient();
  const perms = user.permissions;
  const canShip = perms.has("shipments.view") || perms.has("dispatch.view");

  const now = new Date();
  const nowIso = now.toISOString();
  const today = todayVN(now);
  const dayStart = startOfDayVN(today);
  const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString();
  const monthStart = startOfDayVN(`${today.slice(0, 8)}01`);
  const in30 = addDaysYMD(today, 30);

  const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: c, error } = await q;
    if (error) throw error;
    return c ?? 0;
  };
  const head = { count: "exact" as const, head: true };

  const [todayCount, monthCount, waitingAccept, inTransit, waitingSettle, lateCount] = canShip
    ? await Promise.all([
        count(supabase.from("shipments").select("id", head).gte("pickup_at", dayStart).lt("pickup_at", dayEnd).neq("status", "cancelled")),
        count(supabase.from("shipments").select("id", head).gte("pickup_at", monthStart).neq("status", "cancelled")),
        count(supabase.from("shipments").select("id", head).in("status", ["assigned", "rejected"])),
        count(supabase.from("shipments").select("id", head).in("status", ["accepted", "in_transit"])),
        count(supabase.from("shipments").select("id", head).eq("status", "driver_completed")),
        count(
          supabase
            .from("shipments")
            .select("id", head)
            .in("status", ["assigned", "accepted", "in_transit"])
            .lt("expected_delivery_at", nowIso),
        ),
      ])
    : [null, null, null, null, null, null];

  const pendingApprovals = perms.has("approvals.view")
    ? await count(supabase.from("approval_requests").select("id", head).eq("status", "pending"))
    : null;
  const pendingUsers = perms.has("users.view") ? await count(supabase.from("profiles").select("id", head).eq("status", "pending")) : null;

  let expiring: { id: string; code: string; plate_number: string; registration_expiry: string | null; insurance_expiry: string | null }[] = [];
  if (perms.has("vehicles.view")) {
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, code, plate_number, registration_expiry, insurance_expiry")
      .is("archived_at", null)
      .or(`registration_expiry.lte.${in30},insurance_expiry.lte.${in30}`)
      .order("registration_expiry", { ascending: true, nullsFirst: false })
      .limit(10);
    if (error) throw error;
    expiring = data ?? [];
  }

  return (
    <>
      <PageHeader title="Tổng quan" description={`Hôm nay ${formatDate(today)} · Xin chào ${user.fullName || user.email}`} />

      {canShip ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Stat icon={CalendarDays} label="Chuyến hôm nay" value={todayCount} />
          <Stat icon={Truck} label="Chuyến trong tháng" value={monthCount} />
          <Stat icon={Clock} label="Chờ tài xế nhận / bị từ chối" value={waitingAccept} tone={waitingAccept ? "warning" : undefined} />
          <Stat icon={Truck} label="Đang thực hiện" value={inTransit} />
          <Stat icon={AlertTriangle} label="Đang trễ so với giờ giao dự kiến" value={lateCount} tone={lateCount ? "danger" : undefined} />
          <Stat icon={FileWarning} label="Tài xế đã hoàn thành – chờ chứng từ/quyết toán" value={waitingSettle} />
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {pendingApprovals !== null ? <Stat icon={BadgeCheck} label="Yêu cầu phê duyệt đang chờ" value={pendingApprovals} href="/phe-duyet" /> : null}
        {pendingUsers !== null ? (
          <Stat icon={UserCheck} label="Tài khoản chờ cấp quyền" value={pendingUsers} href="/nguoi-dung" tone={pendingUsers ? "warning" : undefined} />
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {perms.has("vehicles.view") ? (
          <Card>
            <CardHeader>
              <CardTitle>Giấy tờ xe sắp hết hạn (30 ngày)</CardTitle>
              <CardDescription>Đăng kiểm và bảo hiểm</CardDescription>
            </CardHeader>
            <CardContent>
              {expiring.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có xe nào sắp hết hạn giấy tờ.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {expiring.map((v) => (
                    <li key={v.id} className="flex justify-between py-2">
                      <span className="font-medium">{v.plate_number}</span>
                      <span className="text-muted-foreground">
                        {v.registration_expiry && v.registration_expiry <= in30 ? `Đăng kiểm: ${formatDate(v.registration_expiry)} ` : ""}
                        {v.insurance_expiry && v.insurance_expiry <= in30 ? `Bảo hiểm: ${formatDate(v.insurance_expiry)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Chỉ tiêu tài chính</CardTitle>
            <CardDescription>Chưa triển khai – Giai đoạn 7</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {["Doanh thu", "Chi phí", "Lợi nhuận", "Công nợ phải thu", "Công nợ phải trả", "Tạm ứng chưa quyết toán", "Chi phí theo xe", "Chi phí theo tài xế"].map(
              (k) => (
                <Badge key={k} variant="outline">{k}</Badge>
              ),
            )}
            <p className="mt-2 w-full text-sm text-muted-foreground">
              Các chỉ tiêu này sẽ được tính trực tiếp từ dữ liệu chuyến, chi phí và thanh toán khi các module tương ứng hoàn thành. Hệ thống không hiển thị số liệu ước đoán.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number | null;
  href?: string;
  tone?: "warning" | "danger";
}) {
  const body = (
    <Card className="h-full transition-colors hover:border-primary/40">
      <CardContent className="flex items-center gap-4">
        <div
          className={
            tone === "danger"
              ? "rounded-lg bg-destructive/10 p-2.5 text-destructive"
              : tone === "warning"
                ? "rounded-lg bg-warning/15 p-2.5 text-[oklch(0.5_0.12_70)]"
                : "rounded-lg bg-primary/10 p-2.5 text-primary"
          }
        >
          <Icon className="size-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums">{value?.toLocaleString("vi-VN") ?? "—"}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
