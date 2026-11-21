// Tạo tệp Excel từ bản sao lưu: mỗi bảng một trang tính, trang đầu là Mục lục.
// Dùng được cả trên trình duyệt (tải bản đầy đủ) và máy chủ (đính kèm email). Không đặt "use client".
import type ExcelJSType from "exceljs";
import { backupCellValue, backupTableLabel, orderBackupTables, uniqueSheetName } from "@/lib/backup";

const BORDER = { top: { style: "thin" as const }, bottom: { style: "thin" as const }, left: { style: "thin" as const }, right: { style: "thin" as const } };

export async function buildBackupWorkbook(opts: {
  ExcelJS: typeof ExcelJSType;
  title: string;
  subtitle?: string;
  sheets: Record<string, Record<string, unknown>[]>;
}): Promise<ArrayBuffer> {
  const wb = new opts.ExcelJS.Workbook();
  wb.creator = "KHÁNH HÀ TMS";
  const used = new Set<string>();
  const names = orderBackupTables(Object.keys(opts.sheets));

  // Mục lục
  const toc = wb.addWorksheet(uniqueSheetName("Mục lục", used));
  toc.addRow([opts.title]).font = { bold: true, size: 13 };
  if (opts.subtitle) toc.addRow([opts.subtitle]).font = { italic: true };
  toc.addRow([]);
  const tocHead = toc.addRow(["STT", "Trang tính", "Tên bảng gốc", "Số dòng"]);
  styleHeader(tocHead);
  toc.getColumn(1).width = 6;
  toc.getColumn(2).width = 34;
  toc.getColumn(3).width = 30;
  toc.getColumn(4).width = 12;
  toc.getColumn(4).numFmt = "#,##0";

  const sheetNames: string[] = names.map((n) => uniqueSheetName(backupTableLabel(n), used));
  names.forEach((n, i) => {
    const r = toc.addRow([i + 1, sheetNames[i], n.startsWith("_") ? "" : n, opts.sheets[n]?.length ?? 0]);
    r.getCell(2).value = { text: sheetNames[i], hyperlink: `#'${sheetNames[i]}'!A1` };
    r.getCell(2).font = { color: { argb: "FF1D4ED8" }, underline: true };
    r.eachCell((c) => (c.border = BORDER));
  });

  names.forEach((n, i) => {
    const rows = opts.sheets[n] ?? [];
    const ws = wb.addWorksheet(sheetNames[i]);
    const cols: string[] = [];
    const seen = new Set<string>();
    for (const r of rows)
      for (const k of Object.keys(r))
        if (!seen.has(k)) {
          seen.add(k);
          cols.push(k);
        }
    if (!cols.length) {
      ws.addRow(["(không có dữ liệu)"]);
      return;
    }
    styleHeader(ws.addRow(cols));
    for (const r of rows) ws.addRow(cols.map((c) => backupCellValue(r[c])));
    cols.forEach((c, ci) => {
      const col = ws.getColumn(ci + 1);
      col.width = Math.min(40, Math.max(10, c.length + 2));
      if (rows.some((r) => typeof r[c] === "number")) col.numFmt = "#,##0.##";
    });
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  });

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

function styleHeader(row: ExcelJSType.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  row.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    c.border = BORDER;
  });
}
