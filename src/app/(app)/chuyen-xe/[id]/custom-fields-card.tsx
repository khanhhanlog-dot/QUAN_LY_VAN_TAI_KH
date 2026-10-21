"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomFieldsEditor } from "@/components/entities/custom-fields-editor";
import { formatValue } from "@/lib/entities/record";
import { computeFormula } from "@/lib/formula";
import type { FieldDef } from "@/lib/entities/types";
import { updateShipmentCustom } from "../actions";

/** Trường bổ sung của chuyến: xem và sửa ngay trên trang chi tiết */
export function CustomFieldsCard({
  shipmentId,
  version,
  fields,
  values,
  canEdit,
  canAddField,
}: {
  shipmentId: string;
  version: number;
  fields: FieldDef[];
  values: Record<string, unknown>;
  canEdit: boolean;
  canAddField: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [pending, start] = useTransition();
  if (!fields.length && !canAddField) return null;
  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Trường bổ sung</CardTitle>
        <div className="flex gap-2">
          {canAddField ? (
            <Button variant="ghost" size="sm" asChild>
              <a href="/truong-du-lieu?module=shipments&them=1" target="_blank" rel="noopener">
                + Thêm trường
              </a>
            </Button>
          ) : null}
          {canEdit && fields.length && !editing ? (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil /> Sửa
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {!fields.length ? (
          <p className="text-sm text-muted-foreground">Chưa có trường bổ sung. Bấm “Thêm trường” để tạo (ví dụ số container, số PO, số seal).</p>
        ) : editing ? (
          <div className="space-y-3">
            <CustomFieldsEditor fields={fields} idPrefix="cf-" initial={values} onChange={setDraft} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={pending}>
                Hủy
              </Button>
              <Button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await updateShipmentCustom(shipmentId, draft, version);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(r.message);
                    setEditing(false);
                    router.refresh();
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Save />} Lưu
              </Button>
            </div>
          </div>
        ) : (
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {fields.map((f) => (
              <div key={f.key}>
                <dt className="text-xs text-muted-foreground">{f.label}</dt>
                <dd className="mt-0.5 font-medium">{formatValue(f, f.type === "formula" ? computeFormula(f.formula, values) : values[f.key]) || "–"}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
