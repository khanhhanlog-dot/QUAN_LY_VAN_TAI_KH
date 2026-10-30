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
import { VehicleDayConflict, type VehicleDayState } from "@/components/dispatch/vehicle-day-conflict";
import { CustomFieldsEditor } from "@/components/entities/custom-fields-editor";
import { AddFieldButton } from "@/components/entities/add-field-button";
import type { CustomFieldRow, FieldDef } from "@/lib/entities/types";
import { formatNumber, formatVND, todayVN } from "@/lib/format";
import { PRICING_UNITS } from "@/lib/status";
import { createOrder, customerDefaultPayer, quoteShipment, vehicleDefaultDriver, type QuoteResult } from "../actions";

type Row = {
  key: number;
  pickupAt: string; // ngày nhận hàng YYYY-MM-DD (giờ không biết trước nên không nhập)
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
  /** Trường bổ sung kiểu tiền, %, số, công thức: nhập trong khung Giá */
  customPrice: Record<string, unknown>;
  /** Kiểm tra xe đã có chuyến cùng ngày: xác nhận vẫn giao và thứ tự chuyến của xe trong ngày */
  vehicleDay?: VehicleDayState;
};

/** Trường bổ sung kiểu tiền, %, số và công thức nằm trong khung Giá của chuyến */
const PRICE_FIELD_TYPES: FieldDef["type"][] = ["currency", "percent", "number", "formula"];

let seq = 0;
const newRow = (from?: Row): Row => ({
  key: ++seq,
  pickupAt: from?.pickupAt ?? todayVN(),
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
  customPrice: from?.customPrice ?? {},
});

/** "2026-10-21T08:00" (giờ VN) -> ISO có múi giờ */
// Chỉ nhập ngày: nhận hàng tính từ đầu ngày, giao dự kiến tính tới cuối ngày (giao trong ngày đó là đúng hạn)
const startIso = (v: string) => (v ? `${v.slice(0, 10)}T00:00:00+07:00` : "");
const endIso = (v: string) => (v ? `${v.slice(0, 10)}T23:59:59+07:00` : "");
const num = (v: string) => (v.trim() === "" ? undefined : Number(v.replace(",", ".")));

