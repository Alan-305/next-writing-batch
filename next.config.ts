import type { NextConfig } from "next";

// チャンク参照エラー（Cannot find module './NNN.js'）が出たら: npm run clean && npm run dev
const nextConfig: NextConfig = {
  serverExternalPackages: ["@google-cloud/tasks"],
};

export default nextConfig;
