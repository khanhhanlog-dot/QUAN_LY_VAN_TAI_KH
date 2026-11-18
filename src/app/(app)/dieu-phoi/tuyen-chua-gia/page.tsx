import { redirect } from "next/navigation";

/** Trang cũ "Tuyến chưa có giá": lương chuyến nay nhập theo từng chuyến */
export default function Page() {
  redirect("/dieu-phoi/luong-chuyen");
}
