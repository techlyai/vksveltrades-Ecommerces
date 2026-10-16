import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  async headers() {
    return [
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }, { key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/orders/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }, { key: 'Referrer-Policy', value: 'no-referrer' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] },
    ];
  },
  async rewrites() {
    const origin = (process.env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${origin}/api/:path*` }];
  },
};
export default (phase) => ({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});
