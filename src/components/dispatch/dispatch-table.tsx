import Link from "next/link";
import { ArrowRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { ASSIGNABLE_STATUSES, CANCELLABLE_STATUSES, LOCKED_STATUSES } from "@/lib/status";
import { isLate, type ShipmentListRow } from "@/lib/shipments";
import { StatusBadge } from "./status-badge";
import { AssignDialog } from "./assign-dialog";
import { CancelDialog } from "./cancel-dialog";
import { ResubmitTripButton, TripApprovalButtons } from "./trip-approval";

/** Bảng chuyến cho màn hình điều phối và chi tiết đơn hàng */
export function DispatchTable({
  rows,
  canAssign,
  canCancel,
  showOrder = true,
  emptyText = "Không có chuyến.",
}: {
  rows: ShipmentListRow[];
  canAssign: boolean;
  canCancel: boolean;
  /** Giữ để tương thích: luôn hiện ngày nhận */
  showDate?: boolean;
  showOrder?: boolean;
  emptyText?: string;
}) {
  if (rows.length === 0) return <p className="px-6 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  const now = new Date().getTime();
  const showActions = canAssign || canCancel || rows.some((r) => r.can_approve_dispatch);
  return (
    <div className="max-h-[calc(100dvh-12rem)] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-muted text-left text-xs whitespace-nowrap text-muted-foreground">
          <tr>
            <th className="py-2 pr-3 pl-4 font-medium">Ngày nhận</th>
            <th className="px-3 py-2 font-medium">{showOrder ? "Chuyến / Khách hàng" : "Mã chuyến"}</th>
            <th className="px-3 py-2 font-medium">Tuyến đường</th>
            <th className="px-3 py-2 font-medium">Xe / Tài xế</th>
            <th className="px-3 py-2 font-medium">Trạng thái</th>
            {showActions ? <th className="px-4 py-2 font-medium text-right">Thao tác</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
              <td className="py-1.5 pr-3 pl-4 whitespace-nowrap">
                <div className="font-medium">{formatDate(r.pickup_at)}</div>
                {r.expected_delivery_at && formatDate(r.expected_delivery_at) !== formatDate(r.pickup_at) ? (
                  <div className="text-xs text-muted-foreground">Giao {formatDate(r.expected_delivery_at)}</div>
                ) : null}
              </td>
              <td className="max-w-56 px-3 py-1.5">
                <Link href={`/chuyen-xe/${r.id}`} className="font-medium whitespace-nowrap text-primary hover:underline">
                  {r.shipment_code}
                </Link>
                {showOrder ? (
                  <div className="truncate" title={r.customer_name ?? undefined}>
                    {r.customer_code ?? r.customer_name}
                  </div>
                ) : null}
                <div className="truncate text-xs text-muted-foreground">
                  {showOrder ? (
                    <Link href={`/dieu-phoi/don-hang/${r.order_id}`} className="hover:text-primary hover:underline">
                      {r.order_code}
                    </Link>
                  ) : null}
                  {showOrder && r.vehicle_type_name ? " · " : null}
                  {r.vehicle_type_name}
                </div>
                {r.trip_order || r.plan_code ? (
                  <div className="truncate text-xs text-muted-foreground">
                    {r.trip_order ? <b className="text-primary">Thứ tự {r.trip_order}</b> : null}
                    {r.trip_order && r.plan_code ? " · " : null}
                    {r.plan_code ? <Link href={`/ke-hoach?q=${encodeURIComponent(r.plan_code)}`} className="hover:text-primary hover:underline">KH {r.plan_code}</Link> : null}
                  </div>
                ) : null}
              </td>
              <td className="max-w-60 px-3 py-1.5">
                <div className="truncate" title={r.pickup_name ?? undefined}>
                  {r.pickup_name}
                </div>
                <div className="flex items-center gap-1 text-muted-foreground" title={r.delivery_name ?? undefined}>
                  <ArrowRight className="size-3.5 shrink-0" />
                  <span className="truncate">{r.delivery_name}</span>
                </div>
                {r.empty_return_name ? (
                  <div className="truncate text-xs text-muted-foreground" title={`Điểm hạ rỗng: ${r.empty_return_name}`}>
                    Hạ rỗng: {r.empty_return_name}
                  </div>
                ) : null}
                {r.offroute_return_name ? (
                  <div className="truncate text-xs font-medium text-amber-700 dark:text-amber-400" title={`Điểm hạ rỗng trái tuyến: ${r.offroute_return_name}`}>
                    Hạ rỗng trái tuyến: {r.offroute_return_name}
                  </div>
                ) : null}
              </td>
              <td className="px-3 py-1.5 whitespace-nowrap">
                {r.driver_id ? (
                  <>
                    <div className="font-medium">
                      {r.plate_number ?? <span className="text-muted-foreground">Chưa chọn xe</span>}
                      {r.vehicle_day_order ? <DayOrder n={r.vehicle_day_order} /> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.driver_name}</div>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {r.plate_number ?? "Chưa phân công"}
                    {r.plate_number && r.vehicle_day_order ? <DayOrder n={r.vehicle_day_order} /> : null}
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5">
                <div className="flex flex-wrap gap-1">
                  <StatusBadge status={r.status} />
                  {r.dispatch_approval === "pending" || r.dispatch_approval === "rejected" ? <StatusBadge kind="approval" status={r.dispatch_approval} /> : null}
                  {isLate(r, now) ? <Badge variant="destructive">Trễ giờ giao</Badge> : null}
                </div>
                {r.dispatch_approval === "rejected" && r.dispatch_reject_reason ? (
                  <div className="mt-0.5 max-w-52 truncate text-xs text-destructive" title={r.dispatch_reject_reason}>
                    Lý do: {r.dispatch_reject_reason}
                  </div>
                ) : null}
              </td>
              {showActions ? (
                <td className="px-4 py-1.5">
                  <div className="flex justify-end gap-1">
                    {r.can_approve_dispatch && r.dispatch_approval_request_id ? (
                      <TripApprovalButtons compact requestIds={[r.dispatch_approval_request_id]} label={r.shipment_code} />
                    ) : null}
                    {canAssign && r.dispatch_approval === "rejected" && r.status === "assigned" ? (
                      <ResubmitTripButton compact shipmentId={r.id} shipmentCode={r.shipment_code} reason={r.dispatch_reject_reason} />
                    ) : null}
                    {canAssign && ASSIGNABLE_STATUSES.includes(r.status) ? (
                      <AssignDialog
                        compact
                        shipmentId={r.id}
                        shipmentCode={r.shipment_code}
                        driverId={r.driver_id}
                        driverLabel={r.driver_name ? `${r.driver_name} (${r.driver_code})` : null}
                        vehicleId={r.vehicle_id}
                        vehicleLabel={r.plate_number}
                        pickupAt={r.pickup_at}
                      />
                    ) : null}
                    {canAssign && !LOCKED_STATUSES.includes(r.status) ? (
                      <Button asChild variant="ghost" size="sm" className="h-7 px-2" title={`Sửa toàn bộ đơn ${r.order_code}, mở tới chuyến ${r.shipment_code}`}>
                        <Link href={`/dieu-phoi/don-hang/${r.order_id}/sua#chuyen-${r.shipment_code}`}>
                          <Pencil /> Sửa
                        </Link>
                      </Button>
                    ) : null}
                    {canCancel && CANCELLABLE_STATUSES.includes(r.status) ? <CancelDialog compact shipmentId={r.id} shipmentCode={r.shipment_code} /> : null}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Thứ tự chuyến của xe trong ngày */
function DayOrder({ n }: { n: number }) {
  return (
    <Badge variant="info" className="ml-1.5 px-1.5 py-0 align-middle" title={`Chuyến thứ ${n} của xe trong ngày`}>
      Chuyến {n}
    </Badge>
  );
}
