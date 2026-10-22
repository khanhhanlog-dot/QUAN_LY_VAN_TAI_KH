import type { Metadata } from "next";
import { anonClient, driverLinkToken } from "@/lib/driver-link/server";
import { formatDateTime, formatVND } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { PlateForm } from "../plate-form";
import { AdvanceButton, CancelRequestButton } from "./money-forms";
import { EditExpenseButton } from "../expense-forms";

export const metadata: Metadata = { title: "Ứng tiền và chi phí" };
export const dynamic = "force-dynamic";

type Finance = {
  ok: boolean;
  driver_id: string | null;
  driver_name: string | null;
  categories: { id: string; name: string; group: string; requires_image: boolean; requires_approval: boolean }[];
  advances: { id: string; code: string; amount: number; approved: number | null; reason: string; status: string; created_at: string; shipment_code: string | null; reject_reason: string | null }[];
  expenses: {
    id: string;
    code: string;
    amount: number;
    category: string;
    category_id: string;
    shipment_id: string;
    note: string | null;
    status: string;
    incurred_at: string;
    shipment_code: string;
    reject_reason: string | null;
    files: number;
    editable: boolean;
  }[];
  month: { advance_paid: number; expense_approved: number; expense_pending: number };
};

type Payrolls = {
  ok: boolean;
  advance_balance: number;
  payrolls: { code: string; period: string; trip_count: number; salary: number; expense_reimbursement: number; advance_offset: number; net_amount: number; status: string; paid_at: string | null }[];
};

const STATUS: Record<string, { label: string; variant: "warning" | "success" | "secondary" | "info" | "destructive" }> = {
  pending: { label: "Chờ Giám đốc duyệt", variant: "warning" },
  approved: { label: "Đã duyệt", variant: "info" },
  paid: { label: "Đã chuyển tiền", variant: "success" },
  rejected: { label: "Bị từ chối", variant: "destructive" },
  cancelled: { label: "Đã hủy", variant: "secondary" },
};
const PAYROLL_STATUS: typeof STATUS = {
  pending: { label: "Chờ Giám đốc duyệt", variant: "warning" },
  approved: { label: "Đã duyệt, chờ trả lương", variant: "info" },
  paid: { label: "Đã trả lương", variant: "success" },
  rejected: { label: "Đang lập lại", variant: "secondary" },
};
const ADV_STATUS: typeof STATUS = { ...STATUS, approved: { label: "Đã duyệt, chờ kế toán chuyển tiền", variant: "info" as const } };

