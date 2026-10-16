import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Phương tiện" };

export default async function Page() {
  await requirePagePermission("vehicles.view");
  return (
    <ComingSoon
      title="Phương tiện"
      phase={3}
      items={["Danh sách xe, loại xe, tình trạng, tài xế được phân công", "Khấu hao đường thẳng tự tính (đã có trong CSDL)", "Khoản vay và dư nợ theo lịch trả nợ (không suy đoán)", "Lịch sử sửa chữa, bảo dưỡng, thay lốp, thay nhớt; cảnh báo đăng kiểm/bảo hiểm sắp hết hạn"]}
    />
  );
}
