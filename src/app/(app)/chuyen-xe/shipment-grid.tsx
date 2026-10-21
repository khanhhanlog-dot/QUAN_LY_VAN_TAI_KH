"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime, formatNumber, formatVND } from "@/lib/format";
import { LOCKED_STATUSES, PRICING_UNITS } from "@/lib/status";
import { isLate, type ShipmentListRow } from "@/lib/shipments";
import { StatusBadge } from "@/components/dispatch/status-badge";
import { updateShipmentField, type EditableField } from "./actions";

type Col = {
  key: string;
  label: string;
  width: number;
  align?: "right";
  edit?: EditableField;
  render: (r: ShipmentListRow) => ReactNode;
};

const COLS: Col[] = [
  { key: "pickup_at", label: "Ngày giờ nhận", width: 140, render: (r) => formatDateTime(r.pickup_at) },
  {
    key: "shipment_code",
    label: "Mã chuyến",
    width: 170,
    render: (r) => (
      <Link href={`/chuyen-xe/${r.id}`} className="font-medium text-primary hover:underline">
        {r.shipment_code}
      </Link>
    ),
  },
  {
    key: "order_code",
    label: "Đơn hàng",
    width: 150,
    render: (r) => (
      <Link href={`/dieu-phoi/don-hang/${r.order_id}`} className="hover:text-primary hover:underline">
        {r.order_code}
      </Link>
    ),
  },
  { key: "customer_name", label: "Khách hàng", width: 180, render: (r) => r.customer_name },
  { key: "pickup_name", label: "Điểm nhận", width: 170, render: (r) => r.pickup_name },
  { key: "delivery_name", label: "Điểm giao", width: 170, render: (r) => r.delivery_name },
  { key: "vehicle_type_name", label: "Loại xe", width: 120, render: (r) => r.vehicle_type_name },
  { key: "plate_number", label: "Biển số", width: 100, render: (r) => r.plate_number },
  { key: "driver_name", label: "Tài xế", width: 150, render: (r) => r.driver_name },
  { key: "quantity", label: "SL", width: 70, align: "right", edit: "quantity", render: (r) => formatNumber(r.quantity) },
  { key: "pricing_unit", label: "ĐVT", width: 76, render: (r) => PRICING_UNITS[r.pricing_unit] ?? r.pricing_unit },
  { key: "unit_price", label: "Đơn giá", width: 120, align: "right", edit: "unit_price", render: (r) => formatVND(r.unit_price) },
  { key: "freight_amount", label: "Cước", width: 120, align: "right", render: (r) => formatVND(r.freight_amount) },
  { key: "surcharge_amount", label: "Phụ phí", width: 110, align: "right", edit: "surcharge_amount", render: (r) => formatVND(r.surcharge_amount) },
  {
    key: "fuel_support_rate",
    label: "% dầu",
    width: 72,
    align: "right",
    edit: "fuel_support_rate",
    render: (r) => (r.fuel_support_rate === null ? "–" : `${formatNumber(r.fuel_support_rate)}%`),
  },
  { key: "fuel_support_amount", label: "Hỗ trợ dầu", width: 115, align: "right", render: (r) => formatVND(r.fuel_support_amount) },
  { key: "total_revenue", label: "Tổng doanh thu", width: 130, align: "right", render: (r) => <b>{formatVND(r.total_revenue)}</b> },
  {
    key: "status",
    label: "Trạng thái",
    width: 190,
    render: (r) => (
      <span className="flex flex-wrap gap-1">
        <StatusBadge status={r.status} />
        {isLate(r) ? <Badge variant="destructive">Trễ</Badge> : null}
      </span>
    ),
  },
  { key: "document_status", label: "Chứng từ", width: 140, render: (r) => <StatusBadge kind="document" status={r.document_status} /> },
  { key: "settlement_status", label: "Quyết toán", width: 160, render: (r) => <StatusBadge kind="settlement" status={r.settlement_status} /> },
  { key: "notes", label: "Ghi chú", width: 220, edit: "notes", render: (r) => r.notes },
];

