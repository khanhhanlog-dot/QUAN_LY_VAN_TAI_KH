import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Tài xế" };

export default async function Page() {
  await requirePagePermission("drivers.view");
  return (
    <ComingSoon
      title="Tài xế"
      phase={3}
      items={["Hồ sơ tài xế, hợp đồng, lương và phụ cấp, quy tắc tính lương", "CCCD và tài khoản ngân hàng chỉ hiện với người có quyền xem dữ liệu nhạy cảm", "Mời tài xế đăng nhập bằng Google và gắn với hồ sơ", "Tệp đính kèm hợp đồng, giấy tờ"]}
    />
  );
}
