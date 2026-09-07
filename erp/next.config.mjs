/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output for the Docker image, which runs `node server.js`. `next start` cannot
  // serve a standalone build, so local development and the e2e suite use the normal output.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  // Prisma and the Node crypto used for ZATCA signing must not be bundled for the edge.
  serverExternalPackages: ['@prisma/client', 'bullmq', 'ioredis'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Next's runtime needs inline styles; scripts are same-origin only.
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default nextConfig
