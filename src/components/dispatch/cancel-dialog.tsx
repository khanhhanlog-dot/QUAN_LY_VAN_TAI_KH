"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label, Textarea } from "@/components/ui/input";
import { cancelShipment, restoreShipment } from "@/app/(app)/dieu-phoi/actions";

export function CancelDialog({ shipmentId, shipmentCode, compact }: { shipmentId: string; shipmentCode: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={compact ? "h-7 px-2 text-destructive" : "text-destructive"}
        onClick={() => setOpen(true)}
        aria-label="Hủy chuyến"
        title="Hủy chuyến"
      >
        <Ban />
        {compact ? null : " Hủy chuyến"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hủy chuyến {shipmentCode}</DialogTitle>
            <DialogDescription>Chuyến không bị xóa mà chuyển sang trạng thái Đã hủy, lý do được lưu vào lịch sử. Phân công hiện tại sẽ bị gỡ.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`cancel-${shipmentId}`}>Lý do hủy</Label>
            <Textarea id={`cancel-${shipmentId}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Đóng
            </Button>
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                start(async () => {
                  const r = await cancelShipment({ shipmentId, reason });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null} Xác nhận hủy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Khôi phục chuyến đã hủy về "Chưa phân công" */
export function RestoreShipmentButton({ shipmentId, shipmentCode, compact }: { shipmentId: string; shipmentCode: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant="outline" size="sm" className={compact ? "h-7 px-2" : undefined} onClick={() => setOpen(true)} title="Khôi phục chuyến đã hủy">
        <RotateCcw /> Khôi phục
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Khôi phục chuyến {shipmentCode}</DialogTitle>
            <DialogDescription>
              Chuyến trở về trạng thái Chưa phân công (giữ nguyên giá, điểm nhận/giao). Đơn hàng đã hủy được mở lại. Nếu cont đã trở về Lập kế hoạch thì được lấy lại khỏi
              kế hoạch. Sau đó phân công lại xe, tài xế.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Đóng
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await restoreShipment({ shipmentId });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(r.message);
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Khôi phục
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
