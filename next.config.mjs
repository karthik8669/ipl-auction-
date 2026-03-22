/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [
      "img1.hscicdn.com",
      "ui-avatars.com",
      "lh3.googleusercontent.com",
      "images.unsplash.com",
    ],
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
