"use client";
import { useEffect, useMemo, useTransition } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getEntity } from "@/lib/entities/definitions";
import { effectiveFields, formatValue, isFieldShown, toFormValues, validateRecord } from "@/lib/entities/record";
import { computeFormula } from "@/lib/formula";
import { saveRecord } from "@/lib/entities/actions";
import type { CustomFieldRow, FieldDef } from "@/lib/entities/types";
import type { RefLabels } from "@/lib/entities/server";
import { FieldInput } from "./field-input";

type Values = Record<string, unknown>;

/** Các trường hiện trong biểu mẫu (tạo nhanh: chỉ trường tạo nhanh + bắt buộc không có mặc định) */
export function formFields(entityKey: string, customRows: CustomFieldRow[], quick: boolean): FieldDef[] {
  const entity = getEntity(entityKey);
  const all = effectiveFields(entity, customRows).filter((f) => !f.hideInForm && f.key !== entity.parentKey);
  if (!quick) return all;
  const q = new Set(entity.quickFields ?? []);
  return all.filter((f) => q.has(f.key) || (f.required && f.defaultValue === undefined && !f.readOnly && f.type !== "formula"));
}

export function EntityFormDialog({
  entityKey,
  customRows,
  open,
  onOpenChange,
  record,
  parentId,
  refLabels,
  quick = false,
  revalidate,
  onSaved,
  readOnly = false,
  initialValues,
}: {
  entityKey: string;
  customRows: CustomFieldRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record?: Record<string, unknown> | null;
  parentId?: string;
  refLabels?: RefLabels;
  quick?: boolean;
  revalidate?: string;
  onSaved?: (res: { id: string; label: string }) => void;
  readOnly?: boolean;
  /** Giá trị điền sẵn khi thêm mới (ví dụ chữ vừa gõ để tìm, thông tin chuyến đang tạo) */
  initialValues?: Values;
}) {
  const entity = getEntity(entityKey);
  const fields = useMemo(() => formFields(entityKey, customRows, quick), [entityKey, customRows, quick]);
  const isEdit = Boolean(record);
  const pk = entity.pk ?? "id";
  const [pending, startTransition] = useTransition();

  const resolver: Resolver<Values> = async (values) => {
    const visible = fields.filter((f) => isFieldShown(f, values));
    const { errors } = validateRecord(visible, values);
    const keys = Object.keys(errors);
    if (keys.length === 0) return { values, errors: {} };
    return { values: {}, errors: Object.fromEntries(keys.map((k) => [k, { type: "validate", message: errors[k] }])) };
  };

  const blank = () =>
    initialValues ? toFormValues(fields, { ...Object.fromEntries(fields.map((f) => [f.key, f.defaultValue])), ...initialValues }) : toFormValues(fields, null);
  const form = useForm<Values>({ resolver, defaultValues: record ? toFormValues(fields, record) : blank(), mode: "onSubmit" });
  // Mở lại hộp thêm mới: điền giá trị mới nhất (chữ vừa gõ, thông tin chuyến)
  useEffect(() => {
    if (open && !record) form.reset(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const values = useWatch({ control: form.control }) as Values;

  function onSubmit(v: Values) {
    startTransition(async () => {
      const res = await saveRecord(entityKey, {
        id: entity.singleton ? null : ((record?.[pk] as string) ?? null),
        parentId,
        values: v,
        expectedUpdatedAt: (record?.updated_at as string) ?? null,
        quick,
        revalidate,
      });
      if (res.ok) {
        toast.success(res.message);
        onOpenChange(false);
        form.reset(blank());
        if (res.data) onSaved?.(res.data);
      } else {
        toast.error(res.error);
      }
    });
  }

  const title = readOnly
    ? `Chi tiết ${entity.singular}`
    : quick
      ? `Thêm nhanh ${entity.singular}`
      : isEdit
        ? `Sửa ${entity.singular}${record?.code ? ` ${record.code}` : ""}`
        : `Thêm ${entity.singular}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) form.reset(toFormValues(fields, record ?? null));
      }}
    >
      <DialogContent className={cn(quick ? "max-w-lg" : "max-w-3xl")} onInteractOutside={(e) => form.formState.isDirty && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {quick ? "Chỉ cần các thông tin chính; bổ sung chi tiết sau trong danh mục." : "Trường có dấu * là bắt buộc."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.stopPropagation(); // không gửi biểu mẫu cha khi đang tạo nhanh
            form.handleSubmit(onSubmit)(e);
          }}
          noValidate
          className="space-y-4"
        >
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {fields.map((f) => {
              if (!isFieldShown(f, values)) return null;
              const err = form.formState.errors[f.key]?.message as string | undefined;
              const wide = f.wide || f.type === "multiselect" || f.type === "textarea";
              if (f.type === "formula" || (f.readOnly && f.custom)) {
                const v = f.type === "formula" ? computeFormula(f.formula, values) : record?.[f.key];
                return (
                  <div key={f.key} className={cn("space-y-1.5", wide && "sm:col-span-2")}>
                    <Label>{f.label}</Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">{formatValue(f, v) || "—"}</div>
                    {f.type === "formula" ? <p className="text-xs text-muted-foreground">Tự tính: {f.formula}</p> : null}
                  </div>
                );
              }
              if (f.readOnly) {
                if (!record) return null;
                return (
                  <div key={f.key} className={cn("space-y-1.5", wide && "sm:col-span-2")}>
                    <Label>{f.label}</Label>
                    <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm">{formatValue(f, record[f.key]) || "—"}</div>
                    {f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null}
                  </div>
                );
              }
              return (
                <div key={f.key} className={cn("space-y-1.5", wide && "sm:col-span-2")}>
                  {f.type !== "boolean" ? (
                    <Label htmlFor={`f_${f.key}`}>
                      {f.label}
                      {f.required ? <span className="text-destructive"> *</span> : null}
                      {f.custom ? <span className="ml-1 text-[10px] font-normal text-muted-foreground">(trường bổ sung)</span> : null}
                    </Label>
                  ) : null}
                  <FieldInput
                    field={f}
                    control={form.control}
                    register={form.register}
                    invalid={Boolean(err)}
                    refLabel={f.type === "reference" && record ? refLabels?.[f.key]?.[String(record[f.key])] : undefined}
                    disabled={readOnly || pending}
                  />
                  {err ? <p className="text-xs text-destructive">{err}</p> : f.help ? <p className="text-xs text-muted-foreground">{f.help}</p> : null}
                </div>
              );
            })}
          </div>
          {!readOnly ? (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                Hủy
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" /> : null}
                {pending ? "Đang lưu…" : "Lưu"}
              </Button>
            </DialogFooter>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