/** Bảng chuyến dạng Excel: cột cố định mã chuyến, sửa nhanh các ô được phép */
export function ShipmentGrid({ rows: initial, canEdit }: { rows: ShipmentListRow[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initial);
  // Dữ liệu mới từ máy chủ (đổi bộ lọc, chuyển trang) thay cho bản đang sửa
  const [prevInitial, setPrevInitial] = useState(initial);
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setRows(initial);
  }

  if (rows.length === 0) return <p className="px-6 py-10 text-center text-sm text-muted-foreground">Không có chuyến phù hợp với bộ lọc.</p>;
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-20 bg-muted text-left text-xs text-muted-foreground">
          <tr>
            {COLS.map((c, i) => (
              <th
                key={c.key}
                style={{ width: c.width, minWidth: c.width }}
                className={cn(
                  "border-b px-2 py-2 font-medium whitespace-nowrap",
                  c.align === "right" && "text-right",
                  i < 2 && "sticky z-30 bg-muted",
                  i === 0 && "left-0",
                  i === 1 && "left-[140px] border-r",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={cn("group", r.status === "cancelled" && "text-muted-foreground line-through decoration-muted-foreground/40")}>
              {COLS.map((c, i) => {
                const editable = canEdit && c.edit && (c.edit === "notes" || !LOCKED_STATUSES.includes(r.status));
                return (
                  <td
                    key={c.key}
                    className={cn(
                      "border-b bg-card px-2 py-1.5 group-hover:bg-muted/40",
                      c.align === "right" && "text-right tabular-nums",
                      i < 2 && "sticky z-10",
                      i === 0 && "left-0 whitespace-nowrap",
                      i === 1 && "left-[140px] border-r whitespace-nowrap",
                      !editable && "truncate",
                    )}
                    style={{ maxWidth: c.width }}
                  >
                    {editable ? (
                      <EditCell row={r} col={c} onSaved={(nr) => setRows((rs) => rs.map((x) => (x.id === nr.id ? nr : x)))} />
                    ) : (
                      c.render(r)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EditCell({ row, col, onSaved }: { row: ShipmentListRow; col: Col; onSaved: (r: ShipmentListRow) => void }) {
  const field = col.edit!;
  const raw = row[field as keyof ShipmentListRow] as number | string | null;
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const isText = field === "notes";

  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);

  async function commit() {
    const original = raw === null ? "" : String(raw);
    if (val.trim() === original.trim()) return setEditing(false);
    let value: number | string | null;
    if (isText) value = val.trim() || null;
    else if (val.trim() === "") {
      if (field !== "fuel_support_rate") return void toast.error("Không được để trống.");
      value = null;
    } else {
      value = Number(val.replace(",", "."));
      if (!Number.isFinite(value)) return void toast.error("Giá trị phải là số.");
    }
    setSaving(true);
    const r = await updateShipmentField(row.id, field, value, row.version);
    setSaving(false);
    if (!r.ok || !r.data) return void toast.error(r.ok ? "Không lưu được" : r.error);
    onSaved(r.data);
    setEditing(false);
    toast.success(`${row.shipment_code}: đã lưu ${col.label.toLowerCase()}.`);
  }

  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          ref={ref}
          aria-label={`${col.label} chuyến ${row.shipment_code}`}
          className={cn("h-7 w-full min-w-0 rounded border border-ring bg-background px-1.5 text-sm outline-none", !isText && "text-right")}
          type={isText ? "text" : "number"}
          step="any"
          value={val}
          disabled={saving}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => !saving && commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") setEditing(false);
          }}
        />
        {saving ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : null}
      </span>
    );
  }
  return (
    <button
      type="button"
      title="Bấm để sửa"
      className={cn(
        "block w-full truncate rounded border border-dashed border-transparent px-1 py-0.5 hover:border-muted-foreground/50 hover:bg-background",
        col.align === "right" ? "text-right" : "text-left",
        "decoration-dotted underline-offset-4 [text-decoration-line:underline] [text-decoration-color:var(--color-muted-foreground)]",
      )}
      onClick={() => {
        setVal(raw === null ? "" : String(raw));
        setEditing(true);
      }}
    >
      {col.render(row) || <span className="text-muted-foreground">…</span>}
    </button>
  );
}
