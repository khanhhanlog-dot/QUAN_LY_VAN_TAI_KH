"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DRIVER_LINK_COOKIE, DRIVER_LINK_MAX_AGE, anonClient, driverLinkToken, normalizePlate } from "@/lib/driver-link/server";

type Result = { ok: true } | { ok: false; error: string };
type RpcResult = { ok: boolean; error?: string; token?: string; expired?: boolean };

export async function openByPlate(plate: string): Promise<Result> {
  const p = normalizePlate(String(plate ?? ""));
  if (p.length < 5) return { ok: false, error: "Nhập đủ biển số xe, ví dụ 61K31295." };
  const { data, error } = await anonClient().rpc("driver_link_login", { p_plate: p });
  if (error) return { ok: false, error: "Không kết nối được máy chủ, vui lòng thử lại." };
  const r = data as RpcResult;
  if (!r.ok || !r.token) return { ok: false, error: r.error ?? "Không mở được." };
  (await cookies()).set(DRIVER_LINK_COOKIE, r.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/tx",
    maxAge: DRIVER_LINK_MAX_AGE,
  });
  revalidatePath("/tx");
  return { ok: true };
}

export async function acceptTrip(shipmentId: string): Promise<Result> {
  if (!z.uuid().safeParse(shipmentId).success) return { ok: false, error: "Chuyến không hợp lệ." };
  const token = await driverLinkToken();
  if (!token) return { ok: false, error: "Phiên đã hết hạn. Vui lòng nhập lại số xe." };
  const { data, error } = await anonClient().rpc("driver_link_accept", { p_token: token, p_shipment_id: shipmentId });
  if (error) return { ok: false, error: "Không kết nối được máy chủ, vui lòng thử lại." };
  const r = data as RpcResult;
  revalidatePath("/tx");
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Không nhận được chuyến." };
}

export async function changeVehicle(): Promise<void> {
  const token = await driverLinkToken();
  if (token) await anonClient().rpc("driver_link_logout", { p_token: token });
  (await cookies()).delete({ name: DRIVER_LINK_COOKIE, path: "/tx" });
  revalidatePath("/tx");
}
