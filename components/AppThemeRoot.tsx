'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

import type { ThemeMode } from './theme';

/**
 * 关闭 SSR 渲染 @lobehub/ui 主题壳。
 *
 * 原因：antd-style/emotion 在 Next App Router 下服务端与客户端的样式注入方式不一致，
 * 直接 SSR 会触发 React 水合错配（"Hydration failed"），并可能造成首屏闪烁。
 * 本项目是 app 型产品、无 SEO 诉求，与 LobeHub 自身的客户端渲染架构一致。
 * 首屏底色由 globals.css + 服务端渲染的 <html data-theme> 兜底，不会白闪。
 */
const AppThemeProvider = dynamic(() => import('./AppThemeProvider').then((m) => m.AppThemeProvider), {
  ssr: false,
});

interface AppThemeRootProps {
  children: ReactNode;
  initialMode?: ThemeMode;
}

export function AppThemeRoot({ children, initialMode }: AppThemeRootProps) {
  return <AppThemeProvider initialMode={initialMode}>{children}</AppThemeProvider>;
}
