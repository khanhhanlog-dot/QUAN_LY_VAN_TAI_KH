import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Khách hàng và địa điểm" };

export default async function Page() {
  await requirePagePermission("customers.view", "locations.view");
  return (
    <ComingSoon
      title="Khách hàng và địa điểm"
      phase={3}
      items={["Khách hàng, đơn vị thanh toán, nhà cung cấp", "Địa điểm dùng chung cho nơi nhận/nơi giao, tọa độ GPS, link Google Maps, giờ hoạt động", "Tuyến đường và khoảng cách tham chiếu", "Tìm kiếm nhanh, tạo mới ngay trên biểu mẫu"]}
    />
  );
}