export default async function DriverMoney() {
  const token = await driverLinkToken();
  const supabase = anonClient();
  const me = token ? ((await supabase.rpc("driver_link_me", { p_token: token })).data as { plate: string } | null) : null;
  if (!me) return <PlateForm />;
  const [finRes, tripRes, payRes] = await Promise.all([
    supabase.rpc("driver_link_finance", { p_token: token }),
    supabase.rpc("driver_link_trips", { p_token: token }),
    supabase.rpc("driver_link_payrolls", { p_token: token }),
  ]);
  if (finRes.error) throw finRes.error;
  const f = finRes.data as Finance;
  const pay = (payRes.data ?? { ok: false, advance_balance: 0, payrolls: [] }) as Payrolls;
  const trips = ((tripRes.data ?? []) as { shipment_id: string; shipment_code: string; status: string; pickup_name: string; delivery_name: string }[])
    .filter((t) => ["accepted", "in_transit", "driver_completed", "closed"].includes(t.status))
    .map((t) => ({ id: t.shipment_id, label: `${t.shipment_code} · ${t.pickup_name} → ${t.delivery_name}` }));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-card p-4 shadow-xs">
        <div className="text-sm text-muted-foreground">
          Xe <span className="font-mono font-semibold text-foreground">{me.plate}</span>
          {f.driver_name ? <> · Tài xế {f.driver_name}</> : null}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Đã ứng tháng này" value={f.month.advance_paid} />
          <Stat label="Chi phí đã duyệt" value={f.month.expense_approved} />
          <Stat label="Chi phí chờ duyệt" value={f.month.expense_pending} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Tiền ứng đang giữ: <b className="tabular-nums text-foreground">{formatVND(pay.advance_balance ?? 0)}</b>. Cuối tháng kế toán đối soát: lương cộng chi phí tự trả
          đã duyệt, trừ tiền đã ứng.
        </p>
      </div>

      {!f.driver_id ? (
        <p className="rounded-2xl border bg-card p-4 text-sm">Xe chưa được gán tài xế mặc định nên chưa xin ứng được. Vui lòng gọi điều phối.</p>
      ) : (
        <>
          <AdvanceButton trips={trips} />
          <p className="text-xs text-muted-foreground">Chi phí chuyến được nhập khi bấm &quot;Hoàn thành chuyến&quot;; nhập sót thì bấm &quot;Bổ sung chi phí&quot; trên thẻ chuyến.</p>
        </>
      )}

      {pay.payrolls?.length ? (
        <Section title="Bảng lương" empty="">
          {pay.payrolls.map((p) => {
            const st = PAYROLL_STATUS[p.status] ?? { label: p.status, variant: "secondary" as const };
            return (
              <li key={p.code} data-payroll={p.code} className="rounded-2xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm text-muted-foreground">Lương tháng {p.period}</div>
                    <div className="text-lg font-semibold tabular-nums">{formatVND(p.net_amount)}</div>
                  </div>
                  <Badge variant={st.variant}>{st.label}</Badge>
                </div>
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-sm">
                  <span>Lương ({p.trip_count} chuyến)</span>
                  <span className="text-right tabular-nums">{formatVND(p.salary)}</span>
                  <span>Hoàn chi phí tự trả</span>
                  <span className="text-right tabular-nums">{formatVND(p.expense_reimbursement)}</span>
                  <span>Trừ tiền đã ứng</span>
                  <span className="text-right tabular-nums">−{formatVND(p.advance_offset)}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {p.code}
                  {p.paid_at ? ` · Trả ngày ${formatDateTime(p.paid_at)}` : ""}
                </div>
              </li>
            );
          })}
        </Section>
      ) : null}

      <Section title="Yêu cầu ứng tiền" empty="Chưa có yêu cầu ứng tiền trong 2 tháng gần đây.">
        {f.advances.map((a) => {
          const st = ADV_STATUS[a.status] ?? { label: a.status, variant: "secondary" as const };
          return (
            <li key={a.id} data-advance={a.code} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold tabular-nums">{formatVND(a.approved ?? a.amount)}</div>
                  {a.approved !== null && Number(a.approved) !== Number(a.amount) ? (
                    <div className="text-xs text-muted-foreground">Xin {formatVND(a.amount)}, được duyệt {formatVND(a.approved)}</div>
                  ) : null}
                </div>
                <Badge variant={st.variant}>{st.label}</Badge>
              </div>
              <div className="mt-1 text-sm">{a.reason}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {a.code} · {formatDateTime(a.created_at)}
                {a.shipment_code ? ` · Chuyến ${a.shipment_code}` : ""}
              </div>
              {a.reject_reason ? <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm">Lý do từ chối: {a.reject_reason}</p> : null}
              {a.status === "pending" ? <CancelRequestButton kind="advance" id={a.id} /> : null}
            </li>
          );
        })}
      </Section>

      <Section title="Chi phí đã nhập" empty="Chưa nhập chi phí nào trong 2 tháng gần đây.">
        {f.expenses.map((e) => {
          const st = STATUS[e.status] ?? { label: e.status, variant: "secondary" as const };
          return (
            <li key={e.id} data-expense={e.code} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{e.category}</div>
                  <div className="text-lg font-semibold tabular-nums">{formatVND(e.amount)}</div>
                </div>
                <Badge variant={st.variant}>{st.label}</Badge>
              </div>
              {e.note ? <div className="mt-1 text-sm">{e.note}</div> : null}
              <div className="mt-1 text-xs text-muted-foreground">
                {e.code} · Chuyến {e.shipment_code} · {formatDateTime(e.incurred_at)} · {e.files} ảnh
              </div>
              {e.reject_reason ? <p className="mt-2 rounded-lg bg-destructive/10 p-2 text-sm">Lý do từ chối: {e.reject_reason}</p> : null}
              {e.editable ? (
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <EditExpenseButton expense={e} categories={f.categories} />
                  <CancelRequestButton kind="expense" id={e.id} />
                </div>
              ) : null}
            </li>
          );
        })}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-muted px-1 py-2">
      <div className="text-sm font-semibold tabular-nums">{formatVND(value)}</div>
      <div className="text-[11px] leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h2 className="mb-2 font-semibold">{title}</h2>
      {children.length ? <ul className="space-y-2">{children}</ul> : <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}
