import "server-only";
import { addDaysYMD, startOfDayVN, todayVN } from "@/lib/format";
import { isUuid } from "@/lib/entities/record";
import { sanitizeSearch } from "@/lib/entities/server";
import { SHIPMENT_STATUS } from "@/lib/status";
import { applyConditions, parseConditions, encodeCondition, type AdvField } from "@/lib/advanced-filter";
import { loadCustomFields, visibleCustomRows } from "@/lib/entities/server";
import { advancedFields, moduleCustomFields } from "@/lib/entities/record";
import { shipmentCustomAdvFields } from "@/lib/shipments";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SHIPMENT_ADV_FIELDS, SHIPMENT_DATETIME_FIELDS } from "@/lib/shipments";

export type ShipmentFilters = { tu: string; den: string; tt: string; kh: string; q: string; adv: string[]; extraAdv?: AdvField[] };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Chuẩn hóa bộ lọc từ URL; mặc định 30 ngày trước đến 7 ngày tới */
export function parseShipmentFilters(raw: SP, extraAdv: AdvField[] = []): ShipmentFilters {
  const sp = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "a").map(([k, v]) => [k, one(v)])) as Record<string, string | undefined>;
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
    adv: parseConditions(raw.a, [...SHIPMENT_ADV_FIELDS, ...extraAdv]).map(encodeCondition),
    extraAdv,
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
  if (f.adv.length) {
    const all = [...SHIPMENT_ADV_FIELDS, ...(f.extraAdv ?? [])];
    q = applyConditions(q, parseConditions(f.adv, all), all, {
      column: (k) => (k.startsWith("cf_") ? `custom_fields->>${k.slice(3)}` : k),
      dateTime: (k) => SHIPMENT_DATETIME_FIELDS.has(k),
      dayStart: startOfDayVN,
      nextDayStart: (d) => startOfDayVN(addDaysYMD(d, 1)),
    });
  }
  if (opts.status !== false && f.tt) {
    if (f.tt === "tre") q = q.in("status", ["assigned", "accepted", "in_transit"]).lt("expected_delivery_at", new Date().toISOString());
    else q = q.eq("status", f.tt);
  }
  return q;
}

/** Trường bổ sung của chuyến mà người dùng được xem: định nghĩa cột + trường tìm kiếm nâng cao */
export async function shipmentCustomFields(supabase: SupabaseClient, perms: Set<string>) {
  const defs = moduleCustomFields("shipments", visibleCustomRows(await loadCustomFields(supabase, "shipments"), perms), perms);
  return { defs, adv: shipmentCustomAdvFields(advancedFields(defs)) };
}
