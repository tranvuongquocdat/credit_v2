import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  compiler: {
    // Giữ console khi `next dev` (NODE_ENV=development), strip khi build, giữ console.error.
    removeConsole:
      process.env.NODE_ENV === "development" ? false : { exclude: ["error"] },
  },
};

export default nextConfig;
