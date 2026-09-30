import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  distDir: process.env.E2E_RUN_DATABASE_NAME ? '.next-e2e' : '.next',
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
};

export default nextConfig;
