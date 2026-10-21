"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ReferenceSelect } from "@/components/entities/reference-select";
import { EntityFormDialog } from "@/components/entities/entity-form-dialog";
import { CustomFieldsEditor } from "@/components/entities/custom-fields-editor";
import type { FieldDef } from "@/lib/entities/types";
import { formatNumber, formatVND, todayVN } from "@/lib/format";
import { PRICING_UNITS } from "@/lib/status";
import { createOrder, quoteShipment, vehicleDefaultDriver, type QuoteResult } from "../actions";

type Row = {
  key: number;
  pickupAt: string; // datetime-local, giờ Việt Nam
  expectedDeliveryAt: string;
  pickupLocationId: string;
  deliveryLocationId: string;
  vehicleTypeId: string;
  vehicleId: string;
  driverId: string;
  driverKey: number;
  quantity: string;
  priceListId: string;
  unitPrice: string;
  pricingUnit: "trip" | "km" | "ton";
  surchargeAmount: string;
  fuelSupportRate: string;
  notes: string;
  custom: Record<string, unknown>;
};

let seq = 0;
const newRow = (from?: Row): Row => ({
  key: ++seq,
  pickupAt: from?.pickupAt ?? `${todayVN()}T08:00`,
  expectedDeliveryAt: from?.expectedDeliveryAt ?? "",
  pickupLocationId: from?.pickupLocationId ?? "",
  deliveryLocationId: from?.deliveryLocationId ?? "",
  vehicleTypeId: from?.vehicleTypeId ?? "",
  vehicleId: "",
  driverId: "",
  driverKey: 0,
  quantity: from?.quantity ?? "1",
  priceListId: from?.priceListId ?? "",
  unitPrice: from?.unitPrice ?? "",
  pricingUnit: from?.pricingUnit ?? "trip",
  surchargeAmount: from?.surchargeAmount ?? "",
  fuelSupportRate: from?.fuelSupportRate ?? "",
  notes: from?.notes ?? "",
  custom: from?.custom ?? {},
});

/** "2026-10-21T08:00" (giờ VN) -> ISO có múi giờ */
const toIso = (v: string) => (v ? `${v}:00+07:00` : "");
const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));

export function OrderForm({
  order,
  canCreatePriceList,
  orderFields,
  shipmentFields,
  canAddField,
}: {
  order?: { id: string; code: string; customerId: string; customerName: string };
  canCreatePriceList: boolean;
  /** Trường bổ sung do người dùng tự thêm cho đơn hàng / chuyến */
  orderFields: FieldDef[];
  shipmentFields: FieldDef[];
  canAddField: boolean;
}) {
  const [customer, setCustomer] = useState({ id: order?.customerId ?? "", label: order?.customerName ?? "" });
  const [payer, setPayer] = useState("");
  const [orderDate, setOrderDate] = useState(todayVN());
  const [notes, setNotes] = useState("");
  const [orderCustom, setOrderCustom] = useState<Record<string, unknown>>({});
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [pending, start] = useTransition();
  const router = useRouter();

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function submit() {
    if (!order && !customer.id) return void toast.error("Vui lòng chọn khách hàng.");
    start(async () => {
      const r = await createOrder({
        orderId: order?.id,
        customerId: order ? undefined : customer.id,
        payerCustomerId: payer,
        orderDate,
        notes,
        custom: orderCustom,
        shipments: rows.map((s) => ({
          pickupAt: toIso(s.pickupAt),
          expectedDeliveryAt: toIso(s.expectedDeliveryAt),
          pickupLocationId: s.pickupLocationId,
          deliveryLocationId: s.deliveryLocationId,
          vehicleTypeId: s.vehicleTypeId,
          vehicleId: s.vehicleId,
          driverId: s.driverId,
          priceListId: s.priceListId,
          unitPrice: num(s.unitPrice),
          pricingUnit: s.pricingUnit,
          quantity: num(s.quantity),
          surchargeAmount: num(s.surchargeAmount),
          fuelSupportRate: num(s.fuelSupportRate),
          notes: s.notes,
          custom: s.custom,
        })),
      });
      if (!r.ok || !r.data) return void toast.error(r.ok ? "Không lưu được đơn hàng" : r.error);
      toast.success(`Đã lưu ${r.data.shipments.length} chuyến vào đơn ${r.data.order_code}.`);
      router.push(`/dieu-phoi/don-hang/${r.data.order_id}`);
    });
  }

  return (
    <div className="space-y-4">
      {order ? null : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Thông tin đơn hàng</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="order-customer">Khách hàng *</Label>
              <ReferenceSelect id="order-customer" refKey="customers" value={customer.id} initialLabel={customer.label} onChange={(id, label) => setCustomer({ id, label })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-payer">Khách thanh toán</Label>
              <ReferenceSelect id="order-payer" refKey="customers" value={payer} onChange={(id) => setPayer(id)} allowQuickCreate={false} />
              <p className="text-xs text-muted-foreground">Bỏ trống nếu chính khách hàng thanh toán.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="order-date">Ngày đơn hàng</Label>
              <Input id="order-date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="order-notes">Ghi chú đơn hàng</Label>
              <Textarea id="order-notes" className="min-h-14" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </div>
            <CustomFieldsEditor fields={orderFields} idPrefix="order-cf-" onChange={setOrderCustom} className="sm:col-span-2 lg:col-span-4" />
            {canAddField ? (
              <a href="/truong-du-lieu?module=transport_orders&them=1" target="_blank" rel="noopener" className="text-sm font-medium text-primary hover:underline sm:col-span-2 lg:col-span-4">
                + Thêm trường cho đơn hàng
              </a>
            ) : null}
          </CardContent>
        </Card>
      )}

      {rows.map((row, i) => (
        <ShipmentEditor
          key={row.key}
          index={i}
          row={row}
          customerId={customer.id}
          canCreatePriceList={canCreatePriceList}
          shipmentFields={shipmentFields}
          canAddField={canAddField}
          canRemove={rows.length > 1}
          onChange={(patch) => update(row.key, patch)}
          onRemove={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
          onDuplicate={() => setRows((rs) => [...rs.slice(0, i + 1), newRow(row), ...rs.slice(i + 1)])}
        />
      ))}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="outline" onClick={() => setRows((rs) => [...rs, newRow()])} disabled={rows.length >= 100}>
          <Plus /> Thêm chuyến
        </Button>
        <Button onClick={submit} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} {order ? `Lưu ${rows.length} chuyến vào đơn ${order.code}` : `Lưu đơn hàng (${rows.length} chuyến)`}
        </Button>
      </div>
    </div>
  );
}

