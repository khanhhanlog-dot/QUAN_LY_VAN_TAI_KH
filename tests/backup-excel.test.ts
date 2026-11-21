import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildBackupWorkbook } from "@/lib/backup-excel";
import { backupCellValue, backupFileName, formatBytes, orderBackupTables, uniqueSheetName } from "@/lib/backup";

describe("Sao lưu dữ liệu ra Excel", () => {
  it("mỗi bảng một trang tính, có Mục lục, danh sách chuyến lên đầu", async () => {
    const buf = await buildBackupWorkbook({
      ExcelJS,
      title: "T",
      sheets: {
        zz_new_table: [{ a: 1 }],
        shipments: [
          { id: "s1", code: "SNOV-0001", custom_fields: { x: 1 }, total: 1500000.5 },
          { id: "s2", code: "SNOV-0002", extra: "chỉ dòng 2" },
        ],
        _shipment_list: [],
        customers: [{ id: "c1", name: "KWE" }],
      },
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Mục lục", "Danh sách chuyến (dễ đọc)", "Chuyến xe", "Khách hàng", "zz_new_table"]);
    const ship = wb.getWorksheet("Chuyến xe")!;
    expect(ship.getRow(1).values).toEqual([undefined, "id", "code", "custom_fields", "total", "extra"]);
    expect(ship.getRow(2).getCell(3).value).toBe('{"x":1}');
    expect(ship.getRow(2).getCell(4).value).toBe(1500000.5);
    expect(ship.getRow(3).getCell(5).value).toBe("chỉ dòng 2");
    expect(wb.getWorksheet("Danh sách chuyến (dễ đọc)")!.getRow(1).getCell(1).value).toBe("(không có dữ liệu)");
    expect(wb.getWorksheet("Mục lục")!.getRow(5).getCell(4).value).toBe(2);
  });
  it("tên trang tính hợp lệ, không trùng", () => {
    const used = new Set<string>();
    expect(uniqueSheetName("a/b:c", used)).toBe("a b c");
    expect(uniqueSheetName("A B C", used)).toBe("A B C 2");
    expect(uniqueSheetName("x".repeat(40), used)).toHaveLength(31);
  });
  it("tên tệp theo giờ Việt Nam, dung lượng, giá trị ô", () => {
    expect(backupFileName("2026-11-21T02:00:05Z")).toBe("sao-luu-KHANH-HA-2026-11-21-0900.xlsx");
    expect(formatBytes(2_500_000)).toBe("2.4 MB");
    expect(formatBytes(3000)).toBe("3 KB");
    expect(backupCellValue(null)).toBeNull();
    expect(backupCellValue([1, 2])).toBe("[1,2]");
    expect(orderBackupTables(["b", "shipments", "a"])).toEqual(["shipments", "a", "b"]);
  });
});
