import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Chi phí và quyết toán" };

export default async function Page() {
  await requirePagePermission("expenses.view", "advances.view", "settlements.view");
  return (
    <ComingSoon
      title="Chi phí và quyết toán"
      phase={6}
      items={["Chi phí chuyến theo danh mục dùng chung, trạng thái duyệt", "Yêu cầu ứng tiền và giao dịch tạm ứng (tạm ứng không phải chi phí)", "Bảng đối soát tài xế: đã ứng, chi phí được duyệt, đã thanh toán, phải hoàn lại, phải trả thêm", "Quyết toán chuyến theo điều kiện cấu hình (Giai đoạn 7)"]}
    />
  );
}
