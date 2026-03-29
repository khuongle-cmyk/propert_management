/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdf2pic", "gm", "dxf"],
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

