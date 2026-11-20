// Sắp xếp dùng chung cho MỌI bảng/báo cáo: số theo số, ngày theo ngày, chữ theo tiếng Việt,
// ô trống luôn nằm cuối (cả khi tăng dần lẫn giảm dần). Không đặt trong file "use client".

export type SortVal = string | number | null | undefined;
export type SortRule = { id: string; desc: boolean };

const collator = new Intl.Collator("vi", { numeric: true, sensitivity: "base" });

export const isEmptySortVal = (v: SortVal) => v === null || v === undefined || (typeof v === "number" && Number.isNaN(v)) || (typeof v === "string" && v.trim() === "");

/** Đổi ô trống thành undefined để TanStack (sortUndefined: "last") đẩy xuống cuối */
export const emptyToUndef = (v: SortVal) => (isEmptySortVal(v) ? undefined : v);

/** Chuỗi trông như số kiểu Việt Nam ("1,234.5", "-16.4", "+7.6", "39%") → số; không phải số → null */
function numericLike(v: string): number | null {
  const s = v.trim().replace(/%$/, "");
  if (!/^[+-]?[\d,]*\.?\d+$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Ngày kiểu Việt Nam "dd/mm/yyyy" (có thể kèm giờ "hh:mm") → số yyyymmddhhmm; không phải → null */
function vnDate(v: string): number | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(v.trim());
  if (!m) return null;
  return Number(m[3]) * 1e8 + Number(m[2]) * 1e6 + Number(m[1]) * 1e4 + Number(m[4] ?? 0) * 100 + Number(m[5] ?? 0);
}

/** So sánh hai giá trị khác rỗng (tăng dần). */
export function compareSortVals(a: SortVal, b: SortVal): number {
  if (typeof a === "string" && typeof b === "string") {
    const da = vnDate(a);
    const db = vnDate(b);
    if (da !== null && db !== null) return da - db;
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "string" && typeof b === "string") {
    const na = numericLike(a);
    const nb = numericLike(b);
    if (na !== null && nb !== null) return na - nb;
  }
  if (typeof a === "number" && typeof b === "string") {
    const nb = numericLike(b);
    if (nb !== null) return a - nb;
  }
  if (typeof a === "string" && typeof b === "number") {
    const na = numericLike(a);
    if (na !== null) return na - b;
  }
  return collator.compare(String(a ?? ""), String(b ?? ""));
}

/**
 * Sắp xếp một mảng theo nhiều quy tắc (quy tắc đầu ưu tiên nhất). Ô trống luôn cuối.
 * Trả về mảng mới, ổn định (giữ thứ tự gốc khi bằng nhau).
 */
export function sortRows<T>(rows: T[], rules: SortRule[], valueOf: (row: T, id: string) => SortVal): T[] {
  if (!rules.length) return rows;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      for (const rule of rules) {
        const a = valueOf(x.r, rule.id);
        const b = valueOf(y.r, rule.id);
        const ea = isEmptySortVal(a);
        const eb = isEmptySortVal(b);
        if (ea || eb) {
          if (ea && eb) continue;
          return ea ? 1 : -1;
        }
        const c = compareSortVals(a, b);
        if (c !== 0) return rule.desc ? -c : c;
      }
      return x.i - y.i;
    })
    .map((x) => x.r);
}

/** Bấm tiêu đề: chưa sắp → tăng dần → giảm dần → bỏ. Giữ Shift để thêm cột phụ (tối đa 3). */
export function nextSortRules(rules: SortRule[], id: string, multi: boolean, firstDesc = false): SortRule[] {
  const cur = rules.find((r) => r.id === id);
  let next: SortRule | null;
  if (!cur) next = { id, desc: firstDesc };
  else if (cur.desc === firstDesc) next = { id, desc: !firstDesc };
  else next = null;
  if (!multi) return next ? [next] : [];
  const rest = rules.filter((r) => r.id !== id);
  if (!next) return rest;
  return cur ? rules.map((r) => (r.id === id ? next! : r)) : [...rest, next].slice(-3);
}

/** Mô tả để hiện cho người dùng: "Tổng số chuyến giảm dần, Biển số tăng dần" */
export function describeSort(rules: SortRule[], label: (id: string) => string | undefined): string {
  return rules
    .map((r) => {
      const l = label(r.id);
      return l ? `${l} ${r.desc ? "giảm dần" : "tăng dần"}` : null;
    })
    .filter(Boolean)
    .join(", ");
}

/** Đọc tham số URL "sx=col.desc,col2.asc" → quy tắc (chỉ giữ cột cho phép) */
export function parseSortParam(v: string | string[] | undefined | null, allowed: readonly string[]): SortRule[] {
  const s = Array.isArray(v) ? v[0] : v;
  if (!s) return [];
  const out: SortRule[] = [];
  for (const part of s.split(",")) {
    const [id, dir] = part.split(".");
    if (allowed.includes(id) && !out.some((r) => r.id === id)) out.push({ id, desc: dir === "desc" });
  }
  return out.slice(0, 3);
}
export const encodeSortParam = (rules: SortRule[]) => rules.map((r) => `${r.id}.${r.desc ? "desc" : "asc"}`).join(",");
