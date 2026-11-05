import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/** Third-party origins for OCR image pickers (Google Drive Picker + GIS token, Dropbox Chooser). */
const PICKER_SCRIPT_SRC = "https://apis.google.com https://accounts.google.com/gsi/client https://www.dropbox.com";
const PICKER_FRAME_SRC = "https://docs.google.com https://drive.google.com https://accounts.google.com https://www.dropbox.com";
const PICKER_CONNECT_SRC =
  "https://www.googleapis.com https://content.googleapis.com https://*.googleusercontent.com https://dl.dropboxusercontent.com";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "base-uri 'self'",
              "form-action 'self'",
              // Dev: Next/Turbopack may need unsafe-eval. Prod: drop eval to tighten XSS surface.
              isProd
                ? `script-src 'self' 'unsafe-inline' ${PICKER_SCRIPT_SRC}`
                : `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${PICKER_SCRIPT_SRC}`,
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data:",
              `connect-src 'self' ${process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001"} https://accounts.google.com ${PICKER_CONNECT_SRC}`,
              `frame-src 'self' ${PICKER_FRAME_SRC}`,
              "worker-src 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
