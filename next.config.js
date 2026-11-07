/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    // Keep the Postgres driver, dev-store engine, PDF renderer, and Playwright out of the server bundle.
    serverComponentsExternalPackages: [
      'pg',
      '@electric-sql/pglite',
      '@react-pdf/renderer',
      'playwright',
    ],
  },
  async headers() {
    // Clickjacking protection: this app must never be framed by another site.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
