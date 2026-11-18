// Nhớ bộ lọc, sắp xếp và vị trí cuộn của danh sách Quản lý chuyến / Điều phối (theo tab trình duyệt).
// Dùng ở client: nút Đóng ở chi tiết chuyến/đơn và menu bên trái quay lại đúng danh sách đang lọc.

export const LIST_PATHS = ["/chuyen-xe", "/dieu-phoi"] as const;
export const LIST_LABELS: Record<string, string> = { "/chuyen-xe": "Quản lý chuyến xe", "/dieu-phoi": "Điều phối" };

const K_LIST = "kh:list:";
const K_LAST = "kh:last-list";
const K_SCROLL = "kh:scroll:";
const K_RESTORE = "kh:restore";
const K_CUR = "kh:cur-url";
const K_PREV = "kh:prev-url";

function ss(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
function get(k: string) {
  try {
    return ss()?.getItem(k) ?? null;
  } catch {
    return null;
  }
}
function set(k: string, v: string) {
  try {
    ss()?.setItem(k, v);
  } catch {
    /* bộ nhớ trình duyệt bị chặn: bỏ qua */
  }
}
function del(k: string) {
  try {
    ss()?.removeItem(k);
  } catch {
    /* bỏ qua */
  }
}

export function isListPath(pathname: string) {
  return (LIST_PATHS as readonly string[]).includes(pathname);
}
export function listBase(url: string) {
  return url.split("?")[0];
}

/** Ghi lại mỗi lần chuyển trang (để biết trang ngay trước) và URL danh sách đang lọc. */
export function recordVisit(url: string) {
  const cur = get(K_CUR);
  if (cur !== url) {
    if (cur) set(K_PREV, cur);
    set(K_CUR, url);
  }
  const base = listBase(url);
  if (isListPath(base)) {
    set(K_LIST + base, url);
    set(K_LAST, url);
  }
}

export function rememberedList(base: string) {
  return get(K_LIST + base);
}
export function lastList() {
  return get(K_LAST);
}
export function previousUrl() {
  return get(K_PREV);
}

/** Đánh dấu: khi mở lại URL này thì khôi phục vị trí cuộn. */
export function markRestore(url: string) {
  set(K_RESTORE, url);
}
export function takeRestore(url: string) {
  const v = get(K_RESTORE);
  if (v !== url) return false;
  del(K_RESTORE);
  return true;
}

type ScrollState = { x: number; y: number; inner: { t: number; l: number }[] };

function scrollBoxes() {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-list-scroll]"));
}

export function saveScroll(url: string) {
  const s: ScrollState = {
    x: window.scrollX,
    y: window.scrollY,
    inner: scrollBoxes().map((el) => ({ t: el.scrollTop, l: el.scrollLeft })),
  };
  set(K_SCROLL + url, JSON.stringify(s));
}

/** Khôi phục vị trí cuộn (trang + bảng), thử lại trong ~3 giây vì bảng có thể tải sau. */
export function restoreScroll(url: string) {
  let s: ScrollState | null = null;
  try {
    s = JSON.parse(get(K_SCROLL + url) ?? "null");
  } catch {
    s = null;
  }
  if (!s) return;
  const target = s;
  const started = Date.now();
  const tick = () => {
    window.scrollTo(target.x, target.y);
    const boxes = scrollBoxes();
    let done = Math.abs(window.scrollY - target.y) < 2 && boxes.length >= target.inner.length;
    boxes.forEach((el, i) => {
      const t = target.inner[i];
      if (!t) return;
      el.scrollTop = t.t;
      el.scrollLeft = t.l;
      if (Math.abs(el.scrollTop - t.t) > 2 || Math.abs(el.scrollLeft - t.l) > 2) done = false;
    });
    if (!done && Date.now() - started < 3000) window.setTimeout(tick, 100);
  };
  window.requestAnimationFrame(tick);
}

/** Cách sắp xếp đang bấm trên bảng (chưa Lưu cấu hình) — giữ lại khi quay về danh sách. */
export function loadSessionSort<T>(tableKey: string): T | null {
  try {
    return JSON.parse(get("kh:sort:" + tableKey) ?? "null") as T | null;
  } catch {
    return null;
  }
}
export function saveSessionSort(tableKey: string, value: unknown) {
  set("kh:sort:" + tableKey, JSON.stringify(value));
}
