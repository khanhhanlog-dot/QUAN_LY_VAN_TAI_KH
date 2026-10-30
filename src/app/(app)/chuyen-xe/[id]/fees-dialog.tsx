"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FeesEditor, feesPayload, newFee, type FeeKind, type FeeLine } from "@/app/(app)/dieu-phoi/tao-don/fees-editor";
import { saveShipmentFees } from "@/app/(app)/dieu-phoi/actions";

export type ShipmentFee = { line_no: number; fee_type_id: string; fee_kind: FeeKind; amount: number; note: string | null; fee_type: { name: string } | null };

/** Nhập, sửa các khoản phí thu khách của chuyến (bốc xếp, chi hộ…) */
export function FeesDialog({ shipmentId, code, fees }: { shipmentId: string; code: string; fees: ShipmentFee[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<FeeLine[]>([]);
  const [pending, start] = useTransition();

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setLines(fees.map((f) => newFee({ fee_type_id: f.fee_type_id, label: f.fee_type?.name ?? "", kind: f.fee_kind, amount: String(Number(f.amount)), note: f.note ?? "" })));
          setOpen(true);
        }}
      >
        <Receipt /> {fees.length ? "Sửa phí thu khách" : "Thêm phí thu khách"}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Phí thu khách của chuyến {code}</DialogTitle>
            <DialogDescription>Các khoản ngoài cước vận chuyển. Phí chi hộ có trong số khách phải trả nhưng không tính doanh thu. Chuyến đã lập công nợ thì không sửa được phí.</DialogDescription>
          </DialogHeader>
          <FeesEditor value={lines} onChange={setLines} idPrefix="ct-fee-" />
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveShipmentFees({ shipmentId, fees: feesPayload(lines) });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null} Lưu phí
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
