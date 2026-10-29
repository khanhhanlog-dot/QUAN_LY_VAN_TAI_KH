import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/entities/record";
import { formatDateTime, formatNumber, formatVND } from "@/lib/format";
import { ASSIGNABLE_STATUSES, CANCELLABLE_STATUSES, PRICING_UNITS, documentStatus, settlementStatus, shipmentStatus } from "@/lib/status";
import { isLate, type ShipmentListRow } from "@/lib/shipments";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/dispatch/status-badge";
import { AssignDialog } from "@/components/dispatch/assign-dialog";
import { CancelDialog } from "@/components/dispatch/cancel-dialog";
import { shipmentCustomFields } from "@/lib/shipments-query";
import { CustomFieldsCard } from "./custom-fields-card";
import { ShipmentExpenseButton } from "./expense-button";
import { DocumentsButton } from "@/components/finance/documents-button";
import { MONEY_STATUS, PAID_BY } from "@/lib/entities/definitions";
import { TONE_BADGE } from "@/lib/tones";
import { loadCustomFields, visibleCustomRows } from "@/lib/entities/server";

export const metadata: Metadata = { title: "Chi tiết chuyến" };

type Extra = {
  pricing_snapshot: Record<string, unknown>;
  cancel_reason: string | null;
  cancelled_at: string | null;
  created_at: string;
  created_by: string | null;
  arrived_pickup_at: string | null;
  departed_pickup_at: string | null;
  arrived_delivery_at: string | null;
  completed_at: string | null;
  actual_km: number | null;
  delivery_result: string | null;
  completion_note: string | null;
  expense_declaration: "none" | "has" | null;
  expense_declared_at: string | null;
};
type History = { id: number; status_field: string; from_status: string | null; to_status: string; changed_by: string | null; changed_at: string; note: string | null };
type Assignment = {
  id: string;
  response: string;
  assigned_at: string;
  responded_at: string | null;
  assigned_by: string | null;
  driver: { full_name: string; code: string } | null;
  vehicle: { plate_number: string } | null;
};
type Expense = { id: string; code: string; category_name: string; amount: number; status: string; paid_by: string; incurred_at: string; file_count: number; note: string | null };
const RESULT_LABEL: Record<string, string> = { full: "Giao đủ", partial: "Giao thiếu", failed: "Không giao được" };
type Change = { occurred_at: string; actor_name: string | null; field: string; old_value: string | null; new_value: string | null };

const FIELD_LABELS: Record<string, string> = {
  unit_price: "Đơn giá",
  quantity: "Số lượng",
  surcharge_amount: "Phụ phí",
  fuel_support_rate: "Tỷ lệ hỗ trợ dầu (%)",
  fuel_support_amount: "Tiền hỗ trợ dầu",
  price_list_id: "Bảng giá",
  pricing_unit: "Đơn vị tính",
  vehicle_id: "Xe",
  driver_id: "Tài xế",
  pickup_at: "Giờ nhận hàng",
  expected_delivery_at: "Giờ giao dự kiến",
  notes: "Ghi chú",
};
const MONEY_FIELDS = new Set(["unit_price", "surcharge_amount", "fuel_support_amount"]);
const ASSIGN_RESPONSE: Record<string, { label: string; variant: "warning" | "info" | "muted" }> = {
  pending: { label: "Chờ tài xế nhận", variant: "warning" },
  accepted: { label: "Tài xế đã nhận", variant: "info" },
  superseded: { label: "Đã thay thế / gỡ", variant: "muted" },
};
const FUEL_SOURCE: Record<string, string> = {
  manual: "nhập tay khi tạo chuyến",
  price_list: "theo bảng giá",
  "rule:customer_route": "quy tắc theo khách hàng và tuyến",
  "rule:route": "quy tắc theo tuyến",
  "rule:customer": "quy tắc theo khách hàng",
  "rule:vehicle_type": "quy tắc theo loại xe",
  "rule:default": "quy tắc mặc định",
  none: "không có quy tắc",
};
const FUEL_BASE: Record<string, string> = {
  freight_revenue: "doanh thu cước",
  unit_price: "đơn giá",
  total_revenue: "doanh thu cước + phụ phí",
  fuel_norm: "định mức nhiên liệu",
  formula: "công thức",
};
const STATUS_FIELD: Record<string, { name: string; label: (v: string) => string }> = {
  status: { name: "Vận hành", label: (v) => shipmentStatus(v).label },
  document_status: { name: "Chứng từ", label: (v) => documentStatus(v).label },
  settlement_status: { name: "Quyết toán", label: (v) => settlementStatus(v).label },
};

