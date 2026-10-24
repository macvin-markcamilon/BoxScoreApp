import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  webpack: (config, { dev }) => {
    if (dev) {
      // Prevent filesystem cache corruption during rapid HMR in dev
      config.cache = {
        type: "memory",
      };
    }
    return config;
  },
};

export default nextConfig;
