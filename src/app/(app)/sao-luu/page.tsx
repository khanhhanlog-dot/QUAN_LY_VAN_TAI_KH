import type { Metadata } from "next";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadTableView } from "@/lib/entities/server";
import { PageHeader } from "@/components/layout/page-header";
import { BACKUP_LIST_COLS, type BackupOverview, type BackupRow } from "@/lib/backup";
import { isEmailConfigured } from "@/lib/backup-email";
import { BackupManager } from "./backup-manager";

export const metadata: Metadata = { title: "Sao lưu dữ liệu" };

export default async function BackupPage() {
  const me = await requirePagePermission("backups.view");
  const supabase = await createClient();
  const [ov, list, view] = await Promise.all([
    supabase.rpc("backup_overview"),
    supabase.from("data_backups").select(BACKUP_LIST_COLS).order("created_at", { ascending: false }).limit(1000),
    loadTableView(supabase, "data_backups", me.id),
  ]);
  if (ov.error) throw ov.error;
  if (list.error) throw list.error;
  return (
    <>
      <PageHeader
        title="Sao lưu dữ liệu"
        description="Tự động chụp lại toàn bộ dữ liệu vào các giờ đã chọn mỗi ngày (giờ Việt Nam) và gửi tệp Excel về email. Tải bản đầy đủ về Excel bất cứ lúc nào."
      />
      <BackupManager
        overview={ov.data as BackupOverview}
        rows={(list.data ?? []) as BackupRow[]}
        view={view}
        canCreate={me.permissions.has("backups.create")}
        canConfigure={me.permissions.has("backups.configure")}
        emailReady={isEmailConfigured()}
      />
    </>
  );
}
