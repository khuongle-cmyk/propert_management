/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "villageworks.com",
        pathname: "/wp-content/**",
      },
    ],
  },
};

export default nextConfig;

