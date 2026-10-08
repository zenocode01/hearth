import { cookies } from 'next/headers';
import type { PropsWithChildren } from 'react';

import './globals.css';

import { AppThemeRoot } from '@/components/AppThemeRoot';
import { BootSplash } from '@/components/BootSplash';
import { LEGACY_THEME_COOKIE, THEME_COOKIE, type ThemeMode } from '@/components/theme';

export const metadata = {
  description: '个人 AI 聊天与 Agent 工作台（设计参考 LobeHub）',
  title: 'Hearth',
};

/** 手机端：允许内容延伸到刘海/手势条区域（配合 CSS 的 env(safe-area-inset-*)） */
export const viewport = {
  initialScale: 1,
  viewportFit: 'cover' as const,
  width: 'device-width' as const,
};

function isThemeMode(value: string | undefined): value is ThemeMode {
  return value === 'auto' || value === 'light' || value === 'dark';
}

export default async function RootLayout({ children }: PropsWithChildren) {
  // 服务端读取主题偏好：SSR 与首帧一致，避免水合错配与白闪。
  // 新 cookie（hearth-theme）优先；没有则读旧 cookie（pi-theme，改名前的偏好）
  const cookieStore = await cookies();
  const stored =
    cookieStore.get(THEME_COOKIE)?.value ?? cookieStore.get(LEGACY_THEME_COOKIE)?.value;
  const initialMode: ThemeMode = isThemeMode(stored) ? stored : 'auto';

  return (
    <html data-theme={initialMode} lang="zh-CN" suppressHydrationWarning>
      <body>
        {/* 启动占位：服务端就可见，应用壳挂载后自动隐藏（见 BootSplash） */}
        <BootSplash />
        <AppThemeRoot initialMode={initialMode}>{children}</AppThemeRoot>
      </body>
    </html>
  );
}
