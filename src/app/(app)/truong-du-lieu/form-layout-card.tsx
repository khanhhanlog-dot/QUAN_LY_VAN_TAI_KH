"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, GripVertical, Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { saveFormLayout } from "./actions";

export type LayoutItem = { key: string; label: string; system: boolean };

/** Kéo thả (hoặc bấm mũi tên) để sắp thứ tự trường trên biểu mẫu; một thứ tự dùng chung cho mọi người */
export function FormLayoutCard({
  module,
  moduleLabel,
  items: initial,
  defaults,
  canConfigure,
  note,
}: {
  module: string;
  moduleLabel: string;
  items: LayoutItem[];
  /** Thứ tự mặc định (trường hệ thống trước, trường bổ sung sau) để khôi phục */
  defaults: LayoutItem[];
  canConfigure: boolean;
  note?: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const dirty = items.map((i) => i.key).join() !== initial.map((i) => i.key).join();

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return;
    setItems((xs) => {
      const next = [...xs];
      const [it] = next.splice(from, 1);
      next.splice(to, 0, it);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="text-base">Thứ tự trên biểu mẫu {moduleLabel.toLowerCase()}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {canConfigure ? "Kéo thả hoặc bấm mũi tên để đổi vị trí, rồi bấm Lưu. Áp dụng cho mọi người dùng." : "Bạn chỉ được xem, cần quyền Cấu hình trường để sắp xếp."}
            {note ? ` ${note}` : ""}
          </p>
        </div>
        {canConfigure ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setItems(defaults)} disabled={pending}>
              <RotateCcw /> Mặc định
            </Button>
            <Button
              size="sm"
              disabled={!dirty || pending}
              onClick={() =>
                start(async () => {
                  const r = await saveFormLayout(
                    module,
                    items.map((i) => i.key),
                  );
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(r.message ?? "Đã lưu");
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Save />} Lưu thứ tự
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        <ol className="grid gap-1 sm:grid-cols-2" aria-label={`Thứ tự trường trên biểu mẫu ${moduleLabel}`}>
          {items.map((it, i) => (
            <li
              key={it.key}
              data-layout-key={it.key}
              draggable={canConfigure}
              onDragStart={(e) => {
                setDrag(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (drag === null) return;
                e.preventDefault();
                setOver(i);
              }}
              onDragLeave={() => setOver((o) => (o === i ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                if (drag !== null) move(drag, i);
                setDrag(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
              className={cn(
                "flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-sm",
                canConfigure && "cursor-grab",
                drag === i && "opacity-50",
                over === i && drag !== i && "border-primary ring-1 ring-primary",
              )}
            >
              {canConfigure ? <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
              <span className="w-6 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{it.label}</span>
              <Badge variant={it.system ? "outline" : "secondary"} className="shrink-0 font-normal">
                {it.system ? "Hệ thống" : "Bổ sung"}
              </Badge>
              {canConfigure ? (
                <span className="flex shrink-0">
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Đưa ${it.label} lên`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Đưa ${it.label} xuống`} disabled={i === items.length - 1} onClick={() => move(i, i + 1)}>
                    <ArrowDown className="size-3.5" />
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
