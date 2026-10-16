import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Bảng giá" };

export default async function Page() {
  await requirePagePermission("price_lists.view");
  return (
    <ComingSoon
      title="Bảng giá"
      phase={3}
      items={["Bảng giá theo khách hàng, nơi nhận, nơi giao, loại xe, thời gian hiệu lực, độ ưu tiên", "Chặn bảng giá chồng lấn (đã có ràng buộc trong CSDL)", "Quy tắc hỗ trợ dầu: mặc định 39%, theo khách hàng, tuyến, loại xe"]}
    />
  );
}
