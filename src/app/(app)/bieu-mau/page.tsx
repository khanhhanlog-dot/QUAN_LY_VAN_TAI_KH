import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Quản lý biểu mẫu" };

export default async function Page() {
  await requirePagePermission("forms.view");
  return (
    <ComingSoon
      title="Quản lý biểu mẫu"
      phase={3}
      items={["Bố cục biểu mẫu theo module từ các trường đã định nghĩa", "Lưu phiên bản và khôi phục"]}
    />
  );
}
