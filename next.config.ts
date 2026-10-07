import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 允许通过 127.0.0.1 访问 dev 资源（否则 HMR 会被跨域拦截）
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
