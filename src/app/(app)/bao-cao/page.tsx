import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Báo cáo" };

export default async function Page() {
  await requirePagePermission("reports.view");
  return (
    <ComingSoon
      title="Báo cáo"
      phase={7}
      items={["15 báo cáo: số chuyến, theo tài xế/xe/khách hàng/tuyến, doanh thu, chi phí, lợi nhuận, nhiên liệu, tạm ứng-quyết toán, công nợ, sửa chữa, giao trễ, chứng từ thiếu, lịch sử phê duyệt", "Lọc theo thời gian, xe, tài xế, khách hàng, tuyến, trạng thái", "Xuất Excel/CSV"]}
    />
  );
}
