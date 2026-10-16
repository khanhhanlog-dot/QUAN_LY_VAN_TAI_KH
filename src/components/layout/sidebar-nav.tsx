"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck, BarChart3, Building2, Bus, Columns3, FileInput, IdCard, LayoutDashboard, ListTree,
  Receipt, Route, ScrollText, Settings, Tags, Truck, Users, Wallet, Workflow, type LucideIcon,
} from "lucide-react";
import type { NavGroup } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  BadgeCheck, BarChart3, Building2, Bus, Columns3, FileInput, IdCard, LayoutDashboard, ListTree,
  Receipt, Route, ScrollText, Settings, Tags, Truck, Users, Wallet, Workflow,
};

export function SidebarNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" aria-label="Menu chính">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">{g.label}</div>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const Icon = ICONS[item.icon] ?? LayoutDashboard;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                      active ? "bg-sidebar-accent text-white font-medium" : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-white",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.phase ? (
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-sidebar-muted" title={`Hoàn thiện ở Giai đoạn ${item.phase}`}>
                        GĐ{item.phase}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
