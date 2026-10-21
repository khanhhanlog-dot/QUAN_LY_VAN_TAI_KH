import "server-only";
import { addDaysYMD, startOfDayVN, todayVN } from "@/lib/format";
import { isUuid } from "@/lib/entities/record";
import { sanitizeSearch } from "@/lib/entities/server";
import { SHIPMENT_STATUS } from "@/lib/status";

export type ShipmentFilters = { tu: string; den: string; tt: string; kh: string; q: string };

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Chuẩn hóa bộ lọc từ URL; mặc định 30 ngày trước đến 7 ngày tới */
export function parseShipmentFilters(sp: Record<string, string | undefined>): ShipmentFilters {
  const today = todayVN();
  let tu = sp.tu && YMD.test(sp.tu) ? sp.tu : addDaysYMD(today, -30);
  let den = sp.den && YMD.test(sp.den) ? sp.den : addDaysYMD(today, 7);
  if (den < tu) [tu, den] = [den, tu];
  return {
    tu,
    den,
    tt: sp.tt === "tre" || SHIPMENT_STATUS.some((s) => s.value === sp.tt) ? sp.tt! : "",
    kh: sp.kh && isUuid(sp.kh) ? sp.kh : "",
    q: sanitizeSearch(sp.q ?? ""),
  };
}

/** Áp bộ lọc lên truy vấn view shipment_list */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyShipmentFilters(query: any, f: ShipmentFilters, opts: { status?: boolean } = {}) {
  let q = query.gte("pickup_at", startOfDayVN(f.tu)).lt("pickup_at", startOfDayVN(addDaysYMD(f.den, 1)));
  if (f.kh) q = q.eq("customer_id", f.kh);
  if (f.q) {
    q = q.or(["shipment_code", "order_code", "customer_name", "plate_number", "driver_name", "pickup_name", "delivery_name"].map((c) => `${c}.ilike.*${f.q}*`).join(","));
  }
  if (opts.status !== false && f.tt) {
    if (f.tt === "tre") q = q.in("status", ["assigned", "accepted", "in_transit"]).lt("expected_delivery_at", new Date().toISOString());
    else q = q.eq("status", f.tt);
  }
  return q;
}
