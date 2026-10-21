import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requirePagePermission } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/entities/record";
import { PageHeader } from "@/components/layout/page-header";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "Tạo đơn hàng" };

export default async function Page({ searchParams }: { searchParams: Promise<{ don?: string }> }) {
  await requirePagePermission("dispatch.create");
  const { don } = await searchParams;
  let order: { id: string; code: string; customerId: string; customerName: string } | undefined;
  if (don) {
    if (!isUuid(don)) notFound();
    const supabase = await createClient();
    const { data } = await supabase
      .from("transport_orders")
      .select("id, order_code, status, customer_id, customers!transport_orders_customer_id_fkey(name)")
      .eq("id", don)
      .maybeSingle();
    if (!data) notFound();
    const c = data.customers as unknown as { name: string } | null;
    order = { id: data.id, code: data.order_code, customerId: data.customer_id, customerName: c?.name ?? "" };
  }
  return (
    <>
      <Link href={order ? `/dieu-phoi/don-hang/${order.id}` : "/dieu-phoi"} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> {order ? `Đơn hàng ${order.code}` : "Điều phối"}
      </Link>
      <PageHeader
        title={order ? `Thêm chuyến vào đơn ${order.code}` : "Tạo đơn hàng"}
        description={
          order
            ? `Khách hàng: ${order.customerName}. Giá và hỗ trợ dầu được tính lại theo bảng giá tại ngày nhận hàng.`
            : "Một đơn hàng gồm một hoặc nhiều chuyến. Mã đơn và mã chuyến tự sinh khi lưu; giá lấy theo bảng giá và được chụp lại trên từng chuyến."
        }
      />
      <OrderForm order={order} />
    </>
  );
}
