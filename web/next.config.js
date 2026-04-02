/** @type {import('next').NextConfig} */

// CSP: unsafe-eval is required for Next.js development mode hot reloading
// In production, we use strict CSP without unsafe-inline for scripts
const isDev = process.env.NODE_ENV !== 'production';

const cspHeader = [
  "default-src 'self'",
  // In dev: unsafe-eval for HMR, unsafe-inline for dev tools
  // In prod: no unsafe-inline or unsafe-eval for scripts (XSS protection)
  isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self'",
  // unsafe-inline required for styled-jsx and CSS-in-JS
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.github.com https://*.supabase.co https://api.openai.com https://api.anthropic.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig = {
  reactStrictMode: true,
  // Exclude problematic packages from server component bundling
  // pino uses worker threads which don't work well with Next.js bundler
  experimental: {
    serverComponentsExternalPackages: ['pino', 'pino-pretty', 'thread-stream'],
  },
  // Also add to webpack externals for API routes
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark pino as external to avoid bundling worker threads
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push('pino', 'pino-pretty', 'thread-stream');
      }
    }
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
