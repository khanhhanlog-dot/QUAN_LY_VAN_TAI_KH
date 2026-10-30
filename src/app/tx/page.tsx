import { Clock, MapPin, Navigation, Phone, Receipt, Truck } from "lucide-react";
import { anonClient, driverLinkToken } from "@/lib/driver-link/server";
import { formatDate, formatDateTime, formatNumber, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { PlateForm } from "./plate-form";
import { AcceptButton, ChangeVehicleButton, CompleteButton, StartButton } from "./trip-actions";
import { AddExpenseButton, type ExpenseCategory } from "./expense-forms";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; variant: "warning" | "success" | "secondary" | "info" }> = {
  assigned: { label: "Chờ nhận", variant: "warning" },
  accepted: { label: "Đã nhận", variant: "info" },
  in_transit: { label: "Đang chạy", variant: "info" },
  driver_completed: { label: "Đã xong", variant: "success" },
  closed: { label: "Đã đóng", variant: "secondary" },
};

type Trip = {
  shipment_id: string;
  shipment_code: string;
  status: string;
  pickup_at: string;
  expected_delivery_at: string | null;
  plate_number: string | null;
  vehicle_type_name: string | null;
  quantity: number | null;
  notes: string | null;
  pickup_name: string;
  pickup_address: string;
  pickup_contact: string | null;
  pickup_phone: string | null;
  pickup_maps_url: string | null;
  pickup_gate_instructions: string | null;
  delivery_name: string;
  delivery_address: string;
  delivery_contact: string | null;
  delivery_phone: string | null;
  delivery_maps_url: string | null;
  delivery_gate_instructions: string | null;
  driver_name: string;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  delivery_result: string | null;
  photo_count: number;
  expense_declaration: "none" | "has" | null;
  expense_count: number;
  expense_total: number;
  outsourced: boolean;
  /** Thứ tự chuyến của xe trong ngày (điều phối nhập khi xe chạy nhiều chuyến cùng ngày) */
  vehicle_day_order?: number | null;
};

const RESULT_LABEL: Record<string, string> = { full: "Giao đủ", partial: "Giao thiếu", failed: "Không giao được" };

