/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    // Keep the Postgres driver and the dev-store engine out of the server bundle.
    serverComponentsExternalPackages: ['pg', '@electric-sql/pglite'],
  },
};

module.exports = nextConfig;
