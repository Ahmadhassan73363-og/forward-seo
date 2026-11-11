/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Loaded from node_modules at runtime instead of being bundled (native/binary-heavy packages).
    serverComponentsExternalPackages: ['playwright-core', '@axe-core/playwright', 'axe-core'],
    // Runs instrumentation.ts once at server start (starts the audit scheduler).
    instrumentationHook: true,
  },
};

module.exports = nextConfig;
