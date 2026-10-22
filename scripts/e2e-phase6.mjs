// Kiểm thử giao diện Giai đoạn 5-6: tài xế bắt đầu/hoàn thành chuyến kèm ảnh, xin ứng tiền, nhập chi phí;
// Giám đốc duyệt; Kế toán chuyển tiền; điều phối xem ảnh giao hàng. Cần Supabase cục bộ có Storage.
import zlib from "node:zlib";
import { BASE, asUser, check, desktop, finish, phone, shot, visible } from "./e2e-lib.mjs";

const toast = (page, text) => visible(page.locator("[data-sonner-toast]").filter({ hasText: text }), 15000);
const dialog = (page) => page.getByRole("dialog").last();

/** Ảnh PNG thật (64x48, nhiều màu) để giả lập ảnh chụp từ điện thoại */
function png(w = 64, h = 48) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = x * 4;
      raw[o + 1] = y * 5;
      raw[o + 2] = 128;
    }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const photo = (name) => ({ name, mimeType: "image/png", buffer: png() });

// ---------------------------------------------------------------------------
// A. Điện thoại tài xế: nhận, bắt đầu chạy, hoàn thành kèm ảnh
// ---------------------------------------------------------------------------
await asUser(null, phone, async (page) => {
  await page.goto(`${BASE}/tx`);
  await page.getByLabel("Số xe").fill("51c00001");
  await page.getByRole("button", { name: "Xem chuyến" }).click();
  const card = page.locator("[data-trip]").first();
  await card.getByRole("button", { name: /Nhận đơn/ }).click();
  check(await visible(card.getByRole("button", { name: /Bắt đầu chạy/ })), "Nhận đơn xong hiện nút Bắt đầu chạy");
  await card.getByRole("button", { name: /Bắt đầu chạy/ }).click();
  check(await visible(card.getByRole("button", { name: /Hoàn thành chuyến/ })), "Bắt đầu chạy xong hiện nút Hoàn thành chuyến");
  check(await visible(card.getByText("Đang chạy")), "Thẻ chuyến chuyển Đang chạy");
  await card.getByRole("button", { name: /Hoàn thành chuyến/ }).click();
  await dialog(page).getByRole("button", { name: "Gửi và hoàn thành" }).click();
  check(await visible(dialog(page).getByText("Chụp ít nhất 1 ảnh")), "Chưa chụp ảnh thì không hoàn thành được");
  await dialog(page).getByLabel("Chọn ảnh có sẵn").setInputFiles([photo("hang.png")]);
  await dialog(page).getByRole("radio", { name: "Phiếu ký nhận" }).click();
  await dialog(page).getByLabel("Chọn ảnh có sẵn").setInputFiles([photo("phieu.png")]);
  check((await dialog(page).locator("li img").count()) === 2, "Xem trước 2 ảnh đã chọn");
  await shot(page, "p6-01-hoan-thanh");
  await dialog(page).getByRole("button", { name: "Gửi và hoàn thành" }).click();
  check(await visible(card.getByText(/Hoàn thành lúc .* 2 ảnh/), 20000), "Hoàn thành chuyến, thẻ ghi 2 ảnh đã gửi");
  await shot(page, "p6-02-da-xong");

  // Ứng tiền và chi phí
  await page.getByRole("link", { name: "Ứng tiền & chi phí" }).click();
  await page.getByRole("button", { name: "Xin ứng tiền" }).click();
  await dialog(page).getByLabel("Số tiền cần ứng").fill("2000000");
  check((await dialog(page).getByLabel("Số tiền cần ứng").inputValue()) === "2.000.000", "Ô tiền tự thêm dấu chấm hàng nghìn");
  await dialog(page).getByLabel("Lý do").fill("Ứng tiền dầu chuyến Bình Dương");
  await dialog(page).getByRole("button", { name: "Gửi yêu cầu" }).click();
  check(await visible(dialog(page).getByText("Đã gửi yêu cầu ứng tiền")), "Gửi yêu cầu ứng tiền từ điện thoại");
  await dialog(page).getByRole("button", { name: "Xong", exact: true }).click();
  check(await visible(page.locator("[data-advance]").getByText("Chờ Giám đốc duyệt")), "Yêu cầu ứng hiện trạng thái chờ Giám đốc duyệt");

  await page.getByRole("button", { name: "Nhập chi phí" }).click();
  await dialog(page).getByLabel("Chuyến").selectOption({ index: 1 });
  await dialog(page).getByLabel("Loại chi phí").selectOption({ label: "Cầu đường" });
  check(await visible(dialog(page).getByText("Bắt buộc chụp hóa đơn")), "Loại chi phí báo cần ảnh hóa đơn");
  await dialog(page).getByLabel("Số tiền").fill("120000");
  await dialog(page).getByRole("button", { name: "Gửi chi phí" }).click();
  check(await visible(dialog(page).getByText(/cần chụp hóa đơn/)), "Chưa có ảnh thì không gửi được chi phí bắt buộc ảnh");
  await dialog(page).getByLabel("Chọn ảnh có sẵn").setInputFiles([photo("bienlai.png")]);
  await dialog(page).getByRole("button", { name: "Gửi chi phí" }).click();
  check(await visible(dialog(page).getByText("đang chờ Giám đốc duyệt"), 20000), "Gửi chi phí kèm biên lai");
  await dialog(page).getByRole("button", { name: "Xong", exact: true }).click();
  check(await visible(page.locator("[data-expense]").getByText("1 ảnh")), "Chi phí hiện 1 ảnh đã gửi");
  await shot(page, "p6-03-tien");
});

