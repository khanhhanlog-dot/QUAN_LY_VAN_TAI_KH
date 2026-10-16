import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ứng dụng quản trị nội bộ: mọi trang phụ thuộc phiên đăng nhập nên luôn render động.
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default nextConfig;
