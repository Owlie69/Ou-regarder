import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isStaticExport = process.env.STATIC_EXPORT === 'true'

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isStaticExport && {
    output: 'export',
    basePath: '/Ou-regarder',
    trailingSlash: true,
  }),
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
    ],
  },
  webpack(config) {
    if (isStaticExport) {
      // Swap real server actions for no-op stubs so static export succeeds
      config.resolve.alias['@/app/admin/actions'] = path.resolve(
        __dirname,
        'app/admin/actions-static.ts'
      )
    }
    return config
  },
}

export default nextConfig