function fmtChange(field: string, v: string | null): string {
  if (v === null || v === "") return "(trống)";
  if (MONEY_FIELDS.has(field)) return formatVND(v);
  if (field === "pickup_at" || field === "expected_delivery_at") return formatDateTime(v);
  if (field === "vehicle_id" || field === "driver_id" || field === "price_list_id") return "(đã đổi)";
  if (field === "pricing_unit") return PRICING_UNITS[v] ?? v;
  return /^-?\d+(\.\d+)?$/.test(v) ? formatNumber(v) : v;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const me = await requirePagePermission("shipments.view", "dispatch.view");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const canExpenses = me.permissions.has("expenses.view");
  const [custom, rowRes, extraRes, histRes, asgRes, changeRes, expRes, docRes, expenseFields] = await Promise.all([
    shipmentCustomFields(supabase, me.permissions),
    supabase.from("shipment_list").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("shipments")
      .select(
        "pricing_snapshot, cancel_reason, cancelled_at, created_at, created_by, arrived_pickup_at, departed_pickup_at, arrived_delivery_at, completed_at, actual_km, delivery_result, completion_note, expense_declaration, expense_declared_at",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("shipment_status_history").select("id, status_field, from_status, to_status, changed_by, changed_at, note").eq("shipment_id", id).order("changed_at").order("id"),
    supabase
      .from("shipment_assignments")
      .select("id, response, assigned_at, responded_at, assigned_by, driver:drivers(full_name, code), vehicle:vehicles(plate_number)")
      .eq("shipment_id", id)
      .order("assigned_at", { ascending: false }),
    supabase.rpc("shipment_change_history", { p_shipment_id: id }),
    canExpenses
      ? supabase.from("expense_list").select("id, code, category_name, amount, status, paid_by, incurred_at, file_count, note").eq("shipment_id", id).order("incurred_at")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("entity_type", "shipment").eq("entity_id", id).is("archived_at", null),
    loadCustomFields(supabase, "expenses"),
  ]);
  for (const r of [rowRes, extraRes, histRes, asgRes, changeRes]) if (r.error) throw r.error;
  const s = rowRes.data as ShipmentListRow | null;
  const x = extraRes.data as Extra | null;
  if (!s || !x) notFound();
  const history = (histRes.data ?? []) as History[];
  const assignments = (asgRes.data ?? []) as unknown as Assignment[];
  const changes = (changeRes.data ?? []) as Change[];
  const expenses = (expRes.data ?? []) as Expense[];
  const docCount = docRes.count ?? 0;
  const approvedCost = expenses.filter((e) => e.status === "approved").reduce((a, e) => a + Number(e.amount), 0);
  const pendingCost = expenses.filter((e) => e.status === "pending").reduce((a, e) => a + Number(e.amount), 0);

  const actorIds = [...new Set([x.created_by, ...history.map((h) => h.changed_by), ...assignments.map((a) => a.assigned_by)].filter((v): v is string => Boolean(v)))];
  const { data: nameRows } = actorIds.length ? await supabase.rpc("user_display_names", { p_ids: actorIds }) : { data: [] };
  const names = new Map(((nameRows ?? []) as { id: string; display_name: string }[]).map((n) => [n.id, n.display_name]));
  const who = (uid: string | null) => (uid ? (names.get(uid) ?? "Người dùng") : "Hệ thống");

  const snap = x.pricing_snapshot ?? {};
  const canAssign = me.permissions.has("dispatch.update") && ASSIGNABLE_STATUSES.includes(s.status);
  const canCancel = (me.permissions.has("dispatch.delete") || me.permissions.has("shipments.delete")) && CANCELLABLE_STATUSES.includes(s.status);
  const unit = PRICING_UNITS[s.pricing_unit] ?? s.pricing_unit;

  return (
    <>
      <Link href="/chuyen-xe" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Quản lý chuyến xe
      </Link>
      <PageHeader
        title={`Chuyến ${s.shipment_code}`}
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={s.status} />
            <StatusBadge kind="document" status={s.document_status} />
            <StatusBadge kind="settlement" status={s.settlement_status} />
            {isLate(s) ? <Badge variant="destructive">Trễ giờ giao</Badge> : null}
          </span>
        }
        actions={
          <>
            {canAssign ? (
              <AssignDialog
                shipmentId={s.id}
                shipmentCode={s.shipment_code}
                driverId={s.driver_id}
                driverLabel={s.driver_name ? `${s.driver_name} (${s.driver_code})` : null}
                vehicleId={s.vehicle_id}
                vehicleLabel={s.plate_number}
                pickupAt={s.pickup_at}
              />
            ) : null}
            {canCancel ? <CancelDialog shipmentId={s.id} shipmentCode={s.shipment_code} /> : null}
          </>
        }
      />

      {s.status === "cancelled" ? (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          Đã hủy lúc {formatDateTime(x.cancelled_at)}. Lý do: <b>{x.cancel_reason}</b>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Thông tin chuyến</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Item label="Đơn hàng">
                <Link href={`/dieu-phoi/don-hang/${s.order_id}`} className="text-primary hover:underline">
                  {s.order_code}
                </Link>{" "}
                <span className="text-muted-foreground">(chuyến thứ {s.sequence_in_order})</span>
              </Item>
              <Item label="Khách hàng">{s.customer_name}</Item>
              <Item label="Tuyến">
                <span className="flex flex-wrap items-center gap-1">
                  {s.pickup_name} <ArrowRight className="size-3.5 text-muted-foreground" /> {s.delivery_name}
                </span>
                {snap.route_name ? (
                  <span className="text-xs text-muted-foreground">
                    Tuyến {String(snap.route_name)}
                    {snap.route_distance_km ? `, ${formatNumber(snap.route_distance_km as number)} km` : ""}
                  </span>
                ) : null}
              </Item>
              <Item label="Loại xe">{s.vehicle_type_name ?? "–"}</Item>
              <Item label="Giờ nhận hàng">{formatDateTime(s.pickup_at)}</Item>
              <Item label="Giờ giao dự kiến">{s.expected_delivery_at ? formatDateTime(s.expected_delivery_at) : "–"}</Item>
              <Item label="Xe">{s.plate_number ?? "Chưa chọn"}</Item>
              <Item label="Tài xế">{s.driver_name ? `${s.driver_name} (${s.driver_code})` : "Chưa phân công"}</Item>
              {s.notes ? (
                <div className="sm:col-span-2">
                  <Item label="Ghi chú">{s.notes}</Item>
                </div>
              ) : null}
              <Item label="Người tạo">
                {who(x.created_by)} <span className="text-muted-foreground">· {formatDateTime(x.created_at)}</span>
              </Item>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Doanh thu chuyến</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Line label={`Cước (${formatNumber(s.quantity)} ${unit} × ${formatVND(s.unit_price)})`} value={formatVND(s.freight_amount)} />
            <Line label="Phụ phí" value={formatVND(s.surcharge_amount)} />
            <Line label={s.fuel_support_rate !== null ? `Hỗ trợ dầu ${formatNumber(s.fuel_support_rate)}%` : "Hỗ trợ dầu"} value={formatVND(s.fuel_support_amount)} />
            <div className="border-t pt-2">
              <Line label="Tổng doanh thu" value={<b className="text-primary">{formatVND(s.total_revenue)}</b>} />
            </div>
            <div className="space-y-1 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
              <p>
                Giá:{" "}
                {snap.price_source === "price_list"
                  ? `bảng giá ${String(snap.price_list_code)} (mức cụ thể ${String(snap.price_specificity)}, ưu tiên ${String(snap.price_priority)})`
                  : snap.price_source === "manual"
                    ? "nhập tay (không có bảng giá phù hợp)"
                    : "dữ liệu nhập trước Giai đoạn 4"}
              </p>
              {snap.fuel_source ? (
                <p>
                  Hỗ trợ dầu: {FUEL_SOURCE[String(snap.fuel_source)] ?? String(snap.fuel_source)}
                  {s.fuel_support_base ? `, tính trên ${FUEL_BASE[s.fuel_support_base] ?? s.fuel_support_base}` : ""}
                </p>
              ) : null}
              {snap.quoted_at ? <p>Chụp giá lúc {formatDateTime(String(snap.quoted_at))}; bảng giá đổi sau này không làm đổi chuyến.</p> : null}
            </div>
            {canExpenses ? (
              <div className="space-y-2 border-t pt-2">
                <Line label="Chi phí đã duyệt" value={formatVND(approvedCost)} />
                {pendingCost ? <Line label="Chi phí chờ duyệt (chưa tính)" value={formatVND(pendingCost)} /> : null}
                <Line label="Lợi nhuận gộp" value={<b>{formatVND(Number(s.total_revenue) - approvedCost)}</b>} />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <CustomFieldsCard
          shipmentId={s.id}
          version={s.version}
          fields={custom.defs}
          values={s.custom_fields ?? {}}
          canEdit={me.permissions.has("shipments.update") || me.permissions.has("dispatch.update")}
          canAddField={me.permissions.has("fields.configure")}
        />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Lịch sử trạng thái</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="relative space-y-3 border-l pl-4 text-sm">
              {history.map((h) => {
                const f = STATUS_FIELD[h.status_field] ?? STATUS_FIELD.status;
                return (
                  <li key={h.id}>
                    <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-card bg-primary" />
                    <div>
                      <span className="text-muted-foreground">{f.name}: </span>
                      {h.from_status ? (
                        <>
                          {f.label(h.from_status)} <ArrowRight className="inline size-3.5 text-muted-foreground" />{" "}
                        </>
                      ) : null}
                      <b>{f.label(h.to_status)}</b>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(h.changed_at)} · {who(h.changed_by)}
                      {h.note ? ` · ${h.note}` : ""}
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lịch sử phân công</CardTitle>
          </CardHeader>
          <CardContent>
            {assignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa phân công lần nào.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {assignments.map((a) => {
                  const r = ASSIGN_RESPONSE[a.response] ?? { label: a.response, variant: "muted" as const };
                  return (
                    <li key={a.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{a.driver ? `${a.driver.full_name} (${a.driver.code})` : "Tài xế"}</b>
                        {a.vehicle ? <span className="text-muted-foreground">· {a.vehicle.plate_number}</span> : null}
                        <Badge variant={r.variant}>{r.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Phân công {formatDateTime(a.assigned_at)} bởi {who(a.assigned_by)}
                        {a.responded_at ? ` · cập nhật ${formatDateTime(a.responded_at)}` : ""}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Lịch sử thay đổi giá, khối lượng, xe, tài xế</CardTitle>
          </CardHeader>
          <CardContent>
            {changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có thay đổi nào sau khi tạo chuyến.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Thời gian</th>
                      <th className="py-1.5 pr-3 font-medium">Người sửa</th>
                      <th className="py-1.5 pr-3 font-medium">Trường</th>
                      <th className="py-1.5 pr-3 font-medium">Giá trị cũ</th>
                      <th className="py-1.5 font-medium">Giá trị mới</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((c, i) => (
                      <tr key={i} className="border-t">
                        <td className="py-1.5 pr-3 whitespace-nowrap">{formatDateTime(c.occurred_at)}</td>
                        <td className="py-1.5 pr-3">{c.actor_name ?? "Hệ thống"}</td>
                        <td className="py-1.5 pr-3">{FIELD_LABELS[c.field] ?? c.field}</td>
                        <td className="py-1.5 pr-3 text-muted-foreground">{fmtChange(c.field, c.old_value)}</td>
                        <td className="py-1.5">{fmtChange(c.field, c.new_value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Giao hàng và chứng từ</CardTitle>
            <DocumentsButton
              entityType="shipment"
              entityId={s.id}
              count={docCount}
              title={`Chứng từ chuyến ${s.shipment_code}`}
              canUpload={me.permissions.has("documents.create")}
              variant="outline"
            />
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {x.completed_at ? (
              <>
                <Line label="Hoàn thành lúc" value={formatDateTime(x.completed_at)} />
                {x.delivery_result ? <Line label="Kết quả" value={RESULT_LABEL[x.delivery_result] ?? x.delivery_result} /> : null}
                {x.completion_note ? <p className="rounded-md bg-muted/50 p-2">Ghi chú tài xế: {x.completion_note}</p> : null}
                {x.expense_declaration ? (
                  <Line label="Chi phí tài xế" value={x.expense_declaration === "none" ? "Tài xế xác nhận không phát sinh chi phí" : "Tài xế khai có chi phí (xem mục Chi phí)"} />
                ) : null}
              </>
            ) : x.departed_pickup_at ? (
              <Line label="Bắt đầu chạy lúc" value={formatDateTime(x.departed_pickup_at)} />
            ) : (
              <p className="text-muted-foreground">Tài xế chưa bắt đầu chạy.</p>
            )}
            <Line label="Ảnh, chứng từ đã nộp" value={`${docCount} tệp`} />
          </CardContent>
        </Card>

        {canExpenses ? (
          <Card className="lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Chi phí chuyến</CardTitle>
              {me.permissions.has("expenses.create") ? (
                <ShipmentExpenseButton
                  shipment={{ id: s.id, label: s.shipment_code, driverId: s.driver_id, driverLabel: s.driver_name }}
                  customRows={visibleCustomRows(expenseFields, me.permissions)}
                  canAddField={me.permissions.has("fields.configure")}
                />
              ) : null}
            </CardHeader>
            <CardContent>
              {expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có chi phí.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3">Mã</th>
                        <th className="py-1 pr-3">Loại</th>
                        <th className="py-1 pr-3 text-right">Số tiền</th>
                        <th className="py-1 pr-3">Người trả</th>
                        <th className="py-1 pr-3">Trạng thái</th>
                        <th className="py-1 pr-3">Ngày</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((e) => {
                        const st = MONEY_STATUS.find((o) => o.value === e.status);
                        return (
                          <tr key={e.id} className="border-t">
                            <td className="py-1.5 pr-3 font-mono text-xs">{e.code}</td>
                            <td className="py-1.5 pr-3">
                              {e.category_name}
                              {e.note ? <span className="block text-xs text-muted-foreground">{e.note}</span> : null}
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{formatVND(e.amount)}</td>
                            <td className="py-1.5 pr-3">{PAID_BY.find((o) => o.value === e.paid_by)?.label}</td>
                            <td className="py-1.5 pr-3">{st ? <Badge variant={TONE_BADGE[st.tone!]}>{st.label}</Badge> : e.status}</td>
                            <td className="py-1.5 pr-3">{formatDateTime(e.incurred_at)}</td>
                            <td className="py-1.5 text-right">
                              <DocumentsButton entityType="shipment_expense" entityId={e.id} count={Number(e.file_count)} title={`Chứng từ ${e.code}`} />
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
        ) : null}
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
