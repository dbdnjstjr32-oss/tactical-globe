import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sqlite3", "sqlite"],
  allowedDevOrigins: ["localhost", "127.0.0.1", "localhost:3000", "127.0.0.1:3000"],
  webpack: (config, { dev }) => {
    if (dev && config.watchOptions) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: /[\\/]data[\\/]|\.(db|db-journal|db-wal|db-shm)$|watchcon\.json/
      };
    }
    return config;
  }
};

export default nextConfig;
