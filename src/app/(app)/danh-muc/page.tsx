import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { PageHeader } from "@/components/layout/page-header";
import { EntityListSection, resolveEntityTabs } from "@/components/entities/entity-list-section";

export const metadata: Metadata = { title: "Danh mục hệ thống" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePagePermission("catalogs.view");
  const sp = await searchParams;
  const { active, nav } = await resolveEntityTabs({
    basePath: "/danh-muc",
    searchParams: sp,
    tabs: [
      { key: "vehicle_types" },
      { key: "expense_categories" },
      { key: "banks" },
      { key: "company_bank_accounts" },
      { key: "payment_methods" },
      { key: "company_entities" },
      { key: "salary_rules" },
      { key: "catalog_items", label: "Danh mục khác" },
      { key: "catalogs", label: "Nhóm danh mục" },
    ],
  });
  return (
    <>
      <PageHeader title="Danh mục hệ thống" description="Các danh mục dùng chung. Mọi thay đổi được ghi vào nhật ký hệ thống." />
      {nav}
      {active ? <EntityListSection entityKey={active} searchParams={sp} revalidate="/danh-muc" /> : null}
    </>
  );
}
