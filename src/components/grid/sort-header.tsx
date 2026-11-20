"use client";
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { describeSort, nextSortRules, sortRows, type SortRule, type SortVal } from "@/lib/table-sort";

/** Nút trong tiêu đề cột: bấm để sắp xếp tăng/giảm, có mũi tên chỉ chiều và số thứ tự khi sắp nhiều cột. */
export function SortButton({
  label,
  dir,
  index = -1,
  alignRight = false,
  onClick,
  className,
  wrap = false,
}: {
  label: ReactNode;
  dir: "asc" | "desc" | false;
  /** Thứ tự ưu tiên (0, 1, 2…) khi sắp nhiều cột; -1 = không hiện */
  index?: number;
  alignRight?: boolean;
  onClick: (e: MouseEvent) => void;
  className?: string;
  /** Cho tiêu đề xuống dòng (mặc định cắt bằng …) */
  wrap?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={dir === "asc" ? "Đang tăng dần (nhỏ → lớn). Bấm để giảm dần" : dir === "desc" ? "Đang giảm dần (lớn → nhỏ). Bấm để bỏ sắp xếp" : "Bấm để sắp xếp tăng dần (nhỏ → lớn); giữ Shift để sắp thêm cột"}
      className={cn("inline-flex max-w-full items-center gap-1 font-[inherit] hover:underline", alignRight && "flex-row-reverse", className)}
    >
      <span className={wrap ? undefined : "truncate"}>{label}</span>
      {dir === "asc" ? <ArrowUp className="size-3.5 shrink-0 print:hidden" /> : dir === "desc" ? <ArrowDown className="size-3.5 shrink-0 print:hidden" /> : <ArrowUpDown className="size-3 shrink-0 opacity-40 print:hidden" />}
      {index >= 0 ? <sup className="print:hidden">{index + 1}</sup> : null}
    </button>
  );
}

/** Dòng "Đang sắp xếp: … · Bỏ sắp xếp" hoặc gợi ý cách sắp xếp */
export function SortStatus({ rules, label, onClear, hint = "Bấm tiêu đề cột để sắp xếp tăng/giảm (giữ Shift để sắp theo nhiều cột)." }: { rules: SortRule[]; label: (id: string) => string | undefined; onClear: () => void; hint?: string | null }) {
  const text = describeSort(rules, label);
  if (!text) return hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null;
  return (
    <span className="text-xs text-muted-foreground">
      Đang sắp xếp: <b className="text-foreground">{text}</b>{" "}
      <button type="button" className="text-primary hover:underline" onClick={onClear}>
        Bỏ sắp xếp
      </button>
    </span>
  );
}

function readLocal(key: string | undefined): SortRule[] | null {
  if (!key) return null;
  try {
    const v = JSON.parse(window.localStorage.getItem(`kh:sort:${key}`) ?? "null");
    return Array.isArray(v) ? v.filter((r) => r && typeof r.id === "string").map((r) => ({ id: r.id, desc: Boolean(r.desc) })) : null;
  } catch {
    return null;
  }
}

/**
 * Sắp xếp cho bảng tự viết (không dùng ReportGrid/DispatchTable).
 * storageKey: có thì nhớ cách sắp xếp trên trình duyệt này.
 */
export function useTableSort<T>(rows: T[], valueOf: (row: T, id: string) => SortVal, opts: { storageKey?: string; initial?: SortRule[] } = {}) {
  const { storageKey, initial } = opts;
  const [rules, setRules] = useState<SortRule[]>(initial ?? []);
  useEffect(() => {
    const saved = readLocal(storageKey);
    // Đọc bộ nhớ trình duyệt sau khi hiển thị (tránh lệch với HTML máy chủ)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setRules(saved);
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(`kh:sort:${storageKey}`, JSON.stringify(rules));
    } catch {
      /* bộ nhớ trình duyệt bị chặn: bỏ qua */
    }
  }, [storageKey, rules]);
  const sorted = useMemo(() => sortRows(rows, rules, valueOf), [rows, rules, valueOf]);
  const dirOf = (id: string): "asc" | "desc" | false => {
    const r = rules.find((x) => x.id === id);
    return r ? (r.desc ? "desc" : "asc") : false;
  };
  const indexOf = (id: string) => (rules.length > 1 ? rules.findIndex((x) => x.id === id) : -1);
  const toggle = (id: string, e?: { shiftKey?: boolean }) => setRules((cur) => nextSortRules(cur, id, Boolean(e?.shiftKey)));
  /** Gắn nhanh vào tiêu đề: <SortButton {...header("total", "Tổng")} /> */
  const header = (id: string, label: ReactNode, alignRight = false) => ({ label, dir: dirOf(id), index: indexOf(id), alignRight, onClick: (e: MouseEvent) => toggle(id, e) });
  return { rules, setRules, sorted, dirOf, indexOf, toggle, header, clear: () => setRules([]) };
}
