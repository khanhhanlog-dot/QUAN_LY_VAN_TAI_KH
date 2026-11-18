import { beforeEach, describe, expect, it } from "vitest";
import { lastList, markRestore, previousUrl, recordVisit, rememberedList, takeRestore } from "@/lib/list-memory";

function fakeWindow() {
  const m = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
  (globalThis as unknown as { window: unknown }).window = { sessionStorage };
}

describe("nhớ bộ lọc danh sách", () => {
  beforeEach(fakeWindow);

  it("nhớ URL lọc của từng danh sách và danh sách mở gần nhất", () => {
    recordVisit("/chuyen-xe?tu=2026-11-01&kh=abc");
    recordVisit("/chuyen-xe/123");
    expect(rememberedList("/chuyen-xe")).toBe("/chuyen-xe?tu=2026-11-01&kh=abc");
    expect(lastList()).toBe("/chuyen-xe?tu=2026-11-01&kh=abc");
    expect(previousUrl()).toBe("/chuyen-xe?tu=2026-11-01&kh=abc");
    recordVisit("/dieu-phoi?q=61K");
    recordVisit("/dieu-phoi/don-hang/9");
    expect(lastList()).toBe("/dieu-phoi?q=61K");
    expect(rememberedList("/chuyen-xe")).toBe("/chuyen-xe?tu=2026-11-01&kh=abc");
  });

  it("tải lại cùng trang không làm mất trang trước", () => {
    recordVisit("/dieu-phoi?q=1");
    recordVisit("/chuyen-xe/1");
    recordVisit("/chuyen-xe/1");
    expect(previousUrl()).toBe("/dieu-phoi?q=1");
  });

  it("chỉ khôi phục cuộn đúng một lần cho đúng URL", () => {
    markRestore("/chuyen-xe?a=1");
    expect(takeRestore("/chuyen-xe")).toBe(false);
    expect(takeRestore("/chuyen-xe?a=1")).toBe(true);
    expect(takeRestore("/chuyen-xe?a=1")).toBe(false);
  });
});
