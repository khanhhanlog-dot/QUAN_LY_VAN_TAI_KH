"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, X } from "lucide-react";
import {
  LIST_LABELS,
  isListPath,
  lastList,
  listBase,
  markRestore,
  previousUrl,
  recordVisit,
  rememberedList,
  restoreScroll,
  saveScroll,
  takeRestore,
} from "@/lib/list-memory";

function Tracker() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const qs = sp.toString();
  useEffect(() => {
    const url = qs ? `${pathname}?${qs}` : pathname;
    recordVisit(url);
    if (!isListPath(pathname)) return;
    if (takeRestore(url)) restoreScroll(url);
    let t: number | undefined;
    const onScroll = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => saveScroll(url), 120);
    };
    // capture: bắt cả cuộn trong khung bảng (sự kiện scroll không nổi bọt)
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [pathname, qs]);
  return null;
}

/** Đặt một lần trong layout: ghi nhớ bộ lọc + vị trí cuộn của danh sách. */
export function ListMemoryTracker() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}

/** Link menu: mở lại danh sách với bộ lọc đã dùng gần nhất. */
export function useRememberedHref(href: string) {
  const pathname = usePathname();
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc sessionStorage sau khi mount
    setSaved(isListPath(href) ? rememberedList(href) : null);
  }, [href, pathname]);
  return saved ?? href;
}

/**
 * Nút Đóng ở trang chi tiết chuyến/đơn: luôn nổi ở góc dưới bên phải (kể cả khi cuộn ngang/dọc),
 * quay về đúng danh sách (Quản lý chuyến hoặc Điều phối) với bộ lọc, sắp xếp và vị trí cuộn cũ.
 */
export function BackToList({ fallback }: { fallback: string }) {
  const router = useRouter();
  const [target, setTarget] = useState(fallback);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đọc sessionStorage sau khi mount
    setTarget(lastList() ?? fallback);
  }, [fallback]);
  const label = LIST_LABELS[listBase(target)] ?? "Danh sách";

  function go(e?: React.MouseEvent) {
    e?.preventDefault();
    markRestore(target);
    // Vừa đi từ danh sách sang: lùi lại lịch sử (giữ nguyên lịch sử trình duyệt)
    if (previousUrl() === target && window.history.length > 1) router.back();
    else router.push(target, { scroll: false });
  }

  return (
    <>
      <Link href={target} onClick={go} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
        <ChevronLeft className="size-4" /> {label}
      </Link>
      <button
        type="button"
        onClick={() => go()}
        title={`Đóng, về ${label} (giữ bộ lọc)`}
        className="fixed right-4 bottom-4 z-40 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-black/25 hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none print:hidden sm:right-6 sm:bottom-6"
      >
        <X className="size-4" /> Đóng
      </button>
    </>
  );
}