function ShipmentEditor({
  index,
  row,
  customerId,
  canCreatePriceList,
  shipmentFields,
  canAddField,
  canRemove,
  onChange,
  onRemove,
  onDuplicate,
}: {
  index: number;
  row: Row;
  customerId: string;
  canCreatePriceList: boolean;
  shipmentFields: FieldDef[];
  canAddField: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<Row>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [loading, startQuote] = useTransition();
  const [priceDialog, setPriceDialog] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const day = row.pickupAt.slice(0, 10);
  const canQuote = Boolean(row.pickupLocationId && row.deliveryLocationId && /^\d{4}-\d{2}-\d{2}$/.test(day));

  useEffect(() => {
    if (!canQuote) return;
    const t = setTimeout(() => {
      startQuote(async () => {
        const r = await quoteShipment({
          customerId,
          pickupId: row.pickupLocationId,
          deliveryId: row.deliveryLocationId,
          vehicleTypeId: row.vehicleTypeId,
          onDate: day,
        });
        if (r.ok && r.data) {
          setQuote(r.data);
          setQuoteError("");
        } else if (!r.ok) setQuoteError(r.error);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [canQuote, customerId, row.pickupLocationId, row.deliveryLocationId, row.vehicleTypeId, day, quoteNonce]);

  const shownQuote = canQuote ? quote : null;
  const candidates = shownQuote?.candidates ?? [];
  const top = candidates[0];
  const tied = top ? candidates.filter((c) => c.specificity === top.specificity && c.priority === top.priority) : [];
  const ambiguous = tied.length > 1;
  const chosen = candidates.find((c) => c.id === row.priceListId) ?? (ambiguous ? undefined : top);
  const manual = Boolean(shownQuote) && candidates.length === 0;

  // Xem trước số tiền (máy chủ tính lại khi lưu)
  const qty = num(row.quantity) ?? 1;
  const unitPrice = chosen ? chosen.unit_price : (num(row.unitPrice) ?? 0);
  const unit = chosen ? chosen.pricing_unit : row.pricingUnit;
  const surcharge = num(row.surchargeAmount) ?? (chosen ? chosen.surcharge_amount : 0);
  const freight = Math.round(unitPrice * qty);
  const rule = shownQuote?.fuel_rule;
  const manualRate = num(row.fuelSupportRate);
  const rate = manualRate ?? chosen?.fuel_support_rate ?? rule?.rate_percent ?? null;
  const base = manualRate !== undefined || chosen?.fuel_support_rate != null ? "freight_revenue" : (rule?.calculation_base ?? null);
  const rateSource = manualRate !== undefined ? "nhập tay" : chosen?.fuel_support_rate != null ? `bảng giá ${chosen.code}` : rule ? "quy tắc hỗ trợ dầu" : null;
  const fuel =
    rate === null || base === null
      ? 0
      : base === "freight_revenue"
        ? Math.round((freight * rate) / 100)
        : base === "unit_price"
          ? Math.round((unitPrice * rate) / 100)
          : base === "total_revenue"
            ? Math.round(((freight + surcharge) * rate) / 100)
            : null;
  const id = (k: string) => `s${row.key}-${k}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Chuyến {index + 1}</CardTitle>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onDuplicate} title="Tạo chuyến mới giống chuyến này">
            <Copy /> Nhân bản
          </Button>
          {canRemove ? (
            <Button variant="ghost" size="sm" className="text-destructive" onClick={onRemove}>
              <Trash2 /> Bỏ
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor={id("pickup-at")}>Giờ nhận hàng *</Label>
            <Input id={id("pickup-at")} type="datetime-local" value={row.pickupAt} onChange={(e) => onChange({ pickupAt: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("delivery-at")}>Giờ giao dự kiến</Label>
            <Input id={id("delivery-at")} type="datetime-local" value={row.expectedDeliveryAt} onChange={(e) => onChange({ expectedDeliveryAt: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("vtype")}>Loại xe</Label>
            <ReferenceSelect id={id("vtype")} refKey="vehicle_types" value={row.vehicleTypeId} onChange={(v) => onChange({ vehicleTypeId: v, priceListId: "" })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id("qty")}>Số lượng ({PRICING_UNITS[unit] ?? unit})</Label>
            <Input id={id("qty")} type="number" min="0.001" step="any" value={row.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={id("pickup")}>Điểm nhận *</Label>
            <ReferenceSelect id={id("pickup")} refKey="locations" value={row.pickupLocationId} onChange={(v) => onChange({ pickupLocationId: v, priceListId: "" })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={id("delivery")}>Điểm giao *</Label>
            <ReferenceSelect id={id("delivery")} refKey="locations" value={row.deliveryLocationId} onChange={(v) => onChange({ deliveryLocationId: v, priceListId: "" })} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={id("vehicle")}>Xe (có thể chọn sau)</Label>
            <ReferenceSelect
              id={id("vehicle")}
              refKey="vehicles"
              value={row.vehicleId}
              onChange={(v) => {
                onChange({ vehicleId: v });
                if (v) {
                  vehicleDefaultDriver(v).then((r) => {
                    if (!r.ok || !r.data) return;
                    const patch: Partial<Row> = {};
                    if (r.data.driverId && !row.driverId) Object.assign(patch, { driverId: r.data.driverId, driverKey: row.driverKey + 1 });
                    if (r.data.vehicleTypeId && !row.vehicleTypeId) Object.assign(patch, { vehicleTypeId: r.data.vehicleTypeId, priceListId: "" });
                    if (Object.keys(patch).length) onChange(patch);
                  });
                }
              }}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={id("driver")}>Tài xế (có thể phân công sau)</Label>
            <ReferenceSelect key={row.driverKey} id={id("driver")} refKey="drivers" value={row.driverId} onChange={(v) => onChange({ driverId: v })} />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3">
          {!canQuote ? (
            <p className="text-sm text-muted-foreground">Chọn điểm nhận, điểm giao và giờ nhận hàng để hệ thống tìm bảng giá.</p>
          ) : loading && !quote ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Đang tìm bảng giá…
            </p>
          ) : quoteError ? (
            <Alert variant="destructive">
              <AlertDescription>{quoteError}</AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-3">
              {ambiguous ? (
                <div className="space-y-1.5">
                  <Label htmlFor={id("pl")}>Có {tied.length} bảng giá ngang nhau, vui lòng chọn *</Label>
                  <NativeSelect id={id("pl")} value={row.priceListId} onChange={(e) => onChange({ priceListId: e.target.value })} aria-invalid={!row.priceListId}>
                    <option value="">Chọn bảng giá…</option>
                    {tied.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}: {formatVND(c.unit_price)}/{c.pricing_unit === "other" ? c.pricing_unit_label : PRICING_UNITS[c.pricing_unit]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              ) : chosen ? (
                <p className="text-sm">
                  Bảng giá áp dụng <b>{chosen.code}</b>: {formatVND(chosen.unit_price)}/{PRICING_UNITS[chosen.pricing_unit] ?? chosen.pricing_unit_label}
                  {shownQuote?.route ? <span className="text-muted-foreground"> · tuyến {shownQuote.route.name}</span> : null}
                </p>
              ) : manual ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-3">
                    <p className="text-sm text-amber-700">Không có bảng giá phù hợp: nhập đơn giá thủ công cho chuyến này.</p>
                    {canCreatePriceList ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => setPriceDialog(true)}>
                        <Plus /> Tạo bảng giá cho tuyến này
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={id("price")}>Đơn giá (đ) *</Label>
                    <Input id={id("price")} type="number" min="0" step="1000" value={row.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} aria-invalid={!row.unitPrice} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={id("unit")}>Tính theo</Label>
                    <NativeSelect id={id("unit")} value={row.pricingUnit} onChange={(e) => onChange({ pricingUnit: e.target.value as Row["pricingUnit"] })}>
                      <option value="trip">Chuyến</option>
                      <option value="km">Km</option>
                      <option value="ton">Tấn</option>
                    </NativeSelect>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={id("surcharge")}>Phụ phí (đ)</Label>
                  <Input
                    id={id("surcharge")}
                    type="number"
                    min="0"
                    step="1000"
                    placeholder={chosen?.surcharge_amount ? String(chosen.surcharge_amount) : "0"}
                    value={row.surchargeAmount}
                    onChange={(e) => onChange({ surchargeAmount: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("fuel")}>Tỷ lệ hỗ trợ dầu (%)</Label>
                  <Input
                    id={id("fuel")}
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    placeholder={chosen?.fuel_support_rate != null ? String(chosen.fuel_support_rate) : rule?.rate_percent != null ? String(rule.rate_percent) : "Không có"}
                    value={row.fuelSupportRate}
                    onChange={(e) => onChange({ fuelSupportRate: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Bỏ trống để dùng tỷ lệ tự động{rateSource && manualRate === undefined ? ` (${rateSource})` : ""}.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={id("notes")}>Ghi chú cho tài xế</Label>
                  <Input id={id("notes")} value={row.notes} onChange={(e) => onChange({ notes: e.target.value })} maxLength={1000} />
                </div>
              </div>
              {chosen || manual ? (
                <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  <Money label={`Cước (${formatNumber(qty)} × ${formatVND(unitPrice)})`} value={freight} />
                  <Money label="Phụ phí" value={surcharge} />
                  <Money label={rate !== null ? `Hỗ trợ dầu ${formatNumber(rate)}%` : "Hỗ trợ dầu"} value={fuel} note={fuel === null ? "Tính theo định mức khi lưu" : undefined} />
                  <Money label="Tổng doanh thu dự kiến" value={fuel === null ? null : freight + surcharge + fuel} strong />
                </dl>
              ) : null}
            </div>
          )}
        </div>
        {shipmentFields.length || canAddField ? (
          <div className="mt-4 space-y-2 border-t pt-4">
            <CustomFieldsEditor fields={shipmentFields} idPrefix={`s${row.key}-cf-`} initial={row.custom} onChange={(custom) => onChange({ custom })} />
            {canAddField ? (
              <a href="/truong-du-lieu?module=shipments&them=1" target="_blank" rel="noopener" className="inline-block text-sm font-medium text-primary hover:underline">
                + Thêm trường cho chuyến
              </a>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      {canCreatePriceList ? (
        <EntityFormDialog
          entityKey="price_lists"
          customRows={[]}
          open={priceDialog}
          onOpenChange={setPriceDialog}
          initialValues={{
            customer_id: customerId || null,
            pickup_location_id: row.pickupLocationId || null,
            delivery_location_id: row.deliveryLocationId || null,
            vehicle_type_id: row.vehicleTypeId || null,
            unit_price: num(row.unitPrice) ?? null,
            pricing_unit: row.pricingUnit,
            effective_from: day,
          }}
          onSaved={() => {
            onChange({ priceListId: "", unitPrice: "" });
            setQuoteNonce((n) => n + 1);
          }}
        />
      ) : null}
    </Card>
  );
}

function Money({ label, value, note, strong }: { label: string; value: number | null; note?: string; strong?: boolean }) {
  return (
    <div className="rounded-md bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-semibold text-primary" : "font-medium"}>{value === null ? note : formatVND(value)}</dd>
    </div>
  );
}
