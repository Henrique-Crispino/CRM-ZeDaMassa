import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Ignora erros de TypeScript durante o build na Vercel
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
