import Link from "next/link";
import { Truck } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { signOut } from "@/app/auth/actions";

export default async function DriverLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePagePermission("driver_app.use");
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-sidebar px-4 text-white">
        <Link href="/tx" className="flex items-center gap-2 font-semibold">
          <Truck className="size-5" /> GHA TMS
        </Link>
        <span className="flex-1 truncate text-right text-sm text-sidebar-muted">{user.fullName || user.email}</span>
        <form action={signOut}>
          <button type="submit" className="rounded-md border border-white/20 px-2.5 py-1 text-xs">
            Thoát
          </button>
        </form>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
