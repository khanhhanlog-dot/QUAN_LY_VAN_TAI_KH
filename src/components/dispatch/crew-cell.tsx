"use client";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { ReferenceSelect } from "@/components/entities/reference-select";
import {
  assignShipment,
  assignShipment3pl,
  correctShipmentCrew,
  shipment3plInfo,
  vehicleDefaultDriver,
  type Shipment3plInfo,
} from "@/app/(app)/dieu-phoi/actions";
import { compactUpper } from "@/lib/entities/record";
import { todayVN } from "@/lib/format";
import { ASSIGNABLE_STATUSES } from "@/lib/status";
import { CORRECT_CREW_STATUSES } from "@/lib/crew-change";
import type { ShipmentListRow } from "@/lib/shipments";
import { cn } from "@/lib/utils";
import { VehicleDayConflict, type VehicleDayState } from "./vehicle-day-conflict";
import { VehicleSourcePicker, type VehicleSource } from "./vehicle-source-picker";

type Focus = "vehicle" | "driver";
type Mode = "assign" | "correct";

/** Chuyến này sửa xe / tài xế ngay trên bảng được không, và theo cách nào */
export function crewEditMode(r: ShipmentListRow): Mode | null {
  if (ASSIGNABLE_STATUSES.includes(r.status)) return "assign";
  if (CORRECT_CREW_STATUSES.includes(r.status)) return "correct";
  return null;
}

/**
 * Ô Xe / Tài xế (cả cột Biển số, Tài xế) trên bảng Điều phối và Quản lý chuyến: bấm vào là gõ số xe / tên tài xế ngay.
 * Vẫn theo đúng quy tắc cũ: phân công qua assign_shipment (đổi tài xế thì chờ Giám đốc duyệt lại, chỉ đổi xe thì giữ duyệt),
 * xe trùng ngày phải xác nhận và nhập thứ tự, chuyến 3PL nhập chữ tự do (số xe, tài xế, SĐT),
 * chuyến đang chạy / đã giao thì phải ghi lý do sửa.
 */
export function CrewCell({ r, editable, focus = "vehicle", children }: { r: ShipmentListRow; editable: boolean; focus?: Focus; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const mode = editable ? crewEditMode(r) : null;
  if (!mode) return <>{children}</>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`Bấm để nhập ${focus === "driver" ? "tài xế" : "số xe, tài xế"} cho chuyến ${r.shipment_code}`}
          className={cn(
            "block w-full min-w-0 rounded border border-dashed border-transparent px-1 py-0.5 text-left hover:border-muted-foreground/50 hover:bg-background",
            open && "border-ring bg-background",
          )}
        >
          {children || <span className="text-xs text-muted-foreground">Nhập</span>}
        </button>
      </PopoverAnchor>
      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
        {open ? <CrewEditor r={r} mode={mode} focus={focus} onDone={() => setOpen(false)} /> : null}
      </PopoverContent>
    </Popover>
  );
}

type Form3pl = { supplierId: string; supplierName: string; plate: string; driverName: string; driverPhone: string; nationalId: string; licenseNo: string };

function from3plInfo(i: Shipment3plInfo): Form3pl {
  return {
    supplierId: i.supplier_id ?? "",
    supplierName: i.supplier_name ?? "",
    plate: i.is_3pl ? (i.plate ?? "") : "",
    driverName: i.is_3pl ? (i.driver_name ?? "") : "",
    driverPhone: i.is_3pl ? (i.driver_phone ?? "") : "",
    nationalId: i.is_3pl ? (i.national_id ?? "") : "",
    licenseNo: i.is_3pl ? (i.license_no ?? "") : "",
  };
}

