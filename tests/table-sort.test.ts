import { describe, expect, it } from "vitest";
import { compareSortVals, encodeSortParam, nextSortRules, parseSortParam, sortRows } from "@/lib/table-sort";

type R = { name: string | null; total: number | null; vs: string; date: string };
const rows: R[] = [
  { name: "Nguyễn Văn Quý", total: 29, vs: "+2.6", date: "02/11/2026" },
  { name: "Hoàng Tiến Hóa", total: 10, vs: "-16.4", date: "15/10/2026" },
  { name: null, total: null, vs: "", date: "" },
  { name: "Đặng Văn An", total: 34, vs: "+7.6", date: "01/11/2026" },
  { name: "Bùi Minh", total: 2, vs: "1,234.5", date: "30/12/2025" },
];
const val = (r: R, id: string) => r[id as keyof R];

describe("table-sort", () => {
  it("số tăng/giảm, ô trống luôn cuối", () => {
    expect(sortRows(rows, [{ id: "total", desc: false }], val).map((r) => r.total)).toEqual([2, 10, 29, 34, null]);
    expect(sortRows(rows, [{ id: "total", desc: true }], val).map((r) => r.total)).toEqual([34, 29, 10, 2, null]);
  });
  it("chữ theo tiếng Việt (Đ sau D, trước E)", () => {
    expect(sortRows(rows, [{ id: "name", desc: false }], val).map((r) => r.name)).toEqual(["Bùi Minh", "Đặng Văn An", "Hoàng Tiến Hóa", "Nguyễn Văn Quý", null]);
  });
  it("chuỗi số có dấu, dấu phẩy nghìn và ngày dd/mm/yyyy", () => {
    expect(sortRows(rows, [{ id: "vs", desc: false }], val).map((r) => r.vs)).toEqual(["-16.4", "+2.6", "+7.6", "1,234.5", ""]);
    expect(sortRows(rows, [{ id: "date", desc: false }], val).map((r) => r.date)).toEqual(["30/12/2025", "15/10/2026", "01/11/2026", "02/11/2026", ""]);
    expect(compareSortVals("BX2", "BX10")).toBeLessThan(0);
  });
  it("chu kỳ bấm: tăng → giảm → bỏ; Shift thêm cột phụ", () => {
    let s = nextSortRules([], "total", false);
    expect(s).toEqual([{ id: "total", desc: false }]);
    s = nextSortRules(s, "total", false);
    expect(s).toEqual([{ id: "total", desc: true }]);
    expect(nextSortRules(s, "total", false)).toEqual([]);
    expect(nextSortRules(s, "name", true)).toEqual([{ id: "total", desc: true }, { id: "name", desc: false }]);
  });
  it("tham số URL", () => {
    expect(parseSortParam("total.desc,bad.asc,name.asc", ["total", "name"])).toEqual([{ id: "total", desc: true }, { id: "name", desc: false }]);
    expect(encodeSortParam([{ id: "total", desc: true }])).toBe("total.desc");
  });
});
