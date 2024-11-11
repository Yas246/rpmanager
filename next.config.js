/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  eslint: {
    ignoreDuringBuilds: true,
  },
  headers: async () => {
    return [
      {
        source: "/service-worker.js",
        headers: [
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
