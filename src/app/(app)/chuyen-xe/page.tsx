import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Quản lý chuyến xe" };

export default async function Page() {
  await requirePagePermission("shipments.view");
  return (
    <ComingSoon
      title="Quản lý chuyến xe"
      phase={4}
      items={["Bảng dạng Excel, mỗi dòng một Shipment, kế thừa dữ liệu điều phối", "Sửa nhanh trên bảng các trường được phép, lưu lịch sử thay đổi tài chính", "Cột doanh thu, hỗ trợ dầu, tạm ứng, chi phí tài xế/Admin/khác, lợi nhuận dự kiến, trạng thái", "Mở chi tiết: chi phí, ứng tiền, chứng từ, phê duyệt, lịch sử"]}
    />
  );
}
