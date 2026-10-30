import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

const LINKS = [
  { tab: "report_freight", label: "Cước vận chuyển" },
  { tab: "report_pass_through", label: "Phí chi hộ" },
  { tab: "report_loading", label: "Bốc xếp" },
  { tab: "report_fee_type", label: "Doanh thu theo loại phí" },
];

/** Lối vào nhanh các báo cáo cước phí từ màn hình Điều phối, Quản lý chuyến xe */
export function ReportLinks() {
  return (
    <nav aria-label="Báo cáo cước phí" className="mb-3 flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <BarChart3 className="size-4" /> Báo cáo:
      </span>
      {LINKS.map((l) => (
        <Button key={l.tab} asChild variant="outline" size="sm">
          <Link href={`/bao-cao?tab=${l.tab}`}>{l.label}</Link>
        </Button>
      ))}
    </nav>
  );
}
