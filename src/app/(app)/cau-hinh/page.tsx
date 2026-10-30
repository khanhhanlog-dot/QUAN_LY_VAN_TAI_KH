import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { SettingValueEditor } from "./setting-row";
import { PurgeCard } from "./purge-card";

export const metadata: Metadata = { title: "Cấu hình" };

export default async function SettingsPage() {
  const me = await requirePagePermission("settings.view");
  const supabase = await createClient();
  const { data, error } = await supabase.from("system_settings").select("key, value, description, updated_at").order("key");
  if (error) throw error;
  const canEdit = me.permissions.has("settings.configure");
  // Xóa dữ liệu thử: chỉ Super Admin/Admin (CSDL kiểm tra lại vai trò và mật khẩu)
  const isAdmin = me.roles.some((r) => r.code === "super_admin" || r.code === "admin");
  const purgeStatus = isAdmin ? ((await supabase.rpc("purge_password_status")).data as { is_set: boolean; updated_at: string | null } | null) : null;
  return (
    <>
      <PageHeader title="Cấu hình" description="Tham số hệ thống. Mỗi lần thay đổi được ghi nhật ký." />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tham số</TableHead>
              <TableHead className="w-[40%]">Giá trị (JSON)</TableHead>
              <TableHead>Cập nhật</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(data ?? []).map((s) => (
              <TableRow key={s.key}>
                <TableCell>
                  <div className="font-medium">{s.description ?? s.key}</div>
                  <code className="text-xs text-muted-foreground">{s.key}</code>
                </TableCell>
                <TableCell>
                  <SettingValueEditor settingKey={s.key} value={s.value} canEdit={canEdit} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(s.updated_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {isAdmin ? <PurgeCard passwordSet={Boolean(purgeStatus?.is_set)} updatedAt={purgeStatus?.updated_at ?? null} /> : null}
    </>
  );
}
