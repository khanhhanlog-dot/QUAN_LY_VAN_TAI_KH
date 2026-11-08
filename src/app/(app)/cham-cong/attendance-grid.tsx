"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Lock, LockOpen, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lockAttendance, setAttendance } from "@/lib/attendance/actions";
import { cn } from "@/lib/utils";

type Status = "work" | "leave_paid" | "sick" | "leave_unpaid" | "absent" | "off" | "pending" | "upcoming";
type Cell = { s: Status; src: "manual" | "trip" | "leave_request" | "auto"; t: number; n: string | null };
export type AttendanceMonth = {
  month: string;
  days: { date: string; off: boolean; holiday: string | null }[];
  locked: boolean;
  can_edit: boolean;
  can_lock: boolean;
  drivers: { id: string; code: string; name: string; plate: string | null; cells: Record<string, Cell> }[];
};

const LOOK: Record<Status, { sym: string; label: string; cls: string }> = {
  work: { sym: "✓", label: "Đi làm", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  leave_paid: { sym: "P", label: "Nghỉ phép", cls: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
  sick: { sym: "Ô", label: "Nghỉ ốm", cls: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300" },
  leave_unpaid: { sym: "KL", label: "Nghỉ không lương", cls: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300" },
  absent: { sym: "V", label: "Nghỉ không báo", cls: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" },
  off: { sym: "N", label: "Ngày nghỉ, lễ", cls: "bg-muted text-muted-foreground" },
  pending: { sym: "?", label: "Chờ xác nhận", cls: "bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100" },
  upcoming: { sym: "", label: "Chưa tới", cls: "" },
};
const ACTIONS: { status: Exclude<Status, "pending" | "upcoming"> | null; label: string }[] = [
  { status: "work", label: "Có đi làm" },
  { status: "leave_paid", label: "Nghỉ phép" },
  { status: "sick", label: "Nghỉ ốm" },
  { status: "leave_unpaid", label: "Nghỉ không lương" },
  { status: "absent", label: "Nghỉ không báo" },
  { status: "off", label: "Ngày nghỉ" },
  { status: null, label: "Trả về tự động" },
];
const SUMMARY: Status[] = ["work", "leave_paid", "sick", "leave_unpaid", "absent", "pending"];
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

const key = (driverId: string, date: string) => `${driverId}|${date}`;
const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

export function AttendanceGrid({ month, data, today }: { month: string; data: AttendanceMonth; today: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const drivers = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return data.drivers;
    return data.drivers.filter((d) => `${d.name} ${d.code} ${d.plate ?? ""}`.toLowerCase().includes(t));
  }, [data.drivers, q]);
  const pendingKeys = useMemo(
    () => drivers.flatMap((d) => Object.entries(d.cells).filter(([, c]) => c.s === "pending").map(([day]) => key(d.id, day))),
    [drivers],
  );

  const toggle = (k: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const apply = (status: Exclude<Status, "pending" | "upcoming"> | null) =>
    start(async () => {
      const cells = [...sel].map((k) => {
        const [driverId, date] = k.split("|");
        return { driverId, date };
      });
      const r = await setAttendance({ cells, status, note: note || undefined });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${r.message} (${r.data ?? cells.length} ô)`);
      setSel(new Set());
      setNote("");
      router.refresh();
    });
  const lock = (locked: boolean) =>
    start(async () => {
      const r = await lockAttendance({ month: `${month}-01`, locked });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" aria-label="Tháng trước">
          <Link href={`/cham-cong?thang=${shiftMonth(month, -1)}`}>
            <ChevronLeft />
          </Link>
        </Button>
        <Input
          type="month"
          value={month}
          onChange={(e) => e.target.value && router.push(`/cham-cong?thang=${e.target.value}`)}
          className="w-40"
          aria-label="Tháng"
        />
        <Button asChild variant="outline" size="sm" aria-label="Tháng sau">
          <Link href={`/cham-cong?thang=${shiftMonth(month, 1)}`}>
            <ChevronRight />
          </Link>
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tài xế, mã, biển số" className="w-60 pl-8" aria-label="Tìm tài xế" />
        </div>
        {data.locked ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm">
            <Lock className="size-4" /> Đã chốt công tháng này
          </span>
        ) : null}
        {data.can_lock ? (
          <Button variant="outline" size="sm" disabled={pending} onClick={() => lock(!data.locked)} className="ml-auto">
            {data.locked ? <LockOpen /> : <Lock />} {data.locked ? "Mở chốt công" : "Chốt công tháng"}
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(LOOK) as Status[])
          .filter((s) => s !== "upcoming")
          .map((s) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-semibold", LOOK[s].cls)}>{LOOK[s].sym}</span>
              {LOOK[s].label}
            </span>
          ))}
        <span>Số trong ô xanh = số chuyến nhận trong ngày. Ô có viền = điều phối đã xác nhận / sửa tay.</span>
      </div>

      {data.can_edit ? (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 text-sm shadow-sm">
          <span className="font-medium">Đã chọn {sel.size} ô</span>
          <Button size="sm" variant="outline" disabled={!pendingKeys.length || pending} onClick={() => setSel(new Set(pendingKeys))}>
            Chọn tất cả ô chờ xác nhận ({pendingKeys.length})
          </Button>
          {sel.size ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>
                Bỏ chọn
              </Button>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú (ví dụ: chờ hàng, bảo dưỡng xe)" className="h-8 w-64" maxLength={500} />
              {ACTIONS.map((a) => (
                <Button key={a.label} size="sm" variant={a.status === "work" ? "default" : "outline"} disabled={pending} onClick={() => apply(a.status)}>
                  {a.label}
                </Button>
              ))}
            </>
          ) : (
            <span className="text-muted-foreground">Bấm vào các ô ngày để chọn, rồi chọn Có đi làm / Nghỉ phép...</span>
          )}
        </div>
      ) : null}

      <div className="overflow-auto rounded-lg border" style={{ maxHeight: "70vh" }}>
        <table className="w-max border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-card">
            <tr>
              <th className="sticky left-0 z-10 min-w-48 border-b bg-card px-2 py-1 text-left">Tài xế</th>
              {data.days.map((d) => {
                const dt = new Date(`${d.date}T00:00:00Z`);
                return (
                  <th
                    key={d.date}
                    title={d.holiday ?? undefined}
                    className={cn("w-8 border-b px-0.5 py-1 text-center font-normal", d.off && "bg-muted", d.date === today && "text-primary font-semibold")}
                  >
                    <div>{dt.getUTCDate()}</div>
                    <div className="text-[10px] text-muted-foreground">{WEEKDAY[dt.getUTCDay()]}</div>
                  </th>
                );
              })}
              {SUMMARY.map((s) => (
                <th key={s} className="border-b border-l px-1.5 py-1 text-center" title={LOOK[s].label}>
                  {s === "work" ? "Công" : LOOK[s].sym}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map((dr) => {
              const counts = Object.fromEntries(SUMMARY.map((s) => [s, 0])) as Record<Status, number>;
              Object.values(dr.cells).forEach((c) => {
                if (c.s in counts) counts[c.s] += 1;
              });
              return (
                <tr key={dr.id} className="hover:bg-muted/40">
                  <td className="sticky left-0 z-[1] border-b bg-card px-2 py-1">
                    <div className="font-medium">{dr.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {dr.code}
                      {dr.plate ? ` · ${dr.plate}` : ""}
                    </div>
                  </td>
                  {data.days.map((d) => {
                    const c = dr.cells[d.date];
                    if (!c) return <td key={d.date} className="border-b bg-muted/30" />;
                    const k = key(dr.id, d.date);
                    const look = LOOK[c.s];
                    const title = [look.label, c.t ? `${c.t} chuyến` : "", c.src === "manual" ? "đã xác nhận tay" : c.src === "leave_request" ? "theo đơn xin nghỉ" : "", c.n ?? ""]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <td key={d.date} className="border-b p-0.5 text-center">
                        <button
                          type="button"
                          title={title}
                          disabled={!data.can_edit || pending}
                          onClick={() => toggle(k)}
                          className={cn(
                            "h-7 w-7 rounded text-[11px] font-semibold disabled:cursor-default",
                            look.cls,
                            c.src === "manual" && "ring-1 ring-foreground/40",
                            sel.has(k) && "ring-2 ring-primary ring-offset-1",
                          )}
                        >
                          {c.s === "work" && c.t > 0 ? c.t : look.sym}
                        </button>
                      </td>
                    );
                  })}
                  {SUMMARY.map((s) => (
                    <td key={s} className={cn("border-b border-l px-1.5 text-center tabular-nums", s === "pending" && counts[s] > 0 && "font-semibold text-yellow-700")}>
                      {counts[s] || ""}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!drivers.length ? (
              <tr>
                <td colSpan={data.days.length + 1 + SUMMARY.length} className="p-6 text-center text-muted-foreground">
                  Không có tài xế nào.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
