"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, CircleDollarSign, Loader2, Lock, Receipt, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FeesEditor, countFeeFiles, feeTotals, feesPayload, newFee, numText, uploadFeeFiles, useFeeCatalog, type FeeFiles, type FeeLine } from "@/app/(app)/dieu-phoi/tao-don/fees-editor";
import { saveShipmentFees } from "@/app/(app)/dieu-phoi/actions";
import { CarrierCostsEditor, carrierFormFrom, carrierFormPayload, carrierFormTotal, type CarrierForm } from "@/components/finance/carrier-dialogs";
import { saveCarrierCosts } from "@/lib/finance/carrier-actions";
import { loadQuickFreight, saveQuickFreightPrice, type QuickFreight } from "@/lib/finance/quick-freight-actions";
import { createClient } from "@/lib/supabase/client";
import { parseNumberVN } from "@/lib/entities/record";
import { formatDate, formatNumber, formatVND } from "@/lib/format";
import { PRICING_UNITS } from "@/lib/status";
import { cn } from "@/lib/utils";

type Price = { unitPrice: string; fuelRate: string; surcharge: string };
type LockInfo = { mine: boolean; holder_name?: string | null; holder_since?: string | null; stale?: boolean; saved_by_name?: string | null; saved_by_me?: boolean };

const num = (s: string) => {
  const v = parseNumberVN(s, true);
  return v === null || Number.isNaN(v) ? null : v;
};
const pct = (s: string) => {
  const v = parseNumberVN(s);
  return v === null || Number.isNaN(v) ? null : v;
};
const hm = (t?: string | null) => (t ? new Date(t).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }) : "");
const FUEL_CALC = ["freight_revenue", "unit_price", "total_revenue"];

/**
 * Nút "Nhập cước": mở một khung nhập đủ phần thu khách (Đơn giá, % hỗ trợ dầu, Phí vận chuyển, Phí chi hộ kèm hóa đơn PDF,
 * Tờ khai, Bốc xếp…) và, với chuyến chạy 3PL, phần Chi phí trả 3PL. Dùng ở chi tiết chuyến, Điều phối, Quản lý chuyến.
 * Mở khung thì nhận quyền sửa chuyến (khóa 0061): người khác đang sửa thì chỉ xem.
 */
