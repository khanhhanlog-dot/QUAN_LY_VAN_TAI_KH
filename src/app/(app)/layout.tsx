import Link from "next/link";
import { Bell } from "lucide-react";
import { requireActiveUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { NAV_GROUPS } from "@/lib/navigation";
import { hasAny } from "@/lib/permissions";
import { Brand } from "@/components/layout/brand";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireActiveUser();
  const supabase = await createClient();
  const { count: unread } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  // Menu chỉ hiển thị mục người dùng có quyền (máy chủ vẫn kiểm tra quyền ở từng trang)
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => hasAny(user.permissions, i.anyOf)) })).filter(
    (g) => g.items.length > 0,
  );
  const displayName = user.fullName || user.email;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <Brand />
        <SidebarNav groups={groups} />
        {user.isDriver ? (
          <Link href="/tx" className="m-3 rounded-md border border-white/15 px-3 py-2 text-center text-sm text-white hover:bg-sidebar-accent">
            Mở ứng dụng tài xế
          </Link>
        ) : null}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/95 px-3 backdrop-blur sm:px-5">
          <MobileNav groups={groups} />
          <div className="flex-1" />
          <Link href="/thong-bao" className="relative rounded-md p-2 hover:bg-accent" aria-label={`Thông báo (${unread ?? 0} chưa đọc)`}>
            <Bell className="size-5" />
            {unread ? (
              <span className="absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
          <UserMenu name={displayName} email={user.email} avatarUrl={user.avatarUrl} roles={user.roles.map((r) => r.name)} />
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
