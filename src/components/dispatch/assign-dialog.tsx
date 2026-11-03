"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, UserPlus, UserRoundPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { ReferenceSelect } from "@/components/entities/reference-select";
import { assignShipment, vehicleDefaultDriver } from "@/app/(app)/dieu-phoi/actions";
import { todayVN } from "@/lib/format";
import { VehicleDayConflict, type VehicleDayState } from "./vehicle-day-conflict";
import { MonthTripHint } from "./month-trip-hint";
import { VehicleSourcePicker, type VehicleSource } from "./vehicle-source-picker";

/** Phân công / đổi / gỡ tài xế và xe cho một chuyến */
export function AssignDialog({
  shipmentId,
  shipmentCode,
  driverId,
  driverLabel,
  vehicleId,
  vehicleLabel,
  pickupAt,
  compact,
}: {
  shipmentId: string;
  shipmentCode: string;
  driverId: string | null;
  driverLabel?: string | null;
  vehicleId: string | null;
  vehicleLabel?: string | null;
  /** Giờ nhận hàng của chuyến (ISO), để cảnh báo xe đã có chuyến cùng ngày */
  pickupAt: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [driver, setDriver] = useState({ id: driverId ?? "", label: driverLabel ?? "" });
  const [vehicle, setVehicle] = useState({ id: vehicleId ?? "", label: vehicleLabel ?? "" });
  const [driverKey, setDriverKey] = useState(0);
  const [dayState, setDayState] = useState<VehicleDayState>({ blocked: false, order: null, others: [] });
  const [source, setSource] = useState<VehicleSource>("internal");
  const is3pl = source === "3pl";
  const vehicleChanged = vehicle.id !== (vehicleId ?? "");
  // Xe 3PL không xếp thứ tự xe, không cảnh báo trùng ngày
  const blocked = !is3pl && dayState.blocked;
  const [pending, start] = useTransition();
  const router = useRouter();

  function save(unassign = false) {
    start(async () => {
      const r = await assignShipment({
        shipmentId,
        driverId: unassign ? "" : driver.id,
        vehicleId: vehicle.id,
        // Đổi xe: ghi thứ tự mới (hoặc bỏ thứ tự khi xe mới không có chuyến khác cùng ngày)
        ...(vehicleChanged ? { vehicleDayOrder: vehicle.id && !is3pl ? dayState.order : null, otherOrders: is3pl ? [] : dayState.others } : {}),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setOpen(false);
      router.refresh();
    });
  }

  function pickVehicle(id: string, label: string) {
    setVehicle({ id, label });
    // Gợi ý tài xế phụ trách xe nếu chưa chọn tài xế; xe 3PL luôn lấy tài xế của nhà xe
    if (id && (!driver.id || is3pl)) {
      vehicleDefaultDriver(id).then((r) => {
        if (r.ok && r.data?.driverId && r.data.driverId !== driver.id) {
          setDriver({ id: r.data.driverId, label: "" });
          setDriverKey((k) => k + 1);
        }
      });
    }
  }

  const assigned = Boolean(driverId);
  return (
    <>
      <Button variant={assigned ? "ghost" : "outline"} size="sm" className={compact ? "h-7 px-2" : undefined} onClick={() => setOpen(true)}>
        {assigned ? <UserRoundPen /> : <UserPlus />} {assigned ? "Đổi" : "Phân công"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Phân công chuyến {shipmentCode}</DialogTitle>
            <DialogDescription>Chọn Xe nội bộ hoặc Xe 3-PL, chọn xe trước, hệ thống gợi ý tài xế phụ trách xe đó. Tài xế được thông báo trên ứng dụng tài xế.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`v-${shipmentId}`}>Xe</Label>
              <VehicleSourcePicker id={`v-${shipmentId}`} value={vehicle.id} initialLabel={vehicle.label} onChange={pickVehicle} onSourceChange={setSource} />
              {is3pl ? null : (
                <>
                  {/* Chỉ kiểm tra khi chọn xe khác xe đang gắn với chuyến */}
                  <VehicleDayConflict
                    vehicleId={vehicleChanged ? vehicle.id : ""}
                    day={todayVN(new Date(pickupAt))}
                    excludeShipmentId={shipmentId}
                    onStateChange={setDayState}
                  />
                  <MonthTripHint kind="vehicle" id={vehicle.id} day={todayVN(new Date(pickupAt))} excludeShipmentId={shipmentId} />
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`d-${shipmentId}`}>Tài xế</Label>
              <ReferenceSelect
                key={driverKey}
                id={`d-${shipmentId}`}
                refKey="drivers"
                value={driver.id}
                initialLabel={driver.label}
                onChange={(id, label) => setDriver({ id, label })}
              />
              {is3pl ? null : <MonthTripHint kind="driver" id={driver.id} day={todayVN(new Date(pickupAt))} excludeShipmentId={shipmentId} />}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {assigned ? (
              <Button variant="outline" disabled={pending} onClick={() => save(true)}>
                Gỡ phân công
              </Button>
            ) : (
              <span />
            )}
            <Button disabled={pending || !driver.id || blocked} title={blocked ? "Xe đã có chuyến cùng ngày: tích \"Vẫn giao cho xe này\" và nhập thứ tự chuyến để lưu" : undefined} onClick={() => save()}>
              {pending ? <Loader2 className="animate-spin" /> : null} Lưu phân công
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
