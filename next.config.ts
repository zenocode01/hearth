import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 允许通过 127.0.0.1 访问 dev 资源（否则 HMR 会被跨域拦截）
  allowedDevOrigins: ['127.0.0.1'],
  // dev 指示器默认在左下角，会压住顶栏标题；挪到右下角
  devIndicators: { position: 'bottom-right' },
  experimental: {
    // 从大 barrel 包里只打进真正用到的模块：dev 编译更快、产物更小
    // （lucide-react / antd 已在 Next 默认清单里）
    optimizePackageImports: ['@lobehub/icons', '@lobehub/ui'],
  },
};

export default nextConfig;
