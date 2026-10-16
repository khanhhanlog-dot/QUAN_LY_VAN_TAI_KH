import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Công nợ" };

export default async function Page() {
  await requirePagePermission("receivables.view");
  return (
    <ComingSoon
      title="Công nợ"
      phase={7}
      items={["Phải thu khách hàng, phải trả nhà cung cấp", "Thanh toán một phần, nhiều lần; lịch sử đối chiếu", "Báo cáo công nợ quá hạn", "Lưu ý: báo cáo nội bộ không phải hóa đơn điện tử"]}
    />
  );
}
