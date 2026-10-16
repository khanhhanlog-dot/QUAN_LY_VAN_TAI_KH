import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata: Metadata = { title: "Quản lý trường dữ liệu" };

export default async function Page() {
  await requirePagePermission("fields.view");
  return (
    <ComingSoon
      title="Quản lý trường dữ liệu"
      phase={3}
      items={["Thêm trường động 19 kiểu cho từng module, không sửa mã nguồn", "Đổi tên hiển thị, sắp xếp, ẩn/hiện, bắt buộc, quyền xem/sửa", "Trường công thức với bộ phân tích giới hạn (không chạy JavaScript tùy ý)", "Kiểm tra ảnh hưởng trước khi đổi; lịch sử phiên bản và khôi phục (bảng phiên bản đã có)"]}
    />
  );
}
