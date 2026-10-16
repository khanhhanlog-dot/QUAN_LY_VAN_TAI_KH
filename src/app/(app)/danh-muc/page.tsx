import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Danh mục hệ thống" };

export default async function Page() {
  await requirePagePermission("catalogs.view");
  return (
    <ComingSoon
      title="Danh mục hệ thống"
      phase={3}
      items={["Danh mục chung (tỉnh/thành, hãng xe, loại hợp đồng, lý do từ chối...)", "Loại xe, danh mục chi phí (15 loại mặc định đã có), hạng mục phê duyệt (10 loại đã có)", "Ngân hàng, tài khoản công ty, phương thức thanh toán", "Thêm, sửa, ẩn, sắp xếp"]}
    />
  );
}
