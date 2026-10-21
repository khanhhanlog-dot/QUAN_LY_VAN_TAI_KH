import type { Metadata } from "next";
import { CheckCircle2, ClipboardList, MapPin, Phone, Receipt, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Ứng dụng tài xế" };

const STATUS: Record<string, { label: string; variant: "warning" | "success" | "secondary" | "destructive" | "default" }> = {
  assigned: { label: "Chờ nhận chuyến", variant: "warning" },
  accepted: { label: "Đã nhận", variant: "default" },
  in_transit: { label: "Đang thực hiện", variant: "default" },
  driver_completed: { label: "Đã hoàn thành", variant: "success" },
  closed: { label: "Đã đóng", variant: "secondary" },
};

type Row = {
  shipment_id: string;
  shipment_code: string;
  status: string;
  pickup_at: string;
  plate_number: string | null;
  notes: string | null;
  pickup_name: string;
  pickup_address: string;
  pickup_phone: string | null;
  pickup_maps_url: string | null;
  delivery_name: string;
  delivery_address: string;
  delivery_phone: string | null;
  delivery_maps_url: string | null;
};

export default async function DriverHome() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("driver_list_my_shipments", { p_include_finished: false });
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-5">
      <section>
        <h1 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <ClipboardList className="size-5" /> Chuyến được phân công
        </h1>
        {rows.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Hiện chưa có chuyến nào được phân công cho bạn.</div>
        ) : (
          <ul className="space-y-3">
            {rows.map((s) => (
              <li key={s.shipment_id} className="rounded-xl border bg-card p-4 shadow-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-base font-semibold">{s.shipment_code}</span>
                  <Badge variant={STATUS[s.status]?.variant ?? "outline"}>{STATUS[s.status]?.label ?? s.status}</Badge>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Nhận hàng: {formatDateTime(s.pickup_at)}
                  {s.plate_number ? ` · Xe ${s.plate_number}` : ""}
                </div>
                <Place label="Nơi nhận" name={s.pickup_name} address={s.pickup_address} phone={s.pickup_phone} maps={s.pickup_maps_url} />
                <Place label="Nơi giao" name={s.delivery_name} address={s.delivery_address} phone={s.delivery_phone} maps={s.delivery_maps_url} />
                {s.notes ? <p className="mt-2 rounded-md bg-muted p-2 text-sm">{s.notes}</p> : null}
                <button disabled className="mt-3 h-12 w-full rounded-lg bg-primary/40 text-sm font-medium text-white" title="Giai đoạn 5">
                  Nhận chuyến
                </button>
                <p className="mt-2 text-center text-xs text-muted-foreground">Nút nhận chuyến sẽ hoạt động ở Giai đoạn 5.</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile icon={<Wallet className="size-6" />} title="Ứng tiền" phase={6} />
        <Tile icon={<Receipt className="size-6" />} title="Nhập chi phí" phase={6} />
        <Tile icon={<CheckCircle2 className="size-6" />} title="Hoàn thành chuyến" phase={5} />
      </section>
    </div>
  );
}

function Place({ label, name, address, phone, maps }: { label: string; name: string; address: string; phone: string | null; maps: string | null }) {
  const mapsUrl = maps ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  return (
    <div className="mt-3 flex gap-3">
      <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className="font-medium">{name}</div>
        <div className="text-sm text-muted-foreground">{address}</div>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-1.5 text-sm text-primary">
            Mở Google Maps
          </a>
          {phone ? (
            <a href={`tel:${phone}`} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm">
              <Phone className="size-4" /> {phone}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, title, phase }: { icon: React.ReactNode; title: string; phase: number }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4 opacity-70">
      <div className="text-primary">{icon}</div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">Chưa triển khai – Giai đoạn {phase}</div>
      </div>
    </div>
  );
}
