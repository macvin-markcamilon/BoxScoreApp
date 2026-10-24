import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  distDir: process.env.NODE_ENV === "production" ? ".next-prod" : ".next",
  webpack: (config, { dev }) => {
    if (dev) {
      // Prevent filesystem cache corruption (__webpack_modules__[moduleId] is not a function) during rapid HMR
      config.cache = {
        type: "memory",
      };
    }
    return config;
  },
};

export default nextConfig;
