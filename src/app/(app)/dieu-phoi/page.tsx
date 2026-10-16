import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Điều phối" };

export default async function Page() {
  await requirePagePermission("dispatch.view");
  return (
    <ComingSoon
      title="Điều phối"
      phase={4}
      items={["Tạo đơn hàng gồm một hoặc nhiều chuyến, mã SHP-YYYYMMDD-0001 tự sinh", "Tự tìm bảng giá theo khách hàng, nơi nhận, nơi giao, loại xe; bắt chọn khi có nhiều bảng giá ngang nhau", "Tính hỗ trợ dầu theo thứ tự ưu tiên và lưu lại tham số tại thời điểm tạo", "Phân công xe và tài xế, thông báo cho tài xế", "Nút “+” tạo nhanh khách hàng, địa điểm, bảng giá"]}
    />
  );
}
