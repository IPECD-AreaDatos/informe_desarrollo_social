import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['ssh2', 'mysql2'],
  output: 'standalone',
  basePath: '/desarrollo-social',
};

export default nextConfig;
