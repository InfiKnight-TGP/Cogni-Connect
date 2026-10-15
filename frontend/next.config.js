/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '5000',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '5000',
        pathname: '/**',
      },
    ],
  },
  async redirects() {
    return [
      { source: '/faces', destination: '/people', permanent: false },
      { source: '/contacts', destination: '/people', permanent: false },
      { source: '/dashboard', destination: '/progress', permanent: false },
    ]
  },
  async rewrites() {
    return [
      { source: '/platform-api/:path*', destination: 'http://127.0.0.1:5000/platform/:path*' },
      {
        source: '/video_chunks/:path*',
        destination: 'http://127.0.0.1:5000/video_chunks/:path*',
      },
      {
        source: '/known-faces/:path*',
        destination: 'http://127.0.0.1:5000/known-faces/:path*',
      },
    ]
  },
}

module.exports = nextConfig
