/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint is run separately via `npm run verify`; don't block production builds on it.
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    // Server Actions are enabled by default in Next 15; keep body limit sane for photo uploads later.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
