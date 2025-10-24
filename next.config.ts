import type { NextConfig } from "next";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ibb.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ibb.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "storage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.firebasestorage.app",
        pathname: "/**",
      },
    ],
  },
  webpack(config) {
    const alias = config.resolve?.alias ?? (config.resolve = { ...config.resolve, alias: {} }).alias;

    try {
      require.resolve("@aws-sdk/client-s3");
    } catch {
      // Provide a build-time stub so environments without the SDK can still compile.
      alias["@aws-sdk/client-s3"] = path.resolve(
        __dirname,
        "src/lib/storage/stubs/aws-sdk-client-s3.ts"
      );
    }

    return config;
  },
};

export default nextConfig;
