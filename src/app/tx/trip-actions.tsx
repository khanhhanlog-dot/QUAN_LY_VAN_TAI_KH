"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { acceptTrip, changeVehicle } from "./actions";

export function AcceptButton({ shipmentId, code }: { shipmentId: string; code: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={pending}
        aria-label={`Nhận đơn ${code}`}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await acceptTrip(shipmentId);
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-success text-lg font-semibold text-white disabled:opacity-60"
      >
        <CheckCircle2 className="size-6" /> {pending ? "Đang gửi…" : "Nhận đơn"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ChangeVehicleButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await changeVehicle();
          router.refresh();
        })
      }
      className="rounded-lg border px-3 py-1.5 text-sm"
    >
      Đổi xe
    </button>
  );
}