// ---------------------------------------------------------------------------
// B. Giám đốc duyệt
// ---------------------------------------------------------------------------
await asUser("giamdoc@khanhha.test", desktop, async (page) => {
  await page.goto(`${BASE}/phe-duyet`);
  await page.getByLabel("Lọc theo Tôi duyệt được").selectOption("true");
  await page.waitForURL(/f_can_approve=true/);
  const adv = page.locator("tbody tr").filter({ hasText: "Ứng tiền" }).first();
  check(await visible(adv.getByText("Nguyễn Văn Mẫu (tài xế)")), "Giám đốc thấy yêu cầu ứng tiền của tài xế");
  await adv.getByRole("button", { name: /^Duyệt/ }).click();
  await dialog(page).getByLabel("Số tiền duyệt").fill("1500000");
  await dialog(page).getByRole("button", { name: "Xác nhận duyệt" }).click();
  check(await toast(page, "Đã duyệt"), "Duyệt ứng tiền 1.500.000");

  await page.locator("tbody tr").filter({ hasText: "Ứng tiền" }).waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
  const exp = page.locator("tbody tr").filter({ hasText: "Cầu đường" }).first();
  await exp.getByRole("button", { name: /Ảnh \(1\)/ }).click();
  check(await visible(dialog(page).locator("img")), "Giám đốc xem được ảnh biên lai trước khi duyệt");
  const loaded = await page
    .locator("[role=dialog] img")
    .first()
    .evaluate((img) => img.decode().then(() => img.naturalWidth > 0))
    .catch((e) => (console.log("  ", e.message.split("\n")[0]), false));
  check(loaded, "Ảnh biên lai tải được qua đường dẫn tạm");
  await page.keyboard.press("Escape");
  await exp.getByRole("button", { name: /^Duyệt/ }).click();
  await dialog(page).getByRole("button", { name: "Xác nhận duyệt" }).click();
  check(await toast(page, "Đã duyệt"), "Duyệt chi phí cầu đường");
  await shot(page, "p6-04-phe-duyet");

  await page.goto(`${BASE}/phe-duyet?tab=approval_rules`);
  check(await visible(page.locator("tbody tr").filter({ hasText: "Ứng tiền" }).filter({ hasText: "Giám đốc" })), "Cấu hình cấp duyệt: Ứng tiền do Giám đốc duyệt");
});

