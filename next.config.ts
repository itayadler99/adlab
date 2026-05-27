import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static ships a native binary that must not be bundled by Turbopack;
  // serverExternalPackages keeps it as a runtime `require` from node_modules.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
