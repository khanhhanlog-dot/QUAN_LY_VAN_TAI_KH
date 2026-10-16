import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Phê duyệt" };

export default async function Page() {
  await requirePagePermission("approvals.view");
  return (
    <ComingSoon
      title="Phê duyệt"
      phase={6}
      items={["Hộp yêu cầu chờ tôi duyệt", "Duyệt / từ chối (lý do) / yêu cầu bổ sung, nhiều cấp theo hạn mức", "Chặn tự duyệt, chặn sửa sau duyệt, chống thanh toán trùng (đã có trong CSDL)", "Lịch sử thao tác từng yêu cầu"]}
    />
  );
}