export default async function DriverHome() {
  const token = await driverLinkToken();
  const supabase = anonClient();
  const me = token ? ((await supabase.rpc("driver_link_me", { p_token: token })).data as { plate: string; driver_name: string | null } | null) : null;
  if (!me) return <PlateForm />;

  const [{ data, error }, fin] = await Promise.all([
    supabase.rpc("driver_link_trips", { p_token: token }),
    supabase.rpc("driver_link_categories", { p_token: token }),
  ]);
  if (error) throw error;
  const trips = (data ?? []) as Trip[];
  const categories = ((fin.data as { categories?: ExpenseCategory[] } | null)?.categories ?? []) as ExpenseCategory[];
  const waiting = trips.filter((t) => t.status === "assigned").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Truck className="size-6" />
          </div>
          <div>
            <div className="font-mono text-lg font-semibold">{me.plate}</div>
            <div className="text-sm text-muted-foreground">{waiting > 0 ? `${waiting} chuyến chờ nhận` : "Không có chuyến chờ nhận"}</div>
          </div>
        </div>
        <ChangeVehicleButton />
      </div>

      {trips.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">Xe chưa có chuyến nào được phân công.</div>
      ) : (
        <ul className="space-y-4">
          {trips.map((t) => {
            const st = STATUS[t.status] ?? { label: t.status, variant: "secondary" as const };
            return (
              <li key={t.shipment_id} data-trip={t.shipment_code} className={`rounded-2xl border-2 bg-card p-4 shadow-sm ${t.status === "assigned" ? "border-warning" : "border-transparent"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-base font-semibold">{t.shipment_code}</div>
                    {t.vehicle_day_order ? <div className="text-sm font-semibold text-primary">Chuyến thứ {t.vehicle_day_order} trong ngày</div> : null}
                    <div className="text-sm text-muted-foreground">Tài xế: {t.driver_name}</div>
                  </div>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
                  <Clock className="size-4 shrink-0 text-primary" />
                  <span>
                    Nhận hàng ngày <strong>{formatDate(t.pickup_at)}</strong>
                    {t.expected_delivery_at ? <> · Giao trong ngày {formatDate(t.expected_delivery_at)}</> : null}
                  </span>
                </div>

                <Place label="Điểm nhận" name={t.pickup_name} address={t.pickup_address} contact={t.pickup_contact} phone={t.pickup_phone} maps={t.pickup_maps_url} gate={t.pickup_gate_instructions} />
                <Place label="Điểm giao" name={t.delivery_name} address={t.delivery_address} contact={t.delivery_contact} phone={t.delivery_phone} maps={t.delivery_maps_url} gate={t.delivery_gate_instructions} />

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {t.vehicle_type_name ? <span>Loại xe: {t.vehicle_type_name}</span> : null}
                  {t.quantity ? <span>Số lượng: {formatNumber(t.quantity)}</span> : null}
                </div>
                {t.notes ? <p className="mt-2 rounded-lg bg-warning/10 p-2 text-sm">Ghi chú: {t.notes}</p> : null}

                {t.status === "assigned" ? (
                  <AcceptButton shipmentId={t.shipment_id} code={t.shipment_code} />
                ) : t.status === "accepted" ? (
                  <>
                    {t.accepted_at ? <p className="mt-3 text-center text-sm text-success">Đã nhận lúc {formatDateTime(t.accepted_at)}</p> : null}
                    <StartButton shipmentId={t.shipment_id} code={t.shipment_code} />
                  </>
                ) : t.status === "in_transit" ? (
                  <>
                    {t.started_at ? <p className="mt-3 text-center text-sm text-primary">Bắt đầu chạy lúc {formatDateTime(t.started_at)}</p> : null}
                    <CompleteButton shipmentId={t.shipment_id} code={t.shipment_code} categories={categories} outsourced={t.outsourced} />
                  </>
                ) : t.completed_at ? (
                  <>
                    <p className="mt-3 text-center text-sm text-success">
                      Hoàn thành lúc {formatDateTime(t.completed_at)}
                      {t.delivery_result ? ` · ${RESULT_LABEL[t.delivery_result] ?? ""}` : ""} · {t.photo_count} ảnh
                    </p>
                    {t.outsourced ? (
                      <p className="mt-2 text-center text-sm text-muted-foreground">Xe thuê ngoài 3PL: không nhập chi phí tài xế</p>
                    ) : (
                      <p data-expense-summary className="mt-2 flex items-center justify-center gap-1.5 text-sm">
                        <Receipt className="size-4 text-muted-foreground" />
                        {Number(t.expense_count) > 0
                          ? `Chi phí: ${t.expense_count} khoản · ${formatVND(Number(t.expense_total))}`
                          : t.expense_declaration === "none"
                            ? "Đã xác nhận không phát sinh chi phí"
                            : "Chưa có chi phí"}
                      </p>
                    )}
                    {t.status === "driver_completed" && !t.outsourced ? <AddExpenseButton shipmentId={t.shipment_id} code={t.shipment_code} categories={categories} /> : null}
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Place(p: { label: string; name: string; address: string; contact: string | null; phone: string | null; maps: string | null; gate: string | null }) {
  const mapsUrl = p.maps ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.address)}`;
  return (
    <div className="mt-3 flex gap-3">
      <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium uppercase text-muted-foreground">{p.label}</div>
        <div className="font-semibold">{p.name}</div>
        <div className="text-sm text-muted-foreground">{p.address}</div>
        {p.gate ? <div className="text-sm">Cổng: {p.gate}</div> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium text-primary">
            <Navigation className="size-4" /> Chỉ đường
          </a>
          {p.phone ? (
            <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm font-medium">
              <Phone className="size-4" /> {p.contact ? `${p.contact} · ` : ""}
              {p.phone}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