export function OrderForm({
  order,
  canCreatePriceList,
  orderFields,
  shipmentFields,
  orderLayout,
  shipmentLayout,
  canAddField,
  orderFieldRows,
  shipmentFieldRows,
}: {
  order?: { id: string; code: string; customerId: string; customerName: string };
  canCreatePriceList: boolean;
  /** Trường bổ sung do người dùng tự thêm cho đơn hàng / chuyến */
  orderFields: FieldDef[];
  shipmentFields: FieldDef[];
  /** Thứ tự trường trên biểu mẫu (Quản lý trường dữ liệu → Thứ tự trên biểu mẫu) */
  orderLayout: string[];
  shipmentLayout: string[];
  canAddField: boolean;
  orderFieldRows: CustomFieldRow[];
  shipmentFieldRows: CustomFieldRow[];
}) {
  const [customer, setCustomer] = useState({ id: order?.customerId ?? "", label: order?.customerName ?? "" });
  const [payer, setPayer] = useState({ id: "", label: "", auto: false });
  // Chọn khách hàng: tự điền khách thanh toán mặc định (thiết lập trong hồ sơ khách hàng); chọn tay thì không ghi đè
  const pickCustomer = (id: string, label: string) => {
    setCustomer({ id, label });
    if (payer.id && !payer.auto) return;
    if (!id) return setPayer({ id: "", label: "", auto: false });
    customerDefaultPayer(id).then((r) => {
      if (r.ok) setPayer(r.data ? { ...r.data, auto: true } : { id: "", label: "", auto: false });
    });
  };
  const [orderDate, setOrderDate] = useState(todayVN());
  const [notes, setNotes] = useState("");
  const [orderCustom, setOrderCustom] = useState<Record<string, unknown>>({});
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [pending, start] = useTransition();
  const router = useRouter();

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function submit() {
    if (!order && !customer.id) return void toast.error("Vui lòng chọn khách hàng.");
    const busy = rows.findIndex((r) => r.vehicleDay?.blocked);
    if (busy >= 0) return void toast.error(`Chuyến ${busy + 1}: xe đã có chuyến cùng ngày, tích "Vẫn giao cho xe này" và nhập thứ tự chuyến của xe.`);
    start(async () => {
      const r = await createOrder({
        orderId: order?.id,
        customerId: order ? undefined : customer.id,
        payerCustomerId: payer.id,
        orderDate,
        notes,
        custom: orderCustom,
        shipments: rows.map((s) => ({
          pickupAt: startIso(s.pickupAt),
          expectedDeliveryAt: endIso(s.expectedDeliveryAt),
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
          custom: { ...s.custom, ...s.customPrice },
          vehicleDayOrder: s.vehicleId ? (s.vehicleDay?.order ?? null) : null,
        })),
        otherOrders: rows.flatMap((s) => (s.vehicleId ? (s.vehicleDay?.others ?? []) : [])),
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
          <CardContent className="space-y-3">
            <CustomFieldsEditor
              fields={orderFields}
              idPrefix="order-cf-"
              onChange={setOrderCustom}
              order={orderLayout}
              slots={{
                customer_id: (
                  <div className="space-y-1.5 lg:col-span-2">
                    <Label htmlFor="order-customer">Khách hàng *</Label>
                    <ReferenceSelect id="order-customer" refKey="customers" value={customer.id} initialLabel={customer.label} onChange={pickCustomer} />
                  </div>
                ),
                payer_customer_id: (
                  <div className="space-y-1.5">
                    <Label htmlFor="order-payer">Khách thanh toán</Label>
                    <ReferenceSelect
                      key={payer.auto ? `auto-${payer.id}` : "manual"}
                      id="order-payer"
                      refKey="customers"
                      value={payer.id}
                      initialLabel={payer.label}
                      onChange={(id, label) => setPayer({ id, label, auto: false })}
                      allowQuickCreate={false}
                    />
                    <p className="text-xs text-muted-foreground">
                      {payer.auto ? "Tự điền theo hồ sơ khách hàng, đổi được." : "Bỏ trống nếu chính khách hàng thanh toán. Đặt sẵn trong hồ sơ khách hàng để tự điền."}
                    </p>
                  </div>
                ),
                order_date: (
                  <div className="space-y-1.5">
                    <Label htmlFor="order-date">Ngày đơn hàng</Label>
                    <Input id="order-date" type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
                  </div>
                ),
                notes: (
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
                    <Label htmlFor="order-notes">Ghi chú đơn hàng</Label>
                    <Textarea id="order-notes" className="min-h-14" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
                  </div>
                ),
              }}
            />
            {canAddField ? <AddFieldButton module="transport_orders" customRows={orderFieldRows} label="Thêm trường cho đơn hàng" /> : null}
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
          shipmentLayout={shipmentLayout}
          canAddField={canAddField}
          shipmentFieldRows={shipmentFieldRows}
          canRemove={rows.length > 1}
          sameVehicle={rows
            .map((o, j) =>
              j !== i && o.vehicleId && o.vehicleId === row.vehicleId && o.pickupAt.slice(0, 10) === row.pickupAt.slice(0, 10)
                ? { label: `Chuyến ${j + 1}`, order: o.vehicleDay?.order ?? null, before: j < i }
                : null,
            )
            .filter((x) => x !== null)}
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
  shipmentLayout,
  canAddField,
  shipmentFieldRows,
  canRemove,
  sameVehicle,
  onChange,
  onRemove,
  onDuplicate,
}: {
  index: number;
  row: Row;
  customerId: string;
  canCreatePriceList: boolean;
  shipmentFields: FieldDef[];
  shipmentLayout: string[];
  canAddField: boolean;
  shipmentFieldRows: CustomFieldRow[];
  canRemove: boolean;
  /** Chuyến khác trên biểu mẫu chọn cùng xe, cùng ngày */
  sameVehicle: { label: string; order: number | null; before: boolean }[];
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
  const generalFields = shipmentFields.filter((f) => !PRICE_FIELD_TYPES.includes(f.type));
  const priceFields = shipmentFields.filter((f) => PRICE_FIELD_TYPES.includes(f.type));
  const priceContext = {
    unit_price: unitPrice,
    quantity: qty,
    freight_amount: freight,
    surcharge_amount: surcharge,
    fuel_support_rate: rate,
    fuel_support_amount: fuel,
    total_revenue: fuel === null ? null : freight + surcharge + fuel,
  };

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
        <CustomFieldsEditor
          fields={generalFields}
          idPrefix={`s${row.key}-cf-`}
          initial={row.custom}
          onChange={(custom) => onChange({ custom })}
          order={shipmentLayout}
          context={{
            ...row.customPrice,
            unit_price: unitPrice,
            quantity: qty,
            freight_amount: freight,
            surcharge_amount: surcharge,
            fuel_support_rate: rate,
            fuel_support_amount: fuel,
            total_revenue: fuel === null ? null : freight + surcharge + fuel,
          }}
          slots={{
              pickup_at: (
                <div className="space-y-1.5">
                  <Label htmlFor={id("pickup-at")}>Ngày nhận hàng *</Label>
                  <Input id={id("pickup-at")} type="date" value={row.pickupAt.slice(0, 10)} onChange={(e) => onChange({ pickupAt: e.target.value })} />
                </div>
              ),
              expected_delivery_at: (
                <div className="space-y-1.5">
                  <Label htmlFor={id("delivery-at")}>Ngày giao dự kiến</Label>
                  <Input id={id("delivery-at")} type="date" min={row.pickupAt.slice(0, 10)} value={row.expectedDeliveryAt.slice(0, 10)} onChange={(e) => onChange({ expectedDeliveryAt: e.target.value })} />
                </div>
              ),
              vehicle_type_id: (
                <div className="space-y-1.5">
                  <Label htmlFor={id("vtype")}>Loại xe</Label>
                  <ReferenceSelect id={id("vtype")} refKey="vehicle_types" value={row.vehicleTypeId} onChange={(v) => onChange({ vehicleTypeId: v, priceListId: "" })} />
                </div>
              ),
              quantity: (
                <div className="space-y-1.5">
                  <Label htmlFor={id("qty")}>Số lượng ({PRICING_UNITS[unit] ?? unit})</Label>
                  <Input id={id("qty")} type="number" min="0.001" step="any" value={row.quantity} onChange={(e) => onChange({ quantity: e.target.value })} />
                </div>
              ),
              pickup_location_id: (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={id("pickup")}>Điểm nhận *</Label>
                  <ReferenceSelect id={id("pickup")} refKey="locations" value={row.pickupLocationId} onChange={(v) => onChange({ pickupLocationId: v, priceListId: "" })} />
                </div>
              ),
              delivery_location_id: (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={id("delivery")}>Điểm giao *</Label>
                  <ReferenceSelect id={id("delivery")} refKey="locations" value={row.deliveryLocationId} onChange={(v) => onChange({ deliveryLocationId: v, priceListId: "" })} />
                </div>
              ),
              vehicle_id: (
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
                  <VehicleDayConflict vehicleId={row.vehicleId} day={day} sameForm={sameVehicle} onStateChange={(st) => onChange({ vehicleDay: st })} />
                </div>
              ),
              driver_id: (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={id("driver")}>Tài xế (có thể phân công sau)</Label>
                  <ReferenceSelect key={row.driverKey} id={id("driver")} refKey="drivers" value={row.driverId} onChange={(v) => onChange({ driverId: v })} />
                </div>
              ),
              notes: (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={id("notes")}>Ghi chú cho tài xế</Label>
                  <Input id={id("notes")} value={row.notes} onChange={(e) => onChange({ notes: e.target.value })} maxLength={1000} />
                </div>
              ),
          }}
        />
        {canAddField ? <AddFieldButton module="shipments" customRows={shipmentFieldRows} label="Thêm trường cho chuyến" /> : null}

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
                    <p className="text-sm text-amber-700">Không có bảng giá phù hợp: nhập đơn giá thủ công, hoặc để trống và nhập sau ở Quản lý chuyến xe.</p>
                    {canCreatePriceList ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => setPriceDialog(true)}>
                        <Plus /> Tạo bảng giá cho tuyến này
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={id("price")}>Đơn giá (đ)</Label>
                    <Input id={id("price")} type="number" min="0" step="1000" placeholder="Để trống nếu tính giá sau" value={row.unitPrice} onChange={(e) => onChange({ unitPrice: e.target.value })} />
                    {!row.unitPrice ? <p className="text-xs text-muted-foreground">Chuyến sẽ ghi “Chưa có giá”; nhập sau ở bảng Quản lý chuyến xe hoặc chi tiết chuyến.</p> : null}
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
              <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="mt-3 space-y-2 border-t pt-3">
            {priceFields.length ? (
              <CustomFieldsEditor
                fields={priceFields}
                idPrefix={`s${row.key}-pf-`}
                initial={row.customPrice}
                onChange={(customPrice) => onChange({ customPrice })}
                order={shipmentLayout}
                context={{ ...row.custom, ...priceContext }}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Cần thêm phụ thu (vé, hạ trái tuyến…) hoặc công thức giá riêng? Bấm nút dưới. Ví dụ công thức: ROUND(unit_price * (1 + fuel_support_rate / 100), 0) + N(phu_thu_ve).
              </p>
            )}
            {canAddField ? <AddFieldButton module="shipments" customRows={shipmentFieldRows} label="Thêm phụ thu / công thức giá" /> : null}
          </div>
        </div>
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
