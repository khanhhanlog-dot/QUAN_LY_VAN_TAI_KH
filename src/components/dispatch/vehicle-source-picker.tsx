"use client";
import { useEffect, useRef, useState } from "react";
import { ReferenceSelect } from "@/components/entities/reference-select";
import { vehicleDefaultDriver } from "@/app/(app)/dieu-phoi/actions";
import { cn } from "@/lib/utils";

export type VehicleSource = "internal" | "3pl";

/**
 * Chọn xe theo nguồn: "Xe nội bộ" chỉ hiện xe công ty, "Xe 3-PL" chỉ hiện xe thuê ngoài
 * (thêm nhanh xe 3PL kèm nhà xe, tài xế ngay trong ô chọn). Xe đang gắn với chuyến tự chọn đúng nguồn.
 */
export function VehicleSourcePicker({
  id,
  value,
  initialLabel,
  onChange,
  onSourceChange,
  disabled,
  invalid,
}: {
  id?: string;
  value: string;
  initialLabel?: string;
  onChange: (id: string, label: string) => void;
  /** Báo nguồn đang chọn (để ẩn cảnh báo trùng xe, số chuyến khi là xe 3PL) */
  onSourceChange?: (source: VehicleSource) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const [source, setSource] = useState<VehicleSource>("internal");
  const checked = useRef<string>("");
  const notify = useRef(onSourceChange);
  useEffect(() => {
    notify.current = onSourceChange;
  });

  // Xe có sẵn (sửa chuyến, chuyến đã phân công): mở đúng tab theo xe đó
  useEffect(() => {
    if (!value || checked.current === value) return;
    checked.current = value;
    vehicleDefaultDriver(value).then((r) => {
      if (r.ok && r.data) {
        const s: VehicleSource = r.data.outsourced ? "3pl" : "internal";
        setSource(s);
        notify.current?.(s);
      }
    });
  }, [value]);

  function pick(s: VehicleSource) {
    if (s === source) return;
    setSource(s);
    notify.current?.(s);
    // Đổi nguồn thì bỏ xe đã chọn ở nguồn kia
    if (value) {
      checked.current = "";
      onChange("", "");
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="inline-flex rounded-md border bg-muted/40 p-0.5 text-xs" role="tablist" aria-label="Nguồn xe">
        {(
          [
            ["internal", "Xe nội bộ"],
            ["3pl", "Xe 3-PL"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={source === k}
            disabled={disabled}
            onClick={() => pick(k)}
            className={cn(
              "rounded px-2.5 py-1 font-medium transition-colors",
              source === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <ReferenceSelect
        key={source}
        id={id}
        refKey={source === "3pl" ? "vehicles_3pl" : "vehicles_internal"}
        value={value}
        initialLabel={initialLabel}
        onChange={onChange}
        disabled={disabled}
        invalid={invalid}
      />
      {source === "3pl" ? (
        <p className="text-xs text-muted-foreground">
          Chỉ hiện xe thuê ngoài. Chưa có xe thì gõ số xe rồi bấm Thêm mới (nhập nhà xe, tài xế luôn). Xe 3PL không tính số chuyến, thứ tự xe, tạm ứng, chi phí tài xế.
        </p>
      ) : null}
    </div>
  );
}
