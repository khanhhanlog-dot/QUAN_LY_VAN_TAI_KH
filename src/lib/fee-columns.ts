import type { SupabaseClient } from "@supabase/supabase-js";
import type { DispatchExtraColumn, DispatchExtraValues } from "@/lib/dispatch-columns";
import { formatNumber } from "@/lib/format";

type FeeType = { id: string; name: string; fee_group_id: string | null };
type FeeGroup = { id: string; report_role: string };
type FeeLine = { shipment_id: string; fee_type_id: string; amount: number | string; ref_no: string | null };

/**
 * Mỗi loại phí thu khách thành 2 cột trên bảng Điều phối / Quản lý chuyến: số tiền và "Số HĐ" (số hóa đơn).
 * Phí nhóm Chi hộ (phí nâng, phí hạ, phí cược cont…) hiện sẵn; phí khác bật trong nút Cột.
 * Giá trị: [chữ hiển thị, giá trị sắp xếp]; số dòng phí cùng loại > 1 thì chỉ xem (sửa ở chi tiết chuyến).
 */
export async function tripFeeColumns(supabase: SupabaseClient, shipmentIds: string[]) {
  const columns: DispatchExtraColumn[] = [];
  const values: DispatchExtraValues = Object.fromEntries(shipmentIds.map((id) => [id, {}]));
  const [t, g] = await Promise.all([
    supabase.from("fee_types").select("id, name, fee_group_id").eq("is_active", true).order("sort_order").order("name"),
    supabase.from("fee_groups").select("id, report_role").eq("is_active", true),
  ]);
  if (t.error) return { columns, values };
  const types = (t.data ?? []) as FeeType[];
  const roles = new Map(((g.data ?? []) as FeeGroup[]).map((x) => [x.id, x.report_role]));

  const lines: FeeLine[] = [];
  for (let i = 0; i < shipmentIds.length; i += 200) {
    const { data, error } = await supabase.from("shipment_fees").select("shipment_id, fee_type_id, amount, ref_no").in("shipment_id", shipmentIds.slice(i, i + 200));
    if (error) break;
    lines.push(...((data ?? []) as FeeLine[]));
  }
  const agg = new Map<string, { amount: number; refs: string[]; count: number }>();
  for (const l of lines) {
    const k = `${l.shipment_id}|${l.fee_type_id}`;
    const a = agg.get(k) ?? { amount: 0, refs: [], count: 0 };
    a.amount += Number(l.amount) || 0;
    a.count += 1;
    if (l.ref_no) a.refs.push(l.ref_no);
    agg.set(k, a);
  }

  for (const ft of types) {
    const chiHo = roles.get(ft.fee_group_id ?? "") === "pass_through";
    columns.push(
      { key: `fee_${ft.id}`, label: ft.name, numeric: true, source: "shipment", visible: chiHo, fee: { feeTypeId: ft.id, part: "amount", name: ft.name } },
      { key: `feeref_${ft.id}`, label: `Số HĐ ${ft.name.replace(/^phí\s+/i, "")}`, numeric: false, source: "shipment", visible: chiHo, fee: { feeTypeId: ft.id, part: "ref", name: ft.name } },
    );
    for (const sid of shipmentIds) {
      const a = agg.get(`${sid}|${ft.id}`);
      if (!a) continue;
      values[sid][`fee_${ft.id}`] = [formatNumber(a.amount), a.amount];
      const ref = a.refs.join(", ");
      values[sid][`feeref_${ft.id}`] = [ref, ref || null];
      if (a.count > 1) values[sid][`feemulti_${ft.id}`] = ["", a.count];
    }
  }
  return { columns, values };
}