export function QuickFreightButton({
  shipmentId,
  code,
  compact,
  className,
  label,
  carrierFirst,
  onSaved,
}: {
  shipmentId: string;
  code: string;
  compact?: boolean;
  className?: string;
  /** Chữ trên nút (mặc định "Nhập cước" / "Cước") */
  label?: string;
  /** Mở sẵn tab Chi phí trả 3PL (màn hình Xe thuê ngoài 3PL) */
  carrierFirst?: boolean;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={compact ? "ghost" : "outline"}
        size="sm"
        className={cn(compact ? "h-7 px-2" : undefined, className)}
        title={carrierFirst ? `Nhập cước, chi hộ, chi phí khác trả nhà xe 3PL chuyến ${code}` : `Nhập cước, phí thu khách và chi phí 3PL chuyến ${code}`}
        onClick={() => setOpen(true)}
      >
        {carrierFirst ? <Truck /> : <CircleDollarSign />} {label ?? (compact ? "Cước" : "Nhập cước")}
      </Button>
      {open ? <QuickFreightDialog shipmentId={shipmentId} code={code} carrierFirst={carrierFirst} onSaved={onSaved} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Khung Nhập cước: chỉ dựng khi mở (bảng nhiều dòng không tải gì trước) */
function QuickFreightDialog({
  shipmentId,
  code,
  carrierFirst,
  onSaved,
  onClose,
}: {
  shipmentId: string;
  code: string;
  carrierFirst?: boolean;
  onSaved?: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const open = true;
  const setOpen = (o: boolean) => {
    if (!o) onClose();
  };
  const [data, setData] = useState<QuickFreight | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"customer" | "carrier">("customer");
  const [price, setPrice] = useState<Price>({ unitPrice: "", fuelRate: "", surcharge: "" });
  const [fees, setFees] = useState<FeeLine[]>([]);
  const [files, setFiles] = useState<FeeFiles>({});
  const [carrier, setCarrier] = useState<CarrierForm | null>(null);
  const [dirty, setDirty] = useState({ price: false, fees: false, carrier: false });
  const [lock, setLock] = useState<LockInfo | null>(null);
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const [catalog] = useFeeCatalog();
  const holding = useRef(false);

  function apply(r: Awaited<ReturnType<typeof loadQuickFreight>>) {
    setLoading(false);
    if (!r.ok || !r.data) {
      setOpen(false);
      return void toast.error(r.ok ? "Không tải được chuyến." : r.error);
    }
    const d = r.data;
    setData(d);
    setPrice({
      unitPrice: d.unitPrice ? formatNumber(d.unitPrice) : "",
      fuelRate: d.fuelRate === null ? "" : String(d.fuelRate),
      surcharge: d.surcharge ? formatNumber(d.surcharge) : "",
    });
    setFees(
      d.fees.map((f) =>
        newFee({
          fee_type_id: f.fee_type_id,
          label: f.fee_type?.name ?? "",
          kind: f.fee_kind,
          amount: formatNumber(Number(f.amount)),
          note: f.note ?? "",
          declaration_type_id: f.declaration_type_id ?? "",
          declaration_label: f.declaration?.name ?? "",
          ref_no: f.ref_no ?? "",
          quantity: numText(f.quantity),
          unit_price: numText(f.unit_price),
        }),
      ),
    );
    setFiles({});
    setCarrier(d.carrier ? carrierFormFrom(d.carrier) : null);
    if (carrierFirst && d.carrier) setTab("carrier");
    setDirty({ price: false, fees: false, carrier: false });
  }

  useEffect(() => {
    let alive = true;
    void loadQuickFreight(shipmentId).then((r) => alive && apply(r));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId]);

  // Khóa sửa chuyến: nhận khi mở khung, báo "còn sửa" mỗi 30 giây, nhả khi đóng
  const rev = data?.rev ?? null;
  useEffect(() => {
    if (!open || rev === null || data?.status === "cancelled") return;
    const supabase = createClient();
    let stop = false;
    const ping = async () => {
      const { data: s, error } = await supabase.rpc("shipment_edit_lock", { p_shipment_id: shipmentId, p_rev: rev });
      if (stop || error) return;
      const st = s as LockInfo;
      holding.current = Boolean(st.mine);
      setLock(st);
    };
    void ping();
    const iv = window.setInterval(() => void ping(), 30_000);
    return () => {
      stop = true;
      window.clearInterval(iv);
      if (holding.current) {
        holding.current = false;
        void supabase.rpc("shipment_edit_unlock", { p_shipment_id: shipmentId });
      }
    };
  }, [open, rev, shipmentId, data?.status]);

  async function ask() {
    setAsking(true);
    const { data: r, error } = await createClient().rpc("shipment_edit_ask", { p_shipment_id: shipmentId });
    setAsking(false);
    if (error) return void toast.error("Chưa gửi được, thử lại sau.");
    const x = r as { sent: boolean; holder_name?: string };
    toast[x.sent ? "success" : "info"](x.sent ? `Đã báo ${x.holder_name ?? "người đang sửa"} lưu và thoát ra.` : "Người kia đã thoát ra, đóng khung rồi mở lại để sửa.");
  }

  const blocked = Boolean(lock?.holder_name);
  const stale = Boolean(lock?.mine && lock.stale && !lock.saved_by_me);
  const canPrice = Boolean(data?.canEditFees);
  const canCarrier = Boolean(data?.carrier?.canEdit);

  // Tính lại tiền cước, tiền dầu như CSDL (để xem trước Tổng phí vận chuyển)
  const qty = data?.quantity ?? 1;
  const unitPrice = num(price.unitPrice) ?? 0;
  const surcharge = num(price.surcharge) ?? 0;
  const rate = price.fuelRate.trim() === "" ? null : pct(price.fuelRate);
  const freight = Math.round(unitPrice * qty);
  const base = data?.fuelBase ?? (rate !== null ? "freight_revenue" : null);
  const fuel =
    rate === null
      ? 0
      : base && FUEL_CALC.includes(base)
        ? Math.round(((base === "unit_price" ? unitPrice : base === "total_revenue" ? freight + surcharge : freight) * rate) / 100)
        : (data?.fuelAmount ?? 0);
  const totals = feeTotals(fees, catalog);
  const transport = freight + surcharge + fuel + totals.byRole.freight;
  const unit = data ? (PRICING_UNITS[data.pricingUnit] ?? data.pricingUnit) : "";
  const freightLabel = `Đơn giá${qty !== 1 ? ` × ${formatNumber(qty)}` : ""}${rate ? ` × (1 + ${formatNumber(rate)}%)` : ""}${surcharge ? " + phụ phí" : ""}`;
  const customerPass = fees
    .filter((l) => l.fee_type_id && (l.kind ?? catalog?.types.find((t) => t.id === l.fee_type_id)?.fee_kind) === "pass_through" && (num(l.amount) ?? 0) > 0)
    .map((l) => ({ fee_type_id: l.fee_type_id, name: l.label || "Chi hộ", amount: num(l.amount) ?? 0, ref_no: l.ref_no || null, note: l.note || null }));

  function save() {
    if (!data) return;
    start(async () => {
      const done: string[] = [];
      if (dirty.price && canPrice) {
        if ([price.unitPrice, price.surcharge].some((s) => s.trim() && num(s) === null) || (price.fuelRate.trim() && rate === null))
          return void toast.error("Đơn giá, phụ phí hoặc % hỗ trợ dầu không phải là số.");
        const r = await saveQuickFreightPrice({ id: data.id, version: data.version, unitPrice, surchargeAmount: surcharge, fuelSupportRate: rate });
        if (!r.ok) return void toast.error(r.error);
        done.push("giá");
        setDirty((d) => ({ ...d, price: false }));
      }
      if ((dirty.fees || countFeeFiles(files)) && data.canEditFees) {
        const r = await saveShipmentFees({ shipmentId: data.id, fees: feesPayload(fees) });
        if (!r.ok) return void toast.error(done.length ? `Đã lưu ${done.join(", ")} nhưng phí thu khách chưa lưu: ${r.error}` : r.error);
        if (countFeeFiles(files)) {
          const err = await uploadFeeFiles(data.id, files);
          if (err) toast.warning(err, { duration: 15000 });
        }
        done.push("phí thu khách");
        setDirty((d) => ({ ...d, fees: false }));
      }
      if (dirty.carrier && carrier && canCarrier) {
        const p = carrierFormPayload(data.id, carrier);
        if ("error" in p) {
          setTab("carrier");
          return void toast.error(done.length ? `Đã lưu ${done.join(", ")}. Chi phí 3PL: ${p.error}` : p.error);
        }
        const r = await saveCarrierCosts(p.input);
        if (!r.ok) {
          setTab("carrier");
          return void toast.error(done.length ? `Đã lưu ${done.join(", ")} nhưng chi phí 3PL chưa lưu: ${r.error}` : r.error);
        }
        done.push(r.data?.payable_code ? `chi phí 3PL (công nợ ${r.data.payable_code})` : "chi phí 3PL");
      }
      toast.success(done.length ? `Chuyến ${data.code}: đã lưu ${done.join(", ")}.` : "Không có gì thay đổi.");
      setOpen(false);
      onSaved?.();
      router.refresh();
    });
  }

  const readOnly = blocked || stale;
  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nhập cước chuyến {code}</DialogTitle>
            <DialogDescription>
              {data ? (
                <>
                  {data.customerName ?? "—"} · {data.routeLabel ?? "—"} · nhận {formatDate(data.pickupAt)}
                  <br />
                </>
              ) : null}
              Nhập đơn giá, % hỗ trợ dầu và các phí thu khách theo nhóm{data?.carrier ? ", chi phí trả nhà xe 3PL ở tab bên cạnh" : ""}. Ô để trống không lưu.
            </DialogDescription>
          </DialogHeader>

          {loading || !data ? (
            <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Đang tải chuyến…
            </div>
          ) : (
            <>
              {blocked ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100" role="status">
                  <Lock className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <b>{lock?.holder_name}</b> đang sửa chuyến này (từ {hm(lock?.holder_since)}). Bạn chỉ xem được, chưa lưu được cho tới khi người đó thoát ra.
                  </span>
                  <Button size="sm" variant="outline" disabled={asking} onClick={ask}>
                    <BellRing /> Báo người đang sửa thoát ra
                  </Button>
                </div>
              ) : stale ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" role="status">
                  {lock?.saved_by_name ?? "Người khác"} vừa lưu chuyến này. Đóng khung rồi bấm Nhập cước lại để lấy bản mới.
                </div>
              ) : null}
              {!data.canEditFees ? (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  {data.status === "cancelled" ? "Chuyến đã hủy." : data.billed ? "Chuyến đã lập công nợ phải thu nên không sửa được giá và phí thu khách." : "Bạn chỉ được xem giá và phí thu khách."}
                </div>
              ) : null}

              {data.carrier ? (
                <div className="flex flex-wrap gap-1 border-b" role="tablist">
                  {(
                    [
                      ["customer", <Receipt key="i" className="size-4" />, "Cước & phí thu khách", formatVND(transport + totals.revenue - totals.byRole.freight + totals.passThrough)],
                      ["carrier", <Truck key="i" className="size-4" />, "Chi phí trả 3PL", carrier ? formatVND(carrierFormTotal(carrier)) : ""],
                    ] as const
                  ).map(([k, icon, label, sum]) => (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={tab === k}
                      onClick={() => setTab(k)}
                      className={cn(
                        "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium",
                        tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {icon} {label}
                      {sum ? <span className="rounded bg-muted px-1.5 text-xs tabular-nums">{sum}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}

              <fieldset disabled={readOnly || !data.canEditFees} className={cn("space-y-3", tab !== "customer" && "hidden")}>
                <FeesEditor
                  value={fees}
                  onChange={(l) => {
                    setFees(l);
                    setDirty((d) => ({ ...d, fees: true }));
                  }}
                  idPrefix="qf-fee-"
                  files={files}
                  onFilesChange={setFiles}
                  shipmentId={data.id}
                  savedFiles={data.feeDocs}
                  freightBase={freight + surcharge + fuel}
                  freightLabel={freightLabel}
                  freightHead={
                    <>
                      <Row label="Đơn giá (đ)" htmlFor="qf-price">
                        <Input
                          id="qf-price"
                          inputMode="numeric"
                          className="h-8 text-right tabular-nums"
                          placeholder="Chưa có giá"
                          value={price.unitPrice}
                          onChange={(e) => {
                            setPrice((p) => ({ ...p, unitPrice: e.target.value }));
                            setDirty((d) => ({ ...d, price: true }));
                          }}
                          onBlur={(e) => {
                            const v = num(e.target.value);
                            if (v !== null) setPrice((p) => ({ ...p, unitPrice: formatNumber(v) }));
                          }}
                        />
                        <span className="text-xs text-muted-foreground">
                          /{unit}
                          {qty !== 1 ? ` × ${formatNumber(qty)} = ${formatVND(freight)}` : ""}
                        </span>
                      </Row>
                      <Row label="Tỷ lệ hỗ trợ dầu (%)" htmlFor="qf-fuel">
                        <Input
                          id="qf-fuel"
                          inputMode="decimal"
                          className="h-8 text-right tabular-nums"
                          placeholder="Nhập % khách cho"
                          value={price.fuelRate}
                          onChange={(e) => {
                            setPrice((p) => ({ ...p, fuelRate: e.target.value }));
                            setDirty((d) => ({ ...d, price: true }));
                          }}
                        />
                        <span className="text-xs text-muted-foreground">Tiền dầu {formatVND(fuel)} · để trống nếu khách không hỗ trợ dầu</span>
                      </Row>
                      {data.surcharge || num(price.surcharge) ? (
                        <Row label="Phụ phí cố định (bảng giá)" htmlFor="qf-surcharge">
                          <Input
                            id="qf-surcharge"
                            inputMode="numeric"
                            className="h-8 text-right tabular-nums"
                            placeholder="0"
                            value={price.surcharge}
                            onChange={(e) => {
                              setPrice((p) => ({ ...p, surcharge: e.target.value }));
                              setDirty((d) => ({ ...d, price: true }));
                            }}
                          />
                          <span className="text-xs text-muted-foreground">Khoản cộng thêm cố định ghi trong bảng giá; gõ 0 để bỏ.</span>
                        </Row>
                      ) : null}
                    </>
                  }
                />
                <dl className="grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-2 text-sm sm:grid-cols-5">
                  <Money label="Tổng phí vận chuyển" value={transport} strong />
                  <Money label="Tổng phí chi hộ" value={totals.byRole.pass_through} />
                  <Money label="Tổng phí tờ khai" value={totals.byRole.declaration} />
                  <Money label="Tổng phí bốc xếp" value={totals.byRole.loading} />
                  <Money label="Khách phải trả" value={transport - totals.byRole.freight + totals.revenue + totals.passThrough} strong />
                </dl>
              </fieldset>

              {data.carrier && carrier ? (
                <fieldset disabled={readOnly || !canCarrier} className={cn("space-y-3", tab !== "carrier" && "hidden")}>
                  <p className="text-sm text-muted-foreground">
                    Cước và chi phí khác trả 3PL trừ vào lời/lỗ chuyến. Chi hộ 3PL (nâng, hạ, cược… nhà xe trả thay) không trừ lời/lỗ vì đã thu lại khách. Lưu xong tự lập công nợ phải
                    trả nhà xe.
                  </p>
                  <CarrierCostsEditor
                    idPrefix="qf-cc-"
                    value={carrier}
                    onChange={(f) => {
                      setCarrier(f);
                      setDirty((d) => ({ ...d, carrier: true }));
                    }}
                    supplierLabel={data.carrier.supplierName}
                    paidAmount={data.carrier.paidAmount}
                    customerPassThrough={customerPass}
                  />
                </fieldset>
              ) : null}
            </>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Đóng
            </Button>
            <Button disabled={pending || loading || !data || readOnly || (!data.canEditFees && !canCarrier)} onClick={save}>
              {pending ? <Loader2 className="animate-spin" /> : null} Lưu cước
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 items-center gap-1.5 sm:grid-cols-[minmax(0,12rem)_9rem_minmax(0,1fr)]">
      <label htmlFor={htmlFor} className="col-span-full truncate text-sm font-medium sm:col-span-1">
        {label}
      </label>
      {children}
    </div>
  );
}

function Money({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-md bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold text-primary" : "font-medium"}>{formatVND(value)}</dd>
    </div>
  );
}