function CrewEditor({ r, mode, focus, onDone }: { r: ShipmentListRow; mode: Mode; focus: Focus; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [vehicle, setVehicle] = useState({ id: r.vehicle_id ?? "", label: r.plate_number ?? "" });
  const [driver, setDriver] = useState({ id: r.driver_id ?? "", label: r.driver_name ? `${r.driver_name}${r.driver_code ? ` (${r.driver_code})` : ""}` : "" });
  const [driverKey, setDriverKey] = useState(0);
  const [dayState, setDayState] = useState<VehicleDayState>({ blocked: false, order: null, others: [] });
  const [reason, setReason] = useState("");
  // assign: null = đang kiểm tra chuyến có nhà xe 3PL không
  const [kind, setKind] = useState<"internal" | "3pl" | null>(mode === "assign" ? null : "internal");
  const [source, setSource] = useState<VehicleSource>("internal");
  const [f3, setF3] = useState<Form3pl | null>(null);
  const day = todayVN(new Date(r.pickup_at));
  const vehicleChanged = vehicle.id !== (r.vehicle_id ?? "");
  const driverChanged = driver.id !== (r.driver_id ?? "");
  const changed = vehicleChanged || driverChanged;

  useEffect(() => {
    if (mode !== "assign") return;
    let alive = true;
    shipment3plInfo(r.id).then((res) => {
      if (!alive) return;
      const info = res.ok ? res.data : null;
      if (info && (info.supplier_id || info.is_3pl)) {
        setF3(from3plInfo(info));
        setKind("3pl");
      } else setKind("internal");
    });
    return () => {
      alive = false;
    };
  }, [mode, r.id]);

  function pickVehicle(id: string, label: string) {
    setVehicle({ id, label });
    // Gợi ý tài xế phụ trách xe khi chuyến chưa có tài xế
    if (id && !driver.id) {
      vehicleDefaultDriver(id).then((res) => {
        if (res.ok && res.data?.driverId) {
          setDriver({ id: res.data.driverId, label: "" });
          setDriverKey((k) => k + 1);
        }
      });
    }
  }

  function done(res: { ok: boolean; error?: string; message?: string }) {
    if (!res.ok) return void toast.error(res.error ?? "Không lưu được");
    toast.success(`${r.shipment_code}: ${res.message ?? "đã lưu"}`);
    onDone();
    router.refresh();
  }

  const is3pl = kind === "3pl";
  const blockedDay = vehicleChanged && !is3pl && source !== "3pl" && dayState.blocked;
  const canSave =
    !pending &&
    kind !== null &&
    (is3pl
      ? Boolean(f3?.supplierId)
      : mode === "assign"
        ? Boolean(driver.id) && changed && !blockedDay
        : Boolean(vehicle.id && driver.id) && changed && reason.trim().length >= 3);

  function save() {
    if (!canSave) return;
    start(async () => {
      if (is3pl && f3) {
        return done(
          await assignShipment3pl({
            shipmentId: r.id,
            supplierId: f3.supplierId,
            plate: f3.plate,
            driverName: f3.driverName,
            driverPhone: f3.driverPhone,
            nationalId: f3.nationalId,
            licenseNo: f3.licenseNo,
          }),
        );
      }
      if (mode === "assign")
        return done(
          await assignShipment({
            shipmentId: r.id,
            driverId: driver.id,
            vehicleId: vehicle.id,
            ...(vehicleChanged ? { vehicleDayOrder: vehicle.id ? dayState.order : null, otherOrders: dayState.others } : {}),
          }),
        );
      done(await correctShipmentCrew({ shipmentId: r.id, vehicleId: vehicle.id, driverId: driver.id, reason }));
    });
  }

  const set3 = (patch: Partial<Form3pl>) => setF3((x) => (x ? { ...x, ...patch } : x));
  const id = (s: string) => `crew-${s}-${r.id}`;

  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onDone();
      }}
    >
      <div className="text-xs font-semibold text-foreground">
        {mode === "correct" ? "Sửa xe, tài xế" : is3pl ? "Xe, tài xế 3PL" : "Phân công xe, tài xế"} · {r.shipment_code}
      </div>

      {kind === null ? (
        <p className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Đang tải…
        </p>
      ) : is3pl && f3 ? (
        <>
          <div className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-2 py-1.5 text-xs text-violet-900">
            <Truck className="size-3.5 shrink-0" />
            {f3.supplierId ? (
              <b>3-PL {f3.supplierName}</b>
            ) : (
              <div className="min-w-0 flex-1">
                <ReferenceSelect id={id("sp")} refKey="suppliers" value={f3.supplierId} onChange={(sid, label) => set3({ supplierId: sid, supplierName: sid ? label : "" })} />
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor={id("p3")}>Số xe</Label>
              <Input
                id={id("p3")}
                autoFocus={focus === "vehicle"}
                value={f3.plate}
                maxLength={20}
                placeholder="61K31295"
                className="h-8"
                onChange={(e) => set3({ plate: compactUpper(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={id("n3")}>Tài xế</Label>
              <Input
                id={id("n3")}
                autoFocus={focus === "driver"}
                value={f3.driverName}
                maxLength={150}
                placeholder="Nguyễn Văn A"
                className="h-8"
                onChange={(e) => set3({ driverName: e.target.value })}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor={id("t3")}>SĐT tài xế</Label>
              <Input id={id("t3")} value={f3.driverPhone} maxLength={20} inputMode="tel" placeholder="0909123456" className="h-8" onChange={(e) => set3({ driverPhone: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Không bắt buộc. CCCD, GPLX nhập ở nút Đổi. Enter để lưu.</p>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <Label htmlFor={id("v")}>Số xe</Label>
            {mode === "correct" ? (
              <VehicleSourcePicker
                id={id("v")}
                shipmentId={r.id}
                value={vehicle.id}
                initialLabel={vehicle.label}
                onChange={(vid, label) => setVehicle({ id: vid, label })}
                onSourceChange={setSource}
                autoOpen={focus === "vehicle"}
              />
            ) : (
              <ReferenceSelect id={id("v")} refKey="vehicles_internal" value={vehicle.id} initialLabel={vehicle.label} onChange={pickVehicle} autoOpen={focus === "vehicle"} />
            )}
            {mode === "assign" ? <VehicleDayConflict vehicleId={vehicleChanged ? vehicle.id : ""} day={day} excludeShipmentId={r.id} onStateChange={setDayState} /> : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor={id("d")}>Tài xế</Label>
            <ReferenceSelect
              key={`${driverKey}-${source}`}
              id={id("d")}
              refKey={source === "3pl" ? "drivers" : "drivers_internal"}
              value={driver.id}
              initialLabel={driver.label}
              onChange={(did, label) => setDriver({ id: did, label })}
              autoOpen={focus === "driver" && driverKey === 0}
            />
          </div>
          {mode === "correct" ? (
            <div className="space-y-1">
              <Label htmlFor={id("r")}>Lý do sửa *</Label>
              <Input id={id("r")} value={reason} maxLength={500} className="h-8" placeholder="Ví dụ: Nhập nhầm, người chạy thực tế là anh Minh" onChange={(e) => setReason(e.target.value)} />
              <p className="text-xs text-muted-foreground">Chuyến đang chạy / đã giao: trạng thái giữ nguyên, lần sửa được ghi nhật ký.</p>
            </div>
          ) : driverChanged && driver.id ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">Đổi tài xế: chuyến chờ Giám đốc duyệt lại (nếu đang bật duyệt chuyến). Chỉ đổi xe thì giữ duyệt.</p>
          ) : null}
          {mode === "assign" ? (
            <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={() => {
              setF3((x) => x ?? { supplierId: "", supplierName: "", plate: "", driverName: "", driverPhone: "", nationalId: "", licenseNo: "" });
              setKind("3pl");
            }}>
              Chạy xe nhà xe 3PL? Nhập xe, tài xế 3PL
            </button>
          ) : null}
        </>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Đóng
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!canSave}
          title={blockedDay ? 'Xe đã có chuyến cùng ngày: tích "Vẫn giao cho xe này" và nhập thứ tự chuyến' : !changed && !is3pl ? "Chọn xe hoặc tài xế khác để lưu" : undefined}
        >
          {pending ? <Loader2 className="animate-spin" /> : null} Lưu
        </Button>
      </div>
    </form>
  );
}
