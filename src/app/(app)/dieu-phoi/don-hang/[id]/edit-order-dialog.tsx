"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { ReferenceSelect } from "@/components/entities/reference-select";
import { CustomFieldsEditor } from "@/components/entities/custom-fields-editor";
import { updateOrderHeader } from "../../actions";
import type { FieldDef } from "@/lib/entities/types";

type Ref = { id: string; label: string };
export type EditOrderInit = {
  id: string;
  code: string;
  orderDate: string;
  customer: Ref;
  payer: Ref;
  company: Ref;
  notes: string;
  custom: Record<string, unknown>;
};

/** Sửa phần đầu đơn hàng tạo sai: khách hàng, khách thanh toán, đơn vị nội bộ, ngày đơn, ghi chú, trường bổ sung */
export function EditOrderDialog({ init, fields, billed }: { init: EditOrderInit; fields: FieldDef[]; billed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(init);
  const [custom, setCustom] = useState<Record<string, unknown>>(init.custom);
  const [pending, start] = useTransition();
  const set = (patch: Partial<EditOrderInit>) => setV((x) => ({ ...x, ...patch }));

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setV(init);
          setCustom(init.custom);
          setOpen(true);
        }}
      >
        <Pencil /> Sửa đơn hàng
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sửa đơn hàng {init.code}</DialogTitle>
            <DialogDescription>
              {billed
                ? "Đơn đã có chuyến lập công nợ: không đổi được khách hàng, khách thanh toán, đơn vị nội bộ (hủy phiếu công nợ trước). Vẫn sửa được ngày, ghi chú, trường bổ sung."
                : "Đổi khách hàng không tự tìm lại bảng giá: kiểm tra lại đơn giá từng chuyến bằng nút Sửa ở bảng chuyến bên dưới. Mọi thay đổi được ghi nhật ký."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="eo-customer">Khách hàng *</Label>
              <ReferenceSelect id="eo-customer" refKey="customers" value={v.customer.id} initialLabel={v.customer.label} disabled={billed} onChange={(id, label) => set({ customer: { id, label } })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eo-payer">Khách thanh toán</Label>
              <ReferenceSelect id="eo-payer" refKey="customers" value={v.payer.id} initialLabel={v.payer.label} disabled={billed} onChange={(id, label) => set({ payer: { id, label } })} />
              <p className="text-xs text-muted-foreground">Để trống là chính khách hàng.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eo-company">Đơn vị nội bộ (công ty xuất hóa đơn)</Label>
              <ReferenceSelect id="eo-company" refKey="company_entities" value={v.company.id} initialLabel={v.company.label} disabled={billed} onChange={(id, label) => set({ company: { id, label } })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="eo-date">Ngày đơn hàng *</Label>
              <Input id="eo-date" type="date" value={v.orderDate} onChange={(e) => set({ orderDate: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="eo-notes">Ghi chú</Label>
              <Textarea id="eo-notes" value={v.notes} maxLength={2000} onChange={(e) => set({ notes: e.target.value })} />
            </div>
          </div>
          {fields.length ? <CustomFieldsEditor fields={fields} idPrefix="eo-cf-" initial={init.custom} onChange={setCustom} className="sm:grid-cols-2" /> : null}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  if (!v.customer.id) return void toast.error("Chọn khách hàng");
                  const r = await updateOrderHeader({
                    orderId: init.id,
                    customerId: v.customer.id,
                    payerCustomerId: v.payer.id || null,
                    companyEntityId: v.company.id || null,
                    orderDate: v.orderDate,
                    notes: v.notes,
                    custom,
                  });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null} Lưu đơn hàng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
