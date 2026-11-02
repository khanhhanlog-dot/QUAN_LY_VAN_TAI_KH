"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ActionError, requirePermission, runAction, type ActionResult } from "@/lib/auth/action";

export type DriverShareRow = {
  shipment_id: string;
  shipment_code: string;
  driver_id: string | null;
  driver_name: string | null;
  plate_number: string | null;
  national_id: string | null;
  license_no: string | null;
};

const NOT_UPGRADED = "Cơ sở dữ liệu chưa nâng cấp cho chức năng Thông tin tài xế. Vui lòng chạy SQL nâng cấp số 35 (nang-cap-thong-tin-tai-xe.sql).";
const notUpgraded = (e: { code?: string; message?: string }) => e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message ?? "");

/** Tên tài xế, biển số, CCCD, GPLX của các chuyến để chép gửi khách hàng */
export async function loadDriverShareInfo(shipmentIds: string[]): Promise<ActionResult<DriverShareRow[]>> {
  return runAction(async () => {
    await requirePermission("dispatch.view", "shipments.view");
    const ids = z.array(z.uuid()).min(1).max(500).safeParse(shipmentIds);
    if (!ids.success) throw new ActionError("Chưa chọn chuyến");
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("shipment_driver_info", { p_shipment_ids: ids.data });
    if (error) {
      if (notUpgraded(error)) throw new ActionError(NOT_UPGRADED);
      throw error;
    }
    return (data ?? []) as DriverShareRow[];
  });
}

const fillSchema = z.object({
  driverId: z.uuid(),
  nationalId: z.string().trim().max(20, "Số CCCD tối đa 20 ký tự").optional(),
  licenseNo: z.string().trim().max(30, "Số GPLX tối đa 30 ký tự").optional(),
});

/** Điền nhanh CCCD / GPLX còn thiếu (điều phối chỉ điền ô trống) */
export async function fillDriverShareInfo(input: z.input<typeof fillSchema>): Promise<ActionResult> {
  return runAction(async () => {
    await requirePermission("dispatch.update", "drivers.update");
    const p = fillSchema.safeParse(input);
    if (!p.success) throw new ActionError(p.error.issues[0]?.message ?? "Dữ liệu không hợp lệ");
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_driver_share_info", {
      p_driver_id: p.data.driverId,
      p_national_id: p.data.nationalId || null,
      p_license_no: p.data.licenseNo || null,
    });
    if (error) {
      if (notUpgraded(error)) throw new ActionError(NOT_UPGRADED);
      throw error;
    }
    revalidatePath(`/tai-xe/${p.data.driverId}`);
  }, "Đã lưu giấy tờ tài xế.");
}
