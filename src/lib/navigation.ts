import type { Permission } from "@/lib/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: string; // tên icon lucide (ánh xạ trong Sidebar)
  anyOf: Permission[]; // hiển thị khi có ít nhất một quyền
  phase?: number; // giai đoạn sẽ hoàn thiện; không có = đã hoạt động
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Vận hành",
    items: [
      { href: "/tong-quan", label: "Tổng quan", icon: "LayoutDashboard", anyOf: ["dashboard.view"] },
      { href: "/dieu-phoi", label: "Điều phối", icon: "Route", anyOf: ["dispatch.view"] },
      { href: "/chuyen-xe", label: "Quản lý chuyến xe", icon: "Truck", anyOf: ["shipments.view"] },
      { href: "/tai-xe", label: "Tài xế", icon: "IdCard", anyOf: ["drivers.view"] },
      { href: "/phuong-tien", label: "Phương tiện", icon: "Bus", anyOf: ["vehicles.view"] },
      { href: "/khach-hang", label: "Khách hàng và địa điểm", icon: "Building2", anyOf: ["customers.view", "locations.view"] },
      { href: "/bang-gia", label: "Bảng giá", icon: "Tags", anyOf: ["price_lists.view"] },
    ],
  },
  {
    label: "Tài chính",
    items: [
      { href: "/chi-phi", label: "Ứng tiền và chi phí", icon: "Receipt", anyOf: ["expenses.view", "advances.view", "settlements.view"] },
      { href: "/cong-no", label: "Công nợ", icon: "Wallet", anyOf: ["receivables.view"], phase: 7 },
      { href: "/phe-duyet", label: "Phê duyệt", icon: "BadgeCheck", anyOf: ["approvals.view"] },
      { href: "/bao-cao", label: "Báo cáo", icon: "BarChart3", anyOf: ["reports.view"], phase: 7 },
    ],
  },
  {
    label: "Quản trị",
    items: [
      { href: "/danh-muc", label: "Danh mục hệ thống", icon: "ListTree", anyOf: ["catalogs.view"] },
      { href: "/truong-du-lieu", label: "Quản lý trường dữ liệu", icon: "Columns3", anyOf: ["fields.view"] },
      { href: "/bieu-mau", label: "Quản lý biểu mẫu", icon: "FileInput", anyOf: ["forms.view"], phase: 8 },
      { href: "/quy-trinh", label: "Quản lý quy trình", icon: "Workflow", anyOf: ["workflows.view"], phase: 8 },
      { href: "/nguoi-dung", label: "Người dùng và phân quyền", icon: "Users", anyOf: ["users.view"] },
      { href: "/nhat-ky", label: "Nhật ký hệ thống", icon: "ScrollText", anyOf: ["audit_logs.view"] },
      { href: "/cau-hinh", label: "Cấu hình", icon: "Settings", anyOf: ["settings.view"] },
    ],
  },
];
