import type { NextConfig } from "next";

// Dev-server resources (/_next/*) are only served to these origins. Private-network addresses are included
// so the app can be opened from another computer on the LAN; add more through ALLOWED_DEV_ORIGINS (comma-separated).
const extraDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The dev server is what the team (and chat visitors on the LAN) see; hide the floating "N" dev badge.
  devIndicators: false,
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local", ...extraDevOrigins],
};

export default nextConfig;