// ---------------------------------------------------------------------------
// C. Kế toán chuyển tiền
// ---------------------------------------------------------------------------
await asUser("ketoan@khanhha.test", desktop, async (page) => {
  await page.goto(`${BASE}/chi-phi?tab=advances`);
  const row = page.locator("tbody tr").filter({ hasText: "Nguyễn Văn Mẫu" }).first();
  check(await visible(row.getByText("Đã duyệt")), "Kế toán thấy khoản ứng đã duyệt");
  await row.getByRole("button", { name: /Chuyển tiền/ }).click();
  check(await visible(dialog(page).getByText("1.500.000")), "Hộp chuyển tiền hiện đúng số tiền được duyệt");
  await dialog(page).getByLabel("Số giao dịch ngân hàng").fill("FT26295000001");
  await dialog(page).getByRole("button", { name: "Xác nhận đã chuyển" }).click();
  check(await toast(page, "Đã ghi nhận chuyển tiền"), "Ghi nhận chuyển tiền ứng");
  check(await visible(row.getByText("Đã chuyển tiền")), "Khoản ứng chuyển trạng thái Đã chuyển tiền");
  await shot(page, "p6-05-chuyen-tien");

  await page.goto(`${BASE}/chi-phi?tab=expenses`);
  check(await visible(page.locator("tbody tr").filter({ hasText: "Cầu đường" }).getByText("Đã duyệt")), "Danh sách chi phí hiện khoản đã duyệt");
  await page.getByRole("button", { name: "Tạo chi phí" }).click();
  check(await visible(dialog(page).getByRole("button", { name: "Thêm trường cho biểu mẫu này" })).then((v) => !v), "Kế toán không có quyền thêm trường thì không thấy nút");
  await page.keyboard.press("Escape");
});

// ---------------------------------------------------------------------------
// D. Điều phối xem ảnh giao hàng, chi phí trên chi tiết chuyến
// ---------------------------------------------------------------------------
await asUser("dieuphoi@khanhha.test", desktop, async (page) => {
  await page.goto(`${BASE}/chuyen-xe`);
  await page.locator("tbody tr").filter({ hasText: "Nguyễn Văn Mẫu" }).first().getByRole("link").first().click();
  await page.waitForURL(/\/chuyen-xe\/[0-9a-f-]{36}$/);
  check(await visible(page.getByText("Giao đủ")), "Chi tiết chuyến hiện kết quả giao hàng");
  check(await visible(page.getByText("Chi phí đã duyệt")), "Doanh thu chuyến có chi phí đã duyệt và lợi nhuận gộp");
  await page.getByRole("button", { name: /Ảnh \(2\)/ }).click();
  check(await visible(dialog(page).locator("img").nth(1)), "Điều phối xem được 2 ảnh giao hàng");
  check(await visible(dialog(page).getByText("Phiếu ký nhận")), "Ảnh phân loại phiếu ký nhận");
  await shot(page, "p6-06-chi-tiet-chuyen");
});

// ---------------------------------------------------------------------------
// E. Điện thoại thấy kết quả
// ---------------------------------------------------------------------------
await asUser(null, phone, async (page) => {
  await page.goto(`${BASE}/tx`);
  await page.getByLabel("Số xe").fill("51C00001");
  await page.getByRole("button", { name: "Xem chuyến" }).click();
  await page.getByRole("link", { name: "Ứng tiền & chi phí" }).click();
  check(await visible(page.locator("[data-advance]").getByText("Đã chuyển tiền")), "Tài xế thấy khoản ứng đã chuyển tiền");
  check(await visible(page.getByText(/Xin 2\.000\.000.*được duyệt 1\.500\.000/)), "Tài xế thấy số tiền được duyệt");
  check(await visible(page.locator("[data-expense]").getByText("Đã duyệt")), "Tài xế thấy chi phí đã duyệt");
});

await finish();
