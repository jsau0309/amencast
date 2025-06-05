/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
    // If unoptimized is false, domains would be needed:
    // domains: [
    //   "lh3.googleusercontent.com",
    //   "pbs.twimg.com",
    //   "images.unsplash.com",
    //   "logos-world.net",
    // ],
  },
  transpilePackages: [
    '@clerk/nextjs',
    '@clerk/clerk-react',
    '@clerk/shared'
  ],
  // experimental block is removed as it's now empty after moving transpilePackages
};

export default nextConfig;
