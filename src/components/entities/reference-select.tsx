"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2, Pencil, Plus, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ENTITIES } from "@/lib/entities/definitions";
import { getEntityMeta, getRecordForEdit, searchReferences, type RefOption } from "@/lib/entities/actions";
import type { RefLabels } from "@/lib/entities/server";
import type { CustomFieldRow } from "@/lib/entities/types";
import type { EntityAccess } from "@/lib/entities/access";
import { EntityFormDialog } from "./entity-form-dialog";

type Meta = { customRows: CustomFieldRow[]; access: EntityAccess };
const metaCache = new Map<string, Promise<Meta | null>>();
function loadMeta(refKey: string) {
  if (!metaCache.has(refKey)) {
    metaCache.set(
      refKey,
      getEntityMeta(refKey).then((r) => (r.ok && r.data ? r.data : null)),
    );
  }
  return metaCache.get(refKey)!;
}

export function ReferenceSelect({
  id,
  refKey,
  value,
  initialLabel,
  onChange,
  disabled,
  invalid,
  allowQuickCreate = true,
  where,
  quickDefaults,
  autoOpen,
}: {
  id?: string;
  refKey: string;
  value: string;
  initialLabel?: string;
  onChange: (value: string, label: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  allowQuickCreate?: boolean;
  /** Chỉ hiện dòng có cột = giá trị (cột tham chiếu / lựa chọn của danh mục) */
  where?: Record<string, string>;
  /** Giá trị điền sẵn khi bấm Thêm mới */
  quickDefaults?: Record<string, unknown>;
  /** Mở sẵn ô tìm khi vừa hiện (nhập trực tiếp trên bảng: bấm ô là gõ được ngay) */
  autoOpen?: boolean;
}) {
  const entity = ENTITIES[refKey];
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<RefOption[]>([]);
  const [label, setLabel] = useState(initialLabel ?? "");
  const [loading, startLoading] = useTransition();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  // Bút chì cạnh từng mục: bản ghi đang mở để sửa
  const [edit, setEdit] = useState<{ record: Record<string, unknown>; refLabels: RefLabels; parentId: string | null } | null>(null);
  const [editLoading, setEditLoading] = useState<string | null>(null);

  // Hiển thị nhãn khi chỉ có id (ví dụ bản ghi mới tải)
  useEffect(() => {
    if (value && !label) {
      searchReferences(refKey, "", [value]).then((r) => {
        if (r.ok) setLabel(r.data?.find((o) => o.value === value)?.label ?? "");
      });
    }
  }, [value, label, refKey]);

  useEffect(() => {
    if (entity && !disabled) loadMeta(refKey).then(setMeta);
  }, [entity, disabled, refKey]);

  function search(term: string) {
    startLoading(async () => {
      const r = await searchReferences(refKey, term, value ? [value] : [], where ?? {});
      if (r.ok) setOptions(r.data ?? []);
    });
  }

  useEffect(() => {
    if (autoOpen && !disabled) onOpenChange(true);
    // Chỉ mở một lần khi ô vừa hiện
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      search(q);
    }
  }

  function onQuery(term: string) {
    setQ(term);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(term), 250);
  }

  function pick(o: RefOption | null) {
    setLabel(o?.label ?? "");
    onChange(o?.value ?? "", o?.label ?? "");
    setOpen(false);
  }

  const canQuick = allowQuickCreate && entity?.quickFields && meta?.access.create;
  const canEdit = Boolean(meta?.access.update && !entity?.singleton && !disabled);

  async function startEdit(o: RefOption) {
    setEditLoading(o.value);
    const r = await getRecordForEdit(refKey, o.value);
    setEditLoading(null);
    if (!r.ok || !r.data) return void toast.error(r.ok ? "Không mở được bản ghi để sửa" : r.error);
    setOpen(false);
    setEdit(r.data);
  }

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild disabled={disabled}>
          <button
            id={id}
            type="button"
            className={cn(
              "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-left text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
              !value && "text-muted-foreground",
              invalid && "border-destructive",
            )}
          >
            <span className="truncate">{value ? label || "Đang tải…" : `Chọn ${entity?.singular ?? ""}`}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] p-0">
          <div className="border-b p-2">
            <Input autoFocus placeholder="Gõ để tìm…" value={q} onChange={(e) => onQuery(e.target.value)} className="h-8" />
          </div>
          <ul className="max-h-64 overflow-y-auto p-1" role="listbox">
            {loading && options.length === 0 ? (
              <li className="flex items-center gap-2 px-2 py-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Đang tìm…
              </li>
            ) : null}
            {!loading && options.length === 0 ? (
              <li className="px-2 py-2 text-muted-foreground">
                {q.trim() ? `Chưa có “${q.trim()}”.` : "Danh sách đang trống."}
                {canQuick ? " Bấm “Thêm mới” bên dưới để tạo ngay." : allowQuickCreate && entity?.quickFields ? " Bạn chưa có quyền thêm mới, nhờ quản trị viên tạo trong danh mục." : ""}
              </li>
            ) : null}
            {options.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  onClick={() => pick(o)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent"
                >
                  <Check className={cn("size-4 shrink-0", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate" title={o.label}>
                    {o.label}
                  </span>
                  {canEdit ? (
                    <span
                      role="button"
                      tabIndex={-1}
                      title={`Sửa ${entity?.singular ?? ""} “${o.label}”`}
                      aria-label={`Sửa ${entity?.singular ?? ""} ${o.label}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!editLoading) void startEdit(o);
                      }}
                      className="-my-1 flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-primary"
                    >
                      {editLoading === o.value ? <Loader2 className="size-3.5 animate-spin" /> : <Pencil className="size-3.5" />}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {canQuick ? (
            <div className="border-t p-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-primary hover:bg-accent"
                onClick={() => {
                  setOpen(false);
                  setQuickOpen(true);
                }}
              >
                <Plus className="size-4" /> {q.trim() ? `Thêm mới “${q.trim()}”` : `Thêm ${entity.singular} mới`}
              </button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {value && !disabled ? (
        <button
          type="button"
          onClick={() => pick(null)}
          className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-foreground"
          aria-label="Bỏ chọn"
          title="Bỏ chọn"
        >
          <X className="size-4" />
        </button>
      ) : null}
      {canQuick && !disabled ? (
        <button
          type="button"
          onClick={() => setQuickOpen(true)}
          className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-card text-primary hover:bg-accent"
          aria-label={`Thêm ${entity.singular} mới`}
          title={`Thêm ${entity.singular} mới`}
        >
          <Plus className="size-4" />
        </button>
      ) : null}
      {canQuick && meta ? (
        <EntityFormDialog
          entityKey={refKey}
          customRows={meta.customRows}
          open={quickOpen}
          onOpenChange={setQuickOpen}
          canAddField={meta.access.configureFields}
          quick
          initialValues={
            q.trim() || quickDefaults
              ? { ...(quickDefaults ?? {}), ...(q.trim() ? { [entity.quickFields?.[0] ?? entity.labelCols[0]]: q.trim() } : {}) }
              : undefined
          }
          onSaved={(res) => pick({ value: res.id, label: res.label })}
        />
      ) : null}
      {edit && meta ? (
        <EntityFormDialog
          key={String(edit.record.id ?? "")}
          entityKey={refKey}
          customRows={meta.customRows}
          open
          onOpenChange={(o) => !o && setEdit(null)}
          record={edit.record}
          refLabels={edit.refLabels}
          parentId={edit.parentId ?? undefined}
          canAddField={meta.access.configureFields}
          onSaved={(res) => {
            setOptions((list) => list.map((x) => (x.value === res.id ? { ...x, label: res.label } : x)));
            if (res.id === value) setLabel(res.label);
            setEdit(null);
            // Bảng, thẻ chi tiết đang hiện tên cũ: tải lại dữ liệu trang
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
