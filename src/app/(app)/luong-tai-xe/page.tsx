import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { EntityListSection, resolveEntityTabs } from "@/components/entities/entity-list-section";

export const metadata: Metadata = { title: "Lương tài xế" };

type SP = Record<string, string | string[] | undefined>;

/** Gợi ý ngắn trên từng tab để người mới biết phải làm gì */
const HINTS: Record<string, string> = {
  trip_pay_rates:
    "App tìm giá cho mỗi chuyến theo thứ tự: giá riêng tài xế → tuyến Điểm 1 ↔ Điểm 2 (tính cả chiều ngược lại) → một địa điểm → vùng → giá mặc định. Chỉ cần khai các tuyến có giá khác giá mặc định.",
  pay_zones: "Nhóm các địa điểm có cùng lương chuyến (ví dụ Bến Tre, Đồng Tháp 1,000,000). Gán vùng cho từng địa điểm ở Khách hàng và địa điểm → Địa điểm.",
  pay_components:
    "Các khoản trên bảng lương. Lương cơ bản và Lương chuyến là khoản có sẵn. Khoản có Mức mặc định áp cho mọi tài xế; muốn mỗi người một mức thì nhập ở tab Mức lương theo tài xế.",
  driver_pay_matrix:
    "Mỗi dòng là mức của một khoản cho một tài xế. Tăng lương thì thêm dòng mới với ngày áp dụng mới. Hình thức lương (cơ bản + chuyến, chỉ chuyến, chỉ tháng) chọn trong hồ sơ tài xế.",
  trip_pay_lines:
    "Các chuyến tài xế công ty đã hoàn thành và lương chuyến app tính được. Lọc Chưa có đơn giá để bổ sung giá trước khi lập bảng lương.",
  payrolls: "Lập bảng lương tháng theo các thiết lập ở các tab trước, gửi Giám đốc duyệt, rồi chi trả.",
};

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePagePermission("settlements.view", "settlements.update");
  const sp = await searchParams;
  const { active, nav } = await resolveEntityTabs({
    basePath: "/luong-tai-xe",
    searchParams: sp,
    tabs: [
      { key: "trip_pay_rates" },
      { key: "pay_zones" },
      { key: "pay_components" },
      { key: "driver_pay_matrix" },
      { key: "trip_pay_lines" },
      { key: "payrolls", label: "Bảng lương" },
    ],
  });
  return (
    <>
      <PageHeader
        title="Lương tài xế"
        description="Thiết lập đơn giá lương chuyến, phụ cấp và mức lương từng tài xế; app tự tính lương chuyến từ các chuyến đã hoàn thành."
      />
      {nav}
      {active && HINTS[active] ? <p className="mb-3 text-sm text-muted-foreground">{HINTS[active]}</p> : null}
      {active ? <EntityListSection key={active} entityKey={active} searchParams={sp} revalidate="/luong-tai-xe" /> : null}
    </>
  );
}
