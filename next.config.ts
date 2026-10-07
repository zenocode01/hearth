import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 允许通过 127.0.0.1 访问 dev 资源（否则 HMR 会被跨域拦截）
  allowedDevOrigins: ['127.0.0.1'],
  // dev 指示器默认在左下角，会压住顶栏标题；挪到右下角
  devIndicators: { position: 'bottom-right' },
};

export default nextConfig;
