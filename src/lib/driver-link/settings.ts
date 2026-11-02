/** Cấu hình → Ứng dụng tài xế (RPC driver_app_settings, migration 0052) */
export type DriverAppSettings = {
  /** Cho chụp ảnh (giao hàng, hóa đơn). Tắt: ẩn mọi ô chụp ảnh, không bắt buộc ảnh */
  photos_enabled: boolean;
  /** Bắt buộc ít nhất 1 ảnh giao hàng khi hoàn thành chuyến */
  delivery_photo_required: boolean;
  /** Cho tài xế nhập chi phí chuyến */
  expense_enabled: boolean;
};

export const DEFAULT_DRIVER_APP_SETTINGS: DriverAppSettings = { photos_enabled: true, delivery_photo_required: true, expense_enabled: true };

/** CSDL chưa nâng cấp 0052 thì dùng mặc định (như trước) */
export function parseDriverAppSettings(data: unknown): DriverAppSettings {
  const d = (data ?? {}) as Partial<DriverAppSettings>;
  return {
    photos_enabled: d.photos_enabled ?? true,
    delivery_photo_required: d.delivery_photo_required ?? true,
    expense_enabled: d.expense_enabled ?? true,
  };
}
