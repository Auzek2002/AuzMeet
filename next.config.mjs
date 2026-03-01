/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable strict mode to prevent double-invocation of effects (important for WebRTC)
  reactStrictMode: false,
};

export default nextConfig;
