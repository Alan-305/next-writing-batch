import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** 開発時のみ: 古い .next チャンク参照（Cannot find module './NNN.js'）が出やすいのを抑える */
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
