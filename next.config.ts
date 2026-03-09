import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ssh2', 'mysql2'],
};

export default nextConfig;
