/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/customer-portal", destination: "/portal", permanent: true },
      { source: "/customer-portal/dashboard", destination: "/portal", permanent: true },
      { source: "/customer-portal/:path*", destination: "/portal/:path*", permanent: true },
    ];
  },
  reactStrictMode: true,  // workaround for @supabase/ssr 0.10.x NavigatorLock orphaning in React Strict Mode double-mount
  serverExternalPackages: ["pdf2pic", "gm", "dxf", "pdfjs-dist"],
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

