/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    // Keep the Postgres driver and the dev-store engine out of the server bundle.
    serverComponentsExternalPackages: ['pg', '@electric-sql/pglite'],
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
