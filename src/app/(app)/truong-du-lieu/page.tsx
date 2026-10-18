import type { Metadata } from "next";
import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CUSTOM_FIELD_MODULES, ENTITIES } from "@/lib/entities/definitions";
import { loadCustomFields } from "@/lib/entities/server";
import { ALL_PERMISSIONS } from "@/lib/permissions";
import { FieldManager } from "./field-manager";

export const metadata: Metadata = { title: "Quản lý trường dữ liệu" };

const TYPE_LABEL: Record<string, string> = {
  text: "Văn bản", textarea: "Văn bản dài", number: "Số", currency: "Tiền tệ", percent: "Phần trăm", date: "Ngày",
  datetime: "Ngày giờ", select: "Danh sách", multiselect: "Chọn nhiều", boolean: "Có/Không", email: "Email",
  phone: "Điện thoại", url: "Đường dẫn", reference: "Liên kết", gps: "GPS",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  const me = await requirePagePermission("fields.view", "fields.configure");
  const { module: mp } = await searchParams;
  const mod = CUSTOM_FIELD_MODULES.find((m) => m.module === mp) ?? CUSTOM_FIELD_MODULES[0];
  const supabase = await createClient();
  const custom = await loadCustomFields(supabase, mod.module, true);
  const entity = mod.entity ? ENTITIES[mod.entity] : undefined;
  const numericSystem = (entity?.fields ?? []).filter((f) => ["number", "currency", "percent"].includes(f.type)).map((f) => ({ key: f.key, label: f.label }));

  return (
    <>
      <PageHeader
        title="Quản lý trường dữ liệu"
        description="Thêm trường bổ sung cho từng màn hình mà không cần sửa mã nguồn. Mỗi lần sửa tạo một phiên bản mới; trường đang có dữ liệu không xóa được, chỉ ngừng sử dụng."
      />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b">
        {CUSTOM_FIELD_MODULES.map((m) => (
          <Link
            key={m.module}
            href={`/truong-du-lieu?module=${m.module}`}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-4 py-2 text-sm whitespace-nowrap",
              mod.module === m.module ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {m.label}
          </Link>
        ))}
      </div>
      <div className="space-y-4">
        <FieldManager
          module={mod.module}
          moduleLabel={mod.label}
          rows={custom}
          canConfigure={me.permissions.has("fields.configure")}
          numericSystem={numericSystem}
          systemKeys={(entity?.fields ?? []).map((f) => f.key)}
          permissions={ALL_PERMISSIONS}
        />
        {entity ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trường hệ thống của {mod.label.toLowerCase()} (không đổi kiểu, không xóa)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {entity.fields.map((f) => (
                <Badge key={f.key} variant="outline" className="font-normal">
                  {f.label} <span className="text-muted-foreground">· {TYPE_LABEL[f.type] ?? f.type}{f.required ? " · bắt buộc" : ""}</span>
                </Badge>
              ))}
            </CardContent>
          </Card>
        ) : (
          <p className="text-sm text-muted-foreground">Màn hình {mod.label.toLowerCase()} sẽ hoàn thiện ở Giai đoạn 4; trường bổ sung tạo trước sẽ tự xuất hiện khi màn hình hoàn thiện.</p>
        )}
      </div>
    </>
  );
}
