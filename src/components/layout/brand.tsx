import { Truck } from "lucide-react";

export function Brand() {
  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-5">
      <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Truck className="size-4" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-white">GHA TMS</div>
        <div className="text-[11px] text-sidebar-muted">Vận tải Khánh Hà</div>
      </div>
    </div>
  );
}
